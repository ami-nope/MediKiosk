"""Consent service — records patient consent per session."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consent_log import ConsentLog
from app.services.session_service import get_session


async def record_consent(
    db: AsyncSession,
    session_id: str,
    consented: bool,
) -> ConsentLog:
    """Record a consent decision for a session."""
    # Validate session exists
    await get_session(db, session_id)

    consent = ConsentLog(
        session_id=session_id,
        consented=consented,
    )
    db.add(consent)
    await db.flush()
    await db.refresh(consent)
    return consent
