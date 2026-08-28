"""History schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class HistoryMessageSubmit(BaseModel):
    """Request body for submitting a patient message into the conversation."""
    message: str = Field(..., min_length=1, description="Patient's answer / message text")


class HistoryMessageResponse(BaseModel):
    """Response returned after the LLM processes a message."""
    session_id: str
    assistant_reply: str
    provider: str | None = Field(
        None, description="Provider that produced the assistant reply",
    )
    fallback_reason: str | None = Field(
        None, description="Reason earlier providers were skipped or failed before this reply",
    )
    is_priority: bool = Field(
        False, description="True if red-flag detection triggered",
    )
    intake_complete: bool = Field(
        False, description="True when history intake should advance to the next step",
    )


class HistoryResponse(BaseModel):
    """Full history for a session."""
    session_id: str
    raw_transcript: list[dict[str, Any]]
    structured_json: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
