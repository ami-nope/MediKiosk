"""Session routes — create, list, retrieve sessions and summary endpoints."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.session import SessionStatus
from app.schemas.session import (
    SessionCreate,
    SessionResponse,
    SummaryResponse,
    SummaryUpdateRequest,
)
from app.services import session_service, summary_service

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Start a new kiosk session for a patient."""
    session = await session_service.create_session(db, data.patient_id)
    return SessionResponse.model_validate(session)


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    status: SessionStatus | None = Query(None, description="Filter by session status"),
    is_priority: bool | None = Query(None, description="Filter by priority flag"),
    db: AsyncSession = Depends(get_db),
) -> list[SessionResponse]:
    """List sessions (doctor dashboard queue), filterable by status and priority."""
    sessions = await session_service.list_sessions(db, status=status, is_priority=is_priority)
    return [SessionResponse.model_validate(s) for s in sessions]


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Retrieve a session by ID."""
    session = await session_service.get_session(db, session_id)
    return SessionResponse.model_validate(session)


@router.post("/{session_id}/summary", response_model=SummaryResponse)
async def generate_summary(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> SummaryResponse:
    """
    Queue structured clinical summary generation for the session.

    The kiosk gets an immediate response so the next patient can start while
    the AI report is produced in the background.
    """
    result = await summary_service.enqueue_summary_generation(db, session_id)
    background_tasks.add_task(summary_service.generate_summary_background, session_id)
    return SummaryResponse(**result)


@router.patch("/{session_id}/summary", response_model=SummaryResponse)
async def update_summary(
    session_id: str,
    data: SummaryUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> SummaryResponse:
    """Doctor edits/confirms the summary and completes the session."""
    result = await summary_service.update_summary(db, session_id, data.structured_json)
    return SummaryResponse(**result)
