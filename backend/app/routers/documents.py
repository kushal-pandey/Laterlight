from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_db
from app.models import Action, Document
from app.schemas import ActionOut, DocumentOut
from app.services.ai_provider import (
    DemoProvider,
    ProviderError,
    TinkerProvider,
    sanitize_document_text,
)

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])
settings = get_settings()

ALLOWED_TYPES = {
    "text/plain",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024


@router.get("", response_model=list[DocumentOut])
def list_documents(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .all()
    )


@router.post(
    "",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw_bytes = await file.read()
    filename = file.filename or "uploaded-document"
    content_type = file.content_type or "application/octet-stream"

    if len(raw_bytes) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File exceeds the upload limit",
        )

    extension_allowed = filename.lower().endswith((".txt", ".pdf", ".docx"))

    if content_type not in ALLOWED_TYPES and not extension_allowed:
        raise HTTPException(
            status_code=400,
            detail="Unsupported document type",
        )

    if filename.lower().endswith(".pdf") and raw_bytes[:5] != b"%PDF-":
        raise HTTPException(
            status_code=400,
            detail="PDF signature mismatch",
        )

    if filename.lower().endswith(".txt"):
        try:
            text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = raw_bytes.decode("utf-8", errors="replace")
    else:
        # PDF and DOCX extraction is not implemented here yet.
        text = "Uploaded document accepted for summary extraction."

    document = Document(
        user_id=current_user.id,
        filename=filename,
        content_type=content_type,
        size_bytes=len(raw_bytes),
        status="pending",
        summary="Queued for extraction",
        extracted_text=sanitize_document_text(text),
        created_at=datetime.utcnow(),
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    return document


@router.post("/{document_id}/process")
async def process_document(
    document_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
        .first()
    )

    if document is None:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    text = document.extracted_text or "Uploaded file reference received."

    provider = (
        TinkerProvider()
        if settings.TINKER_API_KEY
        else DemoProvider()
    )

    try:
        if isinstance(provider, TinkerProvider):
            result = await provider.extract(text)
        else:
            result = provider.extract(text)

    except ProviderError as exc:
        document.status = "failed"
        document.summary = str(exc)
        db.commit()

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from None

    # Persist the document's latest extraction.
    document.status = "processed"
    document.summary = result.summary or result.action_title
    document.json_payload = result.model_dump_json()

    # Use the new actions array. The legacy fields remain available for
    # backward compatibility with existing API clients.
    extracted_actions = result.actions

    if not extracted_actions:
        # Defensive fallback for a result containing only legacy fields.
        from app.schemas import ExtractedAction

        extracted_actions = [
            ExtractedAction(
                title=result.action_title or document.filename,
                description=result.action_description or result.summary,
                due_date=result.due_date,
                amount=result.amount,
                currency=result.currency,
                counterparty=result.counterparty,
                category=result.category,
                priority=result.priority,
                evidence=result.evidence,
            )
        ]

    existing_actions = (
        db.query(Action)
        .filter(
            Action.document_id == document.id,
            Action.user_id == current_user.id,
        )
        .order_by(Action.id.asc())
        .all()
    )

    # Index existing actions by normalized title. Keep the first record
    # for each title so reprocessing updates records rather than duplicating
    # actions with the same title.
    existing_by_title: dict[str, Action] = {}

    for existing in existing_actions:
        normalized_title = (existing.title or "").strip().casefold()

        if normalized_title and normalized_title not in existing_by_title:
            existing_by_title[normalized_title] = existing

    now = datetime.utcnow()
    processed_actions: list[Action] = []
    active_titles: set[str] = set()

    for extracted in extracted_actions:
        title = extracted.title.strip() or document.filename
        normalized_title = title.casefold()
        active_titles.add(normalized_title)

        action = existing_by_title.get(normalized_title)

        if action is None:
            action = Action(
                user_id=current_user.id,
                document_id=document.id,
                title=title,
                description=extracted.description,
                category=extracted.category,
                priority=extracted.priority,
                status="suggested",
                due_date=(
                    datetime.fromisoformat(extracted.due_date)
                    if extracted.due_date
                    else None
                ),
                amount=extracted.amount,
                currency=extracted.currency,
                counterparty=extracted.counterparty,
                source_excerpt=extracted.evidence.source_excerpt,
                evidence_json=extracted.model_dump_json(),
                created_at=now,
                updated_at=now,
            )
            db.add(action)

        else:
            # Refresh the extracted details while preserving a user's
            # existing workflow status unless the action was superseded.
            action.title = title
            action.description = extracted.description
            action.category = extracted.category
            action.priority = extracted.priority
            action.due_date = (
                datetime.fromisoformat(extracted.due_date)
                if extracted.due_date
                else None
            )
            action.amount = extracted.amount
            action.currency = extracted.currency
            action.counterparty = extracted.counterparty
            action.source_excerpt = extracted.evidence.source_excerpt
            action.evidence_json = extracted.model_dump_json()
            action.updated_at = now

            if action.status == "superseded":
                action.status = "suggested"

        processed_actions.append(action)

    # Keep old rows for history and related drafts, but make actions that
    # disappeared from the latest extraction inactive.
    for existing in existing_actions:
        normalized_title = (existing.title or "").strip().casefold()

        if normalized_title not in active_titles:
            existing.status = "superseded"
            existing.updated_at = now

    db.commit()

    # Refresh generated IDs and database values after the commit.
    for action in processed_actions:
        db.refresh(action)

    db.refresh(document)

    return {
        "document": DocumentOut.model_validate(document),
        "action": (
            ActionOut.model_validate(processed_actions[0])
            if processed_actions
            else None
        ),
        "actions": [
            ActionOut.model_validate(action)
            for action in processed_actions
        ],
        "result": result.model_dump(),
    }


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
        .first()
    )

    if document is None:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    db.delete(document)
    db.commit()

    return {
        "deleted": True,
        "document_id": document_id,
    }
