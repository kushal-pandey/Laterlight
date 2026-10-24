from app.services.ai_provider import DemoProvider


def test_demo_provider_extracts_invoice_data() -> None:
    result = DemoProvider().extract(
        "Invoice from Northwind Labs due on December 18, 2026. Total amount is $1240.00. Please review before the deadline."
    )

    assert result.document_type == "invoice"
    assert result.action_title == "Invoice review"
    assert result.due_date == "2026-12-18"
    assert result.amount == 1240.0
    assert result.currency == "USD"
    assert result.priority in {"high", "medium", "low"}
    assert "follow_up_draft" in result.model_dump()
    assert result.evidence.source_excerpt is not None
