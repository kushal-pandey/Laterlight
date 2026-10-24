import os
from uuid import uuid4

os.environ.setdefault("DATABASE_URL", "sqlite:///./laterlight_test.db")

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import AIExtractionResult, ExtractedAction
from app.routers import documents as documents_router
from app.services.ai_provider import ProviderError
from app.db import SessionLocal
from app.models import Action

client = TestClient(app)


def register_and_login(prefix: str) -> dict[str, str]:
    """Create a unique test user and return authorization headers."""
    email = f"{prefix}-{uuid4()}@example.com"

    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "full_name": "Test User",
        },
    )
    assert register_response.status_code == 201, register_response.text

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "securepass123"},
    )
    assert login_response.status_code == 200, login_response.text

    return {
        "Authorization": f"Bearer {login_response.json()['access_token']}"
    }


def upload_document(headers: dict[str, str], text: str) -> int:
    """Upload a text document and return its ID."""
    response = client.post(
        "/api/v1/documents",
        headers=headers,
        files={
            "file": (
                f"test-{uuid4()}.txt",
                text.encode("utf-8"),
                "text/plain",
            )
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def make_extraction(
    actions: list[ExtractedAction],
) -> AIExtractionResult:
    """Build a consistent extraction result for mocked provider tests."""
    first_action = actions[0]

    return AIExtractionResult(
        document_type="invoice",
        summary="Northwind Labs invoice requiring follow-up.",
        action_title=first_action.title,
        action_description=first_action.description,
        due_date=first_action.due_date,
        amount=first_action.amount,
        currency=first_action.currency,
        counterparty=first_action.counterparty,
        category=first_action.category,
        priority=first_action.priority,
        recommended_next_step="Review the invoice and complete the required follow-up.",
        follow_up_draft=None,
        confidence=0.95,
        evidence={
            "source_excerpt": first_action.evidence.source_excerpt,
            "page_numbers": first_action.evidence.page_numbers,
        },
        actions=actions,
    )


def make_actions(
    *,
    review_description: str = "Confirm the invoice details and payment due date.",
    review_evidence: str = "Invoice from Northwind Labs",
    include_total: bool = True,
    include_deadline: bool = True,
) -> list[ExtractedAction]:
    """Create deterministic action sets for persistence and reprocessing tests."""
    actions = [
        ExtractedAction(
            title="Review Northwind Labs invoice",
            description=review_description,
            due_date="2026-12-18",
            amount=1240.0,
            currency="USD",
            counterparty="Northwind Labs",
            category="finance",
            priority="high",
            evidence={
                "source_excerpt": review_evidence,
                "page_numbers": [],
            },
        )
    ]

    if include_total:
        actions.append(
            ExtractedAction(
                title="Verify invoice total",
                description="Verify the stated invoice total.",
                due_date=None,
                amount=1240.0,
                currency="USD",
                counterparty="Northwind Labs",
                category="finance",
                priority="medium",
                evidence={
                    "source_excerpt": "Total amount is $1240.00",
                    "page_numbers": [],
                },
            )
        )

    if include_deadline:
        actions.append(
            ExtractedAction(
                title="Confirm payment deadline",
                description="Confirm the invoice payment deadline.",
                due_date="2026-12-18",
                amount=None,
                currency="USD",
                counterparty="Northwind Labs",
                category="finance",
                priority="medium",
                evidence={
                    "source_excerpt": "Payment is due on December 18, 2026",
                    "page_numbers": [],
                },
            )
        )

    return actions


def process_document(document_id: int, headers: dict[str, str]):
    return client.post(
        f"/api/v1/documents/{document_id}/process",
        headers=headers,
    )


def read_document_actions(document_id: int) -> list[Action]:
    """Read persisted actions using the application's configured database."""
    db = SessionLocal()
    try:
        return (
            db.query(Action)
            .filter(Action.document_id == document_id)
            .order_by(Action.id)
            .all()
        )
    finally:
        db.close()


def test_health_live() -> None:
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_register_and_login() -> None:
    headers = register_and_login("alex")
    assert headers["Authorization"].startswith("Bearer ")


def test_document_processing_uses_mocked_tinker_result(monkeypatch) -> None:
    headers = register_and_login("tinker")

    monkeypatch.setattr(
        documents_router.settings,
        "TINKER_API_KEY",
        "test-api-key",
    )

    async def mocked_extract(self, text: str) -> AIExtractionResult:
        assert isinstance(self, documents_router.TinkerProvider)
        assert "Invoice from Northwind Labs" in text

        return make_extraction(
            [
                ExtractedAction(
                    title="Review Northwind Labs invoice",
                    description=(
                        "Confirm the invoice details and payment due date."
                    ),
                    due_date="2026-12-18",
                    amount=1240.0,
                    currency="USD",
                    counterparty="Northwind Labs",
                    category="finance",
                    priority="high",
                    evidence={
                        "source_excerpt": "Invoice from Northwind Labs",
                        "page_numbers": [],
                    },
                )
            ]
        )

    monkeypatch.setattr(
        documents_router.TinkerProvider,
        "extract",
        mocked_extract,
    )

    document_id = upload_document(
        headers,
        "Invoice from Northwind Labs. Total amount is $1240.00.",
    )

    response = process_document(document_id, headers)

    assert response.status_code == 200, response.text

    payload = response.json()

    assert payload["document"]["status"] == "processed"
    assert payload["action"]["title"] == "Review Northwind Labs invoice"
    assert (
        payload["action"]["source_excerpt"]
        == "Invoice from Northwind Labs"
    )
    assert payload["result"]["amount"] == 1240.0
    assert len(payload["actions"]) == 1
    assert "test-api-key" not in response.text


def test_document_processing_persists_multiple_actions(monkeypatch) -> None:
    headers = register_and_login("multi-action")

    monkeypatch.setattr(
        documents_router.settings,
        "TINKER_API_KEY",
        "test-api-key",
    )

    expected_actions = make_actions()

    async def mocked_extract(self, text: str) -> AIExtractionResult:
        assert "Northwind Labs" in text
        return make_extraction(expected_actions)

    monkeypatch.setattr(
        documents_router.TinkerProvider,
        "extract",
        mocked_extract,
    )

    document_id = upload_document(
        headers,
        (
            "Invoice from Northwind Labs. "
            "Total amount is $1240.00. "
            "Payment is due on December 18, 2026."
        ),
    )

    response = process_document(document_id, headers)

    assert response.status_code == 200, response.text

    payload = response.json()
    expected_titles = {
        "Review Northwind Labs invoice",
        "Verify invoice total",
        "Confirm payment deadline",
    }

    assert payload["document"]["status"] == "processed"
    assert len(payload["actions"]) == 3
    assert {action["title"] for action in payload["actions"]} == expected_titles
    assert payload["action"]["title"] == "Review Northwind Labs invoice"

    response_by_title = {
        action["title"]: action for action in payload["actions"]
    }

    assert (
        response_by_title["Review Northwind Labs invoice"]["source_excerpt"]
        == "Invoice from Northwind Labs"
    )
    assert (
        response_by_title["Verify invoice total"]["source_excerpt"]
        == "Total amount is $1240.00"
    )
    assert (
        response_by_title["Confirm payment deadline"]["source_excerpt"]
        == "Payment is due on December 18, 2026"
    )

    saved_actions = read_document_actions(document_id)

    assert len(saved_actions) == 3
    assert {action.title for action in saved_actions} == expected_titles

    saved_by_title = {action.title: action for action in saved_actions}

    assert (
        saved_by_title["Review Northwind Labs invoice"].source_excerpt
        == "Invoice from Northwind Labs"
    )
    assert (
        saved_by_title["Verify invoice total"].source_excerpt
        == "Total amount is $1240.00"
    )
    assert (
        saved_by_title["Confirm payment deadline"].source_excerpt
        == "Payment is due on December 18, 2026"
    )


def test_document_reprocessing_updates_actions_without_duplicates(
    monkeypatch,
) -> None:
    headers = register_and_login("reprocess")

    monkeypatch.setattr(
        documents_router.settings,
        "TINKER_API_KEY",
        "test-api-key",
    )

    first_actions = make_actions()
    updated_actions = make_actions(
        review_description="Review the invoice and verify the latest details.",
        review_evidence="Updated invoice from Northwind Labs",
    )
    extraction_state = {"actions": first_actions}

    async def mocked_extract(self, text: str) -> AIExtractionResult:
        return make_extraction(extraction_state["actions"])

    monkeypatch.setattr(
        documents_router.TinkerProvider,
        "extract",
        mocked_extract,
    )

    document_id = upload_document(
        headers,
        (
            "Invoice from Northwind Labs. "
            "Total amount is $1240.00. "
            "Payment is due on December 18, 2026."
        ),
    )

    first_response = process_document(document_id, headers)
    assert first_response.status_code == 200, first_response.text

    first_saved = read_document_actions(document_id)
    assert len(first_saved) == 3

    first_ids = {action.id for action in first_saved}
    assert len(first_ids) == 3

    extraction_state["actions"] = updated_actions

    second_response = process_document(document_id, headers)
    assert second_response.status_code == 200, second_response.text

    second_saved = read_document_actions(document_id)
    assert len(second_saved) == 3

    second_ids = {action.id for action in second_saved}
    assert second_ids == first_ids

    updated_review = next(
        action
        for action in second_saved
        if action.title == "Review Northwind Labs invoice"
    )

    assert (
        updated_review.description
        == "Review the invoice and verify the latest details."
    )
    assert updated_review.source_excerpt == "Updated invoice from Northwind Labs"


def test_document_reprocessing_supersedes_removed_actions(
    monkeypatch,
) -> None:
    headers = register_and_login("supersede")

    monkeypatch.setattr(
        documents_router.settings,
        "TINKER_API_KEY",
        "test-api-key",
    )

    extraction_state = {"actions": make_actions()}

    async def mocked_extract(self, text: str) -> AIExtractionResult:
        return make_extraction(extraction_state["actions"])

    monkeypatch.setattr(
        documents_router.TinkerProvider,
        "extract",
        mocked_extract,
    )

    document_id = upload_document(
        headers,
        (
            "Invoice from Northwind Labs. "
            "Total amount is $1240.00. "
            "Payment is due on December 18, 2026."
        ),
    )

    first_response = process_document(document_id, headers)
    assert first_response.status_code == 200, first_response.text

    first_saved = read_document_actions(document_id)
    assert len(first_saved) == 3

    first_ids_by_title = {
        action.title: action.id for action in first_saved
    }

    # The updated extraction no longer contains the payment-deadline action.
    extraction_state["actions"] = make_actions(include_deadline=False)

    second_response = process_document(document_id, headers)
    assert second_response.status_code == 200, second_response.text

    payload = second_response.json()
    assert len(payload["actions"]) == 2

    saved_actions = read_document_actions(document_id)

    # Superseded actions remain in the database for history.
    assert len(saved_actions) == 3

    saved_by_title = {action.title: action for action in saved_actions}

    assert (
        saved_by_title["Review Northwind Labs invoice"].id
        == first_ids_by_title["Review Northwind Labs invoice"]
    )
    assert (
        saved_by_title["Verify invoice total"].id
        == first_ids_by_title["Verify invoice total"]
    )
    assert (
        saved_by_title["Confirm payment deadline"].id
        == first_ids_by_title["Confirm payment deadline"]
    )

    assert (
        saved_by_title["Confirm payment deadline"].status
        == "superseded"
    )


def test_document_processing_preserves_sanitized_tinker_502(
    monkeypatch,
) -> None:
    headers = register_and_login("tinker-error")

    monkeypatch.setattr(
        documents_router.settings,
        "TINKER_API_KEY",
        "test-api-key",
    )

    async def failed_extract(self, text: str) -> AIExtractionResult:
        raise ProviderError("Tinker network request failed.")

    monkeypatch.setattr(
        documents_router.TinkerProvider,
        "extract",
        failed_extract,
    )

    document_id = upload_document(
        headers,
        "Private appointment details",
    )

    response = process_document(document_id, headers)

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Tinker network request failed."
    }
    assert "test-api-key" not in response.text
    assert "Private appointment details" not in response.text
