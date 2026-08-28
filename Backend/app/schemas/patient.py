"""Patient schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PatientCreate(BaseModel):
    """Request body for creating/registering a patient."""
    display_name: str = Field(..., min_length=1, max_length=255)
    external_id: str | None = Field(None, max_length=255, description="Mock ABHA-style ID")
    preferred_language: str = Field("en", max_length=10)


class PatientResponse(BaseModel):
    """Response body for a patient."""
    id: str
    display_name: str
    external_id: str | None
    preferred_language: str
    created_at: datetime

    model_config = {"from_attributes": True}
