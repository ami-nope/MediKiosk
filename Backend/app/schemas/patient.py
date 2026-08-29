"""Patient schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PatientCreate(BaseModel):
    """Request body for creating/registering a patient."""
    display_name: str = Field(..., min_length=1, max_length=255)
    external_id: str | None = Field(None, max_length=255, description="Mock ABHA-style ID")
    age: int | None = Field(None, ge=0, le=130)
    gender: str | None = Field(None, max_length=20)
    phone: str | None = Field(None, max_length=30)
    address: str | None = Field(None, max_length=500)
    past_illnesses: str | None = Field(None, max_length=1000)
    allergies: str | None = Field(None, max_length=500)
    current_medications: str | None = Field(None, max_length=1000)
    preferred_language: str = Field("en", max_length=10)


class PatientResponse(BaseModel):
    """Response body for a patient."""
    id: str
    display_name: str
    external_id: str | None
    age: int | None = None
    gender: str | None = None
    phone: str | None = None
    address: str | None = None
    past_illnesses: str | None = None
    allergies: str | None = None
    current_medications: str | None = None
    preferred_language: str
    created_at: datetime

    model_config = {"from_attributes": True}

