"""Consent routes — record patient consent for a session."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas.consent import ConsentCreate, ConsentResponse
from app.services import consent_service

router = APIRouter(prefix="/sessions/{session_id}/consent", tags=["Consent"])


@router.post("", response_model=ConsentResponse, status_code=201)
async def record_consent(
    session_id: str,
    data: ConsentCreate,
    db: AsyncSession = Depends(get_db),
) -> ConsentResponse:
    """Record a consent decision for the session."""
    consent = await consent_service.record_consent(db, session_id, data.consented)
    return ConsentResponse.model_validate(consent)
