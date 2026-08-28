"""Document service — file upload and OCR processing."""

from __future__ import annotations

import os
import uuid

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.document import Document
from app.services.session_service import get_session


async def upload_document(
    db: AsyncSession,
    session_id: str,
    file: UploadFile,
) -> Document:
    """
    Save an uploaded file to disk and create a Document record.

    OCR processing is stubbed — when the OCR provider is implemented, it
    will be called here and the results stored via the placeholder function
    in app/placeholders/clinical.py → process_ocr_result().
    """
    # Validate session exists
    await get_session(db, session_id)

    settings = get_settings()
    upload_dir = os.path.join(settings.UPLOAD_DIR, session_id)
    os.makedirs(upload_dir, exist_ok=True)

    # Generate a unique filename to avoid collisions
    ext = os.path.splitext(file.filename or "file")[1]
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, unique_name)

    # Write file to disk
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # ── OCR processing — STUB ──
    # TODO: When the OCR provider is implemented, call it here:
    #
    #   from app.providers.ocr.base import OCRProvider
    #   from app.placeholders.clinical import process_ocr_result
    #
    #   ocr_text = await ocr_provider.extract_text(content)
    #   structured = process_ocr_result(ocr_text)
    #
    # For now, both ocr_text and structured_json remain None.
    ocr_text = None
    structured_json = None

    document = Document(
        session_id=session_id,
        file_path=file_path,
        ocr_text=ocr_text,
        structured_json=structured_json,
    )
    db.add(document)
    await db.flush()
    await db.refresh(document)
    return document


async def list_documents(
    db: AsyncSession,
    session_id: str,
) -> list[Document]:
    """List all documents for a session."""
    # Validate session exists
    await get_session(db, session_id)

    result = await db.execute(
        select(Document)
        .where(Document.session_id == session_id)
        .order_by(Document.uploaded_at.desc())
    )
    return list(result.scalars().all())
