"""Session schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.session import SessionStatus


class SessionCreate(BaseModel):
    """Request body for starting a new session."""
    patient_id: str


class SessionResponse(BaseModel):
    """Response body for a session."""
    id: str
    patient_id: str
    status: SessionStatus
    is_priority: bool
    started_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class SessionListParams(BaseModel):
    """Query parameters for listing sessions."""
    status: SessionStatus | None = None
    is_priority: bool | None = None


class SummaryRequest(BaseModel):
    """Request body for generating a summary (placeholder — no clinical prompt content)."""
    pass  # No fields needed; the service reads the session's history internally


class SummaryUpdateRequest(BaseModel):
    """Request body for doctor edits to the summary."""
    structured_json: dict[str, Any] = Field(
        ..., description="Doctor-reviewed/edited structured clinical summary",
    )


class SummaryResponse(BaseModel):
    """Response body containing the structured summary."""
    session_id: str
    status: SessionStatus
    structured_json: dict[str, Any] | None

    model_config = {"from_attributes": True}
