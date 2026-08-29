"""Document service — file storage, OCR processing, and AI structured medical extraction."""

from __future__ import annotations

import logging
import os
import uuid
from typing import Any

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.exceptions import BadRequestError
from app.models.document import Document
from app.providers.llm.base import LLMProvider
from app.services.ocr_ai_service import extract_medical_data_with_ai
from app.services.ocr_service import (
    ImageValidationError,
    run_ocr_extraction,
    validate_and_load_image,
)
from app.services.session_service import get_session

logger = logging.getLogger(__name__)


async def upload_document(
    db: AsyncSession,
    session_id: str,
    file: UploadFile,
    llm: LLMProvider | None = None,
) -> Document:
    """Save an uploaded file to disk and run OCR extraction."""
    session = await get_session(db, session_id)

    settings = get_settings()
    upload_dir = os.path.join(settings.UPLOAD_DIR, session_id)
    os.makedirs(upload_dir, exist_ok=True)

    # Generate a unique filename to avoid collisions
    ext = os.path.splitext(file.filename or "doc.jpg")[1]
    if not ext:
        ext = ".jpg"
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, unique_name)

    # Read and validate content
    content = await file.read()
    if not content:
        raise BadRequestError("Empty file uploaded.")

    # Write original file to disk safely
    with open(file_path, "wb") as f:
        f.write(content)

    # Attempt OCR extraction
    ocr_text = ""
    structured_json: dict[str, Any] = {}

    try:
        ocr_result = await run_ocr_extraction(content)
        ocr_text = ocr_result.get("text", "")
        structured_json = await extract_medical_data_with_ai(ocr_result, llm=llm)
        structured_json["ocr_engine"] = ocr_result.get("engine", "easyocr")
        structured_json["average_confidence"] = ocr_result.get("average_confidence", 0.0)
        structured_json["blocks"] = ocr_result.get("blocks", [])
    except ImageValidationError as e:
        logger.warning("Image validation notice during upload: %s", e)
        ocr_text = f"[Image notice: {str(e)}]"
        structured_json = {"document_type": "unknown", "error": str(e)}
    except Exception as e:
        logger.warning("OCR processing notice: %s", e, exc_info=True)
        ocr_text = f"[OCR processing: {str(e)}]"
        structured_json = {"document_type": "unknown", "error": "OCR extraction could not complete."}

    # Store in database
    document = Document(
        session_id=session_id,
        file_path=file_path,
        ocr_text=ocr_text or None,
        structured_json=structured_json or None,
    )
    db.add(document)
    await db.flush()
    await db.refresh(document)
    return document


async def process_document_ocr(
    db: AsyncSession,
    session_id: str,
    file: UploadFile,
    llm: LLMProvider | None = None,
) -> dict[str, Any]:
    """Dedicated OCR endpoint logic: validates, saves, extracts text, structures medical entities."""
    session = await get_session(db, session_id)

    content = await file.read()
    if not content:
        raise BadRequestError("Empty image or frame received.")

    # Validate image bytes
    try:
        validate_and_load_image(content)
    except ImageValidationError as e:
        raise BadRequestError(str(e))

    settings = get_settings()
    upload_dir = os.path.join(settings.UPLOAD_DIR, session_id)
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "doc.jpg")[1]
    if not ext or ext.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"

    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, unique_name)

    with open(file_path, "wb") as f:
        f.write(content)

    # 1. OCR text extraction
    ocr_result = await run_ocr_extraction(content)
    ocr_text = ocr_result.get("text", "")
    avg_conf = ocr_result.get("average_confidence", 0.0)
    blocks = ocr_result.get("blocks", [])
    engine = ocr_result.get("engine", "easyocr_cpu")

    # 2. AI medical structuring
    structured_data = await extract_medical_data_with_ai(ocr_result, llm=llm)
    structured_data["ocr_engine"] = engine
    structured_data["average_confidence"] = avg_conf

    # 3. Store record in DB
    document = Document(
        session_id=session_id,
        file_path=file_path,
        ocr_text=ocr_text,
        structured_json=structured_data,
    )
    db.add(document)
    await db.flush()
    await db.refresh(document)

    return {
        "id": document.id,
        "session_id": document.session_id,
        "file_path": document.file_path,
        "ocr_text": ocr_text,
        "structured_json": structured_data,
        "uploaded_at": document.uploaded_at,
        "ocr_blocks": blocks,
        "average_confidence": avg_conf,
        "engine": engine,
        "uncertain_items": structured_data.get("uncertain_items", []),
    }


async def list_documents(
    db: AsyncSession,
    session_id: str,
) -> list[Document]:
    """List all documents for a session."""
    await get_session(db, session_id)

    result = await db.execute(
        select(Document)
        .where(Document.session_id == session_id)
        .order_by(Document.uploaded_at.desc())
    )
    return list(result.scalars().all())
