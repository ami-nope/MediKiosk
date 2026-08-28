"""Document schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    """Response body for a document."""
    id: str
    session_id: str
    file_path: str
    ocr_text: str | None
    structured_json: dict[str, Any] | None
    uploaded_at: datetime

    model_config = {"from_attributes": True}
