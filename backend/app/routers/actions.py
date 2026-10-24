from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Action, Draft
from app.schemas import ActionCreate, ActionOut, DraftCreate, DraftOut

router = APIRouter(prefix="/api/v1/actions", tags=["actions"])


@router.get("", response_model=list[ActionOut])
def list_actions(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    status: str | None = Query(None),
    priority: str | None = Query(None),
):
    query = db.query(Action).filter(Action.user_id == current_user.id)
    if status:
        query = query.filter(Action.status == status)
    if priority:
        query = query.filter(Action.priority == priority)
    return query.order_by(Action.updated_at.desc()).all()


@router.post("", response_model=ActionOut)
def create_action(payload: ActionCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    action = Action(
        user_id=current_user.id,
        document_id=payload.document_id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        priority=payload.priority,
        status="suggested",
        due_date=payload.due_date,
        amount=payload.amount,
        currency=payload.currency,
        counterparty=payload.counterparty,
        source_excerpt=payload.source_excerpt,
        evidence_json="{}",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


@router.patch("/{action_id}", response_model=ActionOut)
def update_action(action_id: int, payload: ActionCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    action = db.query(Action).filter(Action.id == action_id, Action.user_id == current_user.id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(action, field, value)
    action.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(action)
    return action


@router.post("/{action_id}/draft", response_model=DraftOut)
def create_draft(action_id: int, payload: DraftCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    action = db.query(Action).filter(Action.id == action_id, Action.user_id == current_user.id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    draft = Draft(
        user_id=current_user.id,
        action_id=action.id,
        kind=payload.kind,
        subject=payload.subject,
        content=payload.content,
        status=payload.status,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft
