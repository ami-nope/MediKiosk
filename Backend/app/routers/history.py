"""History routes — submit messages and retrieve transcripts."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_llm_provider
from app.providers.llm.base import LLMProvider
from app.schemas.history import HistoryMessageResponse, HistoryMessageSubmit, HistoryResponse
from app.services import history_service

router = APIRouter(prefix="/sessions/{session_id}/history", tags=["History"])


@router.post("", response_model=HistoryMessageResponse)
async def submit_message(
    session_id: str,
    data: HistoryMessageSubmit,
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
) -> HistoryMessageResponse:
    """
    Submit a patient message into the session's conversation.

    Calls the LLM provider's chat() method using a placeholder message
    builder. The clinical question logic is NOT implemented here — see
    app/placeholders/clinical.py → build_history_messages().
    """
    assistant_reply, is_priority, intake_complete, provider, fallback_reason = await history_service.submit_message(
        db, session_id, data.message, llm,
    )
    return HistoryMessageResponse(
        session_id=session_id,
        assistant_reply=assistant_reply,
        provider=provider,
        fallback_reason=fallback_reason,
        is_priority=is_priority,
        intake_complete=intake_complete,
    )


@router.get("", response_model=HistoryResponse)
async def get_history(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> HistoryResponse:
    """Retrieve the full transcript and structured data for a session."""
    result = await history_service.get_history(db, session_id)
    return HistoryResponse(**result)
