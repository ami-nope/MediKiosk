"""Document routes — upload and list documents for a session."""

from __future__ import annotations

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas.document import DocumentResponse
from app.services import document_service

router = APIRouter(prefix="/sessions/{session_id}/documents", tags=["Documents"])


@router.post("", response_model=DocumentResponse, status_code=201)
async def upload_document(
    session_id: str,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    """
    Upload a file (prescription, lab report, etc.) to a session.

    The file is stored on disk. OCR processing is stubbed — when the OCR
    provider is implemented, it will run automatically on upload.
    """
    document = await document_service.upload_document(db, session_id, file)
    return DocumentResponse.model_validate(document)


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[DocumentResponse]:
    """List all documents uploaded to a session."""
    documents = await document_service.list_documents(db, session_id)
    return [DocumentResponse.model_validate(doc) for doc in documents]
