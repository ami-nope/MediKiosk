"""Document routes — upload, automatic OCR, and list documents for a session."""

from __future__ import annotations

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_llm_provider
from app.providers.llm.base import LLMProvider
from app.schemas.document import DocumentResponse, DocumentOCRResponse
from app.services import document_service

router = APIRouter(prefix="/sessions/{session_id}/documents", tags=["Documents"])


@router.post("", response_model=DocumentResponse, status_code=201)
async def upload_document(
    session_id: str,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
) -> DocumentResponse:
    """
    Upload a file (prescription, lab report, etc.) to a session and perform OCR extraction.
    """
    document = await document_service.upload_document(db, session_id, file, llm=llm)
    return DocumentResponse.model_validate(document)


@router.post("/ocr", response_model=DocumentOCRResponse, status_code=201)
async def ocr_document(
    session_id: str,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
) -> DocumentOCRResponse:
    """
    Capture / upload webcam document frame, run OCR, structure medical data with AI,
    and save document to session.
    """
    result = await document_service.process_document_ocr(db, session_id, file, llm=llm)
    return DocumentOCRResponse.model_validate(result)


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[DocumentResponse]:
    """List all documents uploaded to a session."""
    documents = await document_service.list_documents(db, session_id)
    return [DocumentResponse.model_validate(doc) for doc in documents]
