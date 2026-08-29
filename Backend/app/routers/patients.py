"""Patient routes — register and retrieve patients."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas.patient import PatientCreate, PatientResponse
from app.services import patient_service

router = APIRouter(prefix="/patients", tags=["Patients"])


@router.post("", response_model=PatientResponse, status_code=201)
async def create_patient(
    data: PatientCreate,
    db: AsyncSession = Depends(get_db),
) -> PatientResponse:
    """Register or identify a new patient."""
    patient = await patient_service.create_patient(db, data)
    return PatientResponse.model_validate(patient)


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
) -> PatientResponse:
    """Retrieve a patient by ID."""
    patient = await patient_service.get_patient(db, patient_id)
    return PatientResponse.model_validate(patient)


@router.get("/by-external-id/{external_id}", response_model=PatientResponse)
async def get_patient_by_external_id(
    external_id: str,
    db: AsyncSession = Depends(get_db),
) -> PatientResponse:
    """Retrieve a patient by external ID (e.g. ABHA)."""
    patient = await patient_service.get_patient_by_external_id(db, external_id)
    if not patient:
        from app.exceptions import NotFoundError
        raise NotFoundError("Patient external_id", external_id)
    return PatientResponse.model_validate(patient)

