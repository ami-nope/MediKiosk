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


class DocumentOCRResponse(BaseModel):
    """Rich response body for OCR document processing."""
    id: str
    session_id: str
    file_path: str
    ocr_text: str
    structured_json: dict[str, Any]
    uploaded_at: datetime
    ocr_blocks: list[dict[str, Any]] = []
    average_confidence: float = 0.0
    engine: str = "easyocr_cpu"
    uncertain_items: list[dict[str, Any]] = []

    model_config = {"from_attributes": True}

