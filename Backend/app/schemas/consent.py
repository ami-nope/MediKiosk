"""Consent schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ConsentCreate(BaseModel):
    """Request body for recording consent."""
    consented: bool


class ConsentResponse(BaseModel):
    """Response body for a consent record."""
    id: str
    session_id: str
    consented: bool
    consented_at: datetime

    model_config = {"from_attributes": True}
