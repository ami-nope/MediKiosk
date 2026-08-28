"""Patient service — CRUD operations for patients."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models.patient import Patient
from app.schemas.patient import PatientCreate


async def create_patient(db: AsyncSession, data: PatientCreate) -> Patient:
    """Create and persist a new patient record."""
    patient = Patient(
        display_name=data.display_name,
        external_id=data.external_id,
        preferred_language=data.preferred_language,
    )
    db.add(patient)
    await db.flush()
    await db.refresh(patient)
    return patient


async def get_patient(db: AsyncSession, patient_id: str) -> Patient:
    """Fetch a patient by ID or raise NotFoundError."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        raise NotFoundError("Patient", patient_id)
    return patient
