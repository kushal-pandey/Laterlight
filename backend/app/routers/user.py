from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Preference
from app.schemas import UserPreference

router = APIRouter(prefix="/api/v1/user", tags=["user"])


@router.get("/preferences")
def get_preferences(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    preference = db.query(Preference).filter(Preference.user_id == current_user.id).first()
    if not preference:
        preference = Preference(user_id=current_user.id)
        db.add(preference)
        db.commit()
        db.refresh(preference)
    return preference


@router.put("/preferences")
def update_preferences(payload: UserPreference, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    preference = db.query(Preference).filter(Preference.user_id == current_user.id).first()
    if not preference:
        preference = Preference(user_id=current_user.id)
        db.add(preference)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(preference, field, value)
    db.commit()
    db.refresh(preference)
    return preference


@router.get("/export")
def export_data(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "user": current_user.email,
        "documents": len(db.query(current_user.__class__).all()),
        "status": "export-ready",
    }
