"""Health-check schemas."""

from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response body for the health-check endpoint."""
    status: str
    llm_provider: str
    llm_reachable: bool
    llm_error: str | None = None
