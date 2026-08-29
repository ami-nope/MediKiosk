"""Patient service — CRUD operations for patients."""

from __future__ import annotations

import random
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import BadRequestError, NotFoundError
from app.models.patient import Patient
from app.schemas.patient import PatientCreate



async def generate_unique_8digit_abha(db: AsyncSession) -> str:
    """Generate a unique 8-digit numeric ABHA ID."""
    for _ in range(50):
        candidate = str(random.randint(10000000, 99999999))
        existing = await get_patient_by_external_id(db, candidate)
        if not existing:
            return candidate
    # Fallback with timestamp hash slice
    return str(int(datetime.now(timezone.utc).timestamp()))[-8:]


async def create_patient(db: AsyncSession, data: PatientCreate) -> Patient:
    """Create and persist a new patient record with an 8-digit ABHA ID or update if exists."""
    external_id = data.external_id.strip() if data.external_id else None

    if external_id:
        # Validate 8 digits
        clean_id = "".join(filter(str.isdigit, external_id))
        if len(clean_id) < 8:
            raise BadRequestError("ABHA ID must contain at least 8 digits.")
        external_id = clean_id[:8]

        existing = await get_patient_by_external_id(db, external_id)
        if existing:
            existing.display_name = data.display_name
            if data.age is not None:
                existing.age = data.age
            if data.gender:
                existing.gender = data.gender
            if data.phone:
                existing.phone = data.phone
            if data.address:
                existing.address = data.address
            if data.past_illnesses:
                existing.past_illnesses = data.past_illnesses
            if data.allergies:
                existing.allergies = data.allergies
            if data.current_medications:
                existing.current_medications = data.current_medications
            existing.preferred_language = data.preferred_language
            await db.flush()
            await db.refresh(existing)
            return existing
    else:
        # Auto-generate an 8-digit ABHA ID for new patient
        external_id = await generate_unique_8digit_abha(db)

    patient = Patient(
        display_name=data.display_name,
        external_id=external_id,
        age=data.age,
        gender=data.gender,
        phone=data.phone,
        address=data.address,
        past_illnesses=data.past_illnesses,
        allergies=data.allergies,
        current_medications=data.current_medications,
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


async def get_patient_by_external_id(db: AsyncSession, external_id: str) -> Patient | None:
    """Fetch a patient by ABHA / external ID."""
    result = await db.execute(select(Patient).where(Patient.external_id == external_id))
    return result.scalar_one_or_none()

