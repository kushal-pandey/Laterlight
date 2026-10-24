
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Action, Document, User
from app.schemas import DashboardStats

router = APIRouter(prefix="/api/v1", tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_actions = db.query(Action).filter(
        Action.user_id == current_user.id
    )

    total_documents = (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .count()
    )

    total_actions = user_actions.count()

    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    due_soon_limit = today + timedelta(days=7)
    month_start = today.replace(day=1)

    overdue = (
        db.query(Action)
        .filter(
            Action.user_id == current_user.id,
            Action.due_date.isnot(None),
            Action.due_date < today,
            Action.status != "completed",
        )
        .count()
    )

    due_soon = (
        db.query(Action)
        .filter(
            Action.user_id == current_user.id,
            Action.due_date.isnot(None),
            Action.due_date >= today,
            Action.due_date <= due_soon_limit,
            Action.status != "completed",
        )
        .count()
    )

    completed_this_month = (
        db.query(Action)
        .filter(
            Action.user_id == current_user.id,
            Action.status == "completed",
            Action.updated_at >= month_start,
        )
        .count()
    )

    return DashboardStats(
        total_documents=total_documents,
        total_actions=total_actions,
        due_soon=due_soon,
        overdue=overdue,
        completed_this_month=completed_this_month,
        demo_mode=not bool(current_user.email),
    )
