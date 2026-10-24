from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentUpload(BaseModel):
    filename: str
    content_type: str
    size_bytes: int


class DocumentOut(BaseModel):
    id: int
    user_id: int
    filename: str
    content_type: str
    size_bytes: int
    status: str
    summary: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExtractionEvidence(BaseModel):
    source_excerpt: str | None
    page_numbers: list[str]

    model_config = ConfigDict(extra="forbid")

    @field_validator("source_excerpt")
    @classmethod
    def validate_source_excerpt(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("source_excerpt must be non-empty or null")
        return value


class ExtractedAction(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=2000)
    due_date: str | None = None
    amount: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=1, max_length=10)
    counterparty: str | None = Field(default=None, min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=100)
    priority: Literal["high", "medium", "low"]
    evidence: ExtractionEvidence

    model_config = ConfigDict(extra="forbid")

    @field_validator("title", "description", "category")
    @classmethod
    def validate_action_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("action text fields must be non-empty")
        return cleaned

    @field_validator("due_date")
    @classmethod
    def validate_action_due_date(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                datetime.strptime(value, "%Y-%m-%d")
            except ValueError as exc:
                raise ValueError("due_date must use YYYY-MM-DD format") from exc
        return value

    @field_validator("amount", mode="before")
    @classmethod
    def validate_action_amount(cls, value: Any) -> Any:
        if value is not None and (
            isinstance(value, bool) or not isinstance(value, (int, float))
        ):
            raise ValueError("action amount must be a JSON number")
        return value



class AIExtractionResult(BaseModel):
    document_type: Literal["invoice", "notice", "contract", "receipt", "email", "letter", "other"]
    summary: str = Field(min_length=1, max_length=1000)
    action_title: str = Field(min_length=1, max_length=255)
    action_description: str = Field(min_length=1, max_length=2000)
    actions: list[ExtractedAction] = Field(min_length=1, max_length=25)
    due_date: str | None
    amount: float | None = Field(ge=0)
    currency: str | None = Field(min_length=1, max_length=10)
    counterparty: str | None = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=100)
    priority: Literal["high", "medium", "low"]
    recommended_next_step: str = Field(min_length=1, max_length=1000)
    follow_up_draft: str | None = Field(min_length=1, max_length=4000)
    confidence: float = Field(ge=0, le=1)
    evidence: ExtractionEvidence

    model_config = ConfigDict(extra="forbid")

    @field_validator("summary", "action_title", "action_description", "category", "recommended_next_step")
    @classmethod
    def validate_non_empty_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("extraction text fields must be non-empty")
        return cleaned

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                datetime.strptime(value, "%Y-%m-%d")
            except ValueError as exc:
                raise ValueError("due_date must use YYYY-MM-DD format") from exc
        return value

    @field_validator("amount", "confidence", mode="before")
    @classmethod
    def validate_numeric_output(cls, value: Any) -> Any:
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
            raise ValueError("numeric extraction fields must be JSON numbers")
        return value


class ActionCreate(BaseModel):
    title: str
    description: str
    category: str = "general"
    priority: str = "medium"
    due_date: datetime | None = None
    amount: float | None = None
    currency: str | None = None
    counterparty: str | None = None
    source_excerpt: str | None = None
    document_id: int | None = None


class ActionOut(BaseModel):
    id: int
    user_id: int
    document_id: int | None = None
    title: str
    description: str
    category: str
    priority: str
    status: str
    due_date: datetime | None = None
    amount: float | None = None
    currency: str | None = None
    counterparty: str | None = None
    source_excerpt: str | None = None
    evidence_json: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DraftCreate(BaseModel):
    action_id: int | None = None
    kind: str = "follow_up"
    subject: str = "Follow up"
    content: str
    status: str = "draft"


class DraftOut(BaseModel):
    id: int
    user_id: int
    action_id: int | None = None
    kind: str
    subject: str
    content: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserPreference(BaseModel):
    timezone: str = "UTC"
    email_reminders_enabled: bool = True
    privacy_mode: str = "standard"


class DashboardStats(BaseModel):
    total_documents: int
    total_actions: int
    due_soon: int
    overdue: int
    completed_this_month: int
    demo_mode: bool
