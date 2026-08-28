"""Session service — create, retrieve, and list kiosk sessions."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models.history_record import HistoryRecord
from app.models.session import Session, SessionStatus
from app.services.patient_service import get_patient


async def create_session(db: AsyncSession, patient_id: str) -> Session:
    """
    Start a new kiosk session for a patient.

    Also creates the associated HistoryRecord (one per session) with an
    empty transcript, ready to accumulate messages.
    """
    # Validate the patient exists
    await get_patient(db, patient_id)

    session = Session(patient_id=patient_id)
    db.add(session)
    await db.flush()

    # Create the empty history record for this session
    history = HistoryRecord(session_id=session.id)
    db.add(history)
    await db.flush()

    await db.refresh(session)
    return session


async def get_session(db: AsyncSession, session_id: str) -> Session:
    """Fetch a session by ID or raise NotFoundError."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if session is None:
        raise NotFoundError("Session", session_id)
    return session


async def list_sessions(
    db: AsyncSession,
    status: SessionStatus | None = None,
    is_priority: bool | None = None,
) -> list[Session]:
    """
    List sessions with optional filters.

    Used by the doctor dashboard queue to view pending / priority sessions.
    """
    stmt = select(Session).order_by(Session.started_at.asc())

    if status is not None:
        stmt = stmt.where(Session.status == status)
    if is_priority is not None:
        stmt = stmt.where(Session.is_priority == is_priority)

    result = await db.execute(stmt)
    return list(result.scalars().all())
