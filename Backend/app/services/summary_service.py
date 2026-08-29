"""
Summary service — generates and updates structured clinical summaries.

The actual summarization prompt is a placeholder in
app/placeholders/clinical.py. This service orchestrates the flow:
transcript → placeholder prompt → LLM → parsed result → stored.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.exceptions import NotFoundError, ProviderError
from app.models.history_record import HistoryRecord
from app.models.session import Session, SessionStatus
from app.placeholders.clinical import build_summary_prompt, extract_red_flags, parse_summary_response
from app.providers.llm.base import LLMProvider
from app.providers.llm.factory import create_summary_llm_provider
from app.services.ai_config_service import get_effective_settings
from app.services.session_service import get_session


logger = logging.getLogger(__name__)
_ACTIVE_SUMMARY_TASKS: set[str] = set()


def _joined_user_text(transcript: list[dict[str, Any]]) -> str:
    return " | ".join(
        str(turn.get("content", "")).strip()
        for turn in transcript
        if turn.get("role") == "user" and str(turn.get("content", "")).strip()
    )


def _local_summary(transcript: list[dict[str, Any]]) -> dict[str, Any]:
    user_text = _joined_user_text(transcript)
    lower = user_text.lower()

    red_flags = []
    if extract_red_flags(user_text):
        red_flags.append("Possible red-flag symptom mentioned; clinician review required.")

    meds = []
    if "painkiller" in lower or "painkillers" in lower:
        meds.append("Patient reports taking painkillers from old medicines; exact drug/frequency unknown.")

    allergies = []
    if "nuts allergy" in lower or "nut allergy" in lower or "nuts" in lower:
        allergies.append("Nut allergy reported; reaction not clarified.")
    elif "allergy" in lower:
        allergies.append("Allergy mentioned; details not fully clarified.")

    return {
        "chief_complaint": user_text or "Patient completed kiosk intake.",
        "history_of_present_illness": user_text or "No detailed patient text available.",
        "associated_symptoms": [],
        "pertinent_negatives": [],
        "vitals_if_known": None,
        "medications": meds,
        "allergies": allergies,
        "past_medical_history": None,
        "past_surgical_history": None,
        "family_history": None,
        "social_history": None,
        "indian_public_health_context": "OPD pre-consultation kiosk intake.",
        "triage_priority": bool(red_flags),
        "red_flags": red_flags,
        "assessment": "Pending doctor physical examination and vital signs review.",
        "plan": "Doctor OPD consultation and review of kiosk history.",
        "recommended_department": "General Medicine / OPD",
        "follow_up_questions": [
            "Confirm exact medicine name, dose, and timing for painkillers taken.",
            "Clarify allergy reaction and severity.",
        ],
        "summary_source": "local_fallback",
    }


async def _get_history_record(db: AsyncSession, session_id: str) -> HistoryRecord:
    result = await db.execute(
        select(HistoryRecord).where(HistoryRecord.session_id == session_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise NotFoundError("HistoryRecord", session_id)
    return record


def _load_transcript(record: HistoryRecord) -> list[dict[str, Any]]:
    try:
        value = json.loads(record.raw_transcript)
    except json.JSONDecodeError:
        return []
    return value if isinstance(value, list) else []


def _with_generation_status(structured: dict[str, Any], status: str) -> dict[str, Any]:
    updated = dict(structured)
    updated["summary_status"] = status
    return updated


async def enqueue_summary_generation(
    db: AsyncSession,
    session_id: str,
) -> dict[str, Any]:
    """Make the intake visible immediately and let AI summary run in the background."""
    session = await get_session(db, session_id)
    record = await _get_history_record(db, session_id)
    transcript = _load_transcript(record)

    existing = record.structured_json if isinstance(record.structured_json, dict) else None
    structured = existing or _local_summary(transcript)
    record.structured_json = _with_generation_status(structured, "generating")
    record.updated_at = datetime.now(timezone.utc)
    session.status = SessionStatus.AWAITING_REVIEW
    await db.commit()

    return {
        "session_id": session_id,
        "status": session.status,
        "structured_json": record.structured_json,
    }


async def generate_summary_background(session_id: str) -> None:
    """Run report generation outside the patient-facing request."""
    if session_id in _ACTIVE_SUMMARY_TASKS:
        return

    _ACTIVE_SUMMARY_TASKS.add(session_id)
    try:
        settings = get_effective_settings()
        llm = create_summary_llm_provider(settings)
        async with async_session_factory() as db:
            try:
                await generate_summary(db, session_id, llm)
                await db.commit()
            except Exception:
                await db.rollback()
                logger.warning("Background summary generation failed", exc_info=True)
    finally:
        _ACTIVE_SUMMARY_TASKS.discard(session_id)


async def generate_summary(
    db: AsyncSession,
    session_id: str,
    llm: LLMProvider,
) -> dict[str, Any]:
    """
    Generate a structured clinical summary for the session.

    Reads the session's transcript, passes it through the placeholder
    summarization prompt, calls the LLM, and stores the result in
    HistoryRecord.structured_json.
    """
    session = await get_session(db, session_id)
    record = await _get_history_record(db, session_id)
    transcript = _load_transcript(record)

    session.status = SessionStatus.AWAITING_REVIEW

    # ── Build the summarization prompt (placeholder function) ──
    messages = build_summary_prompt(transcript, record.structured_json)

    # ── Call the LLM ──
    try:
        llm_response = await llm.chat(messages)
    except (TimeoutError, asyncio.TimeoutError):
        logger.warning("AI summary timed out; saving local fallback summary", exc_info=True)
        llm_response = ""
    except ProviderError:
        logger.warning("AI summary failed; saving local fallback summary", exc_info=True)
        llm_response = ""
    except Exception:
        logger.warning("AI summary crashed; saving local fallback summary", exc_info=True)
        llm_response = ""

    # ── Parse the response (placeholder function) ──
    if llm_response.strip():
        structured = parse_summary_response(llm_response)
        structured["summary_source"] = llm.provider_name
        fallback_reason = getattr(llm, "fallback_reason", None)
        if fallback_reason:
            structured["summary_fallback_reason"] = fallback_reason
        structured = _with_generation_status(structured, "ready")
    else:
        structured = _with_generation_status(_local_summary(transcript), "local_fallback")

    # Store the structured summary
    record.structured_json = structured
    record.updated_at = datetime.now(timezone.utc)

    # Sync into patient master profile
    if session.patient:
        pmh = structured.get("past_medical_history") or structured.get("chief_complaint")
        if pmh and not session.patient.past_illnesses:
            session.patient.past_illnesses = str(pmh)[:1000]
        allergies = structured.get("allergies")
        if allergies and not session.patient.allergies:
            session.patient.allergies = ", ".join(allergies) if isinstance(allergies, list) else str(allergies)[:500]
        meds = structured.get("medications")
        if meds and not session.patient.current_medications:
            session.patient.current_medications = ", ".join(meds) if isinstance(meds, list) else str(meds)[:1000]

    # Keep session in awaiting_review with the latest structured summary.
    session.status = SessionStatus.AWAITING_REVIEW
    await db.flush()

    return {
        "session_id": session_id,
        "status": session.status,
        "structured_json": structured,
    }


async def update_summary(
    db: AsyncSession,
    session_id: str,
    structured_json: dict[str, Any],
) -> dict[str, Any]:
    """
    Doctor edits/confirms the summary. Updates the structured data and
    marks the session as completed.
    """
    session = await get_session(db, session_id)

    # Get the history record
    result = await db.execute(
        select(HistoryRecord).where(HistoryRecord.session_id == session_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise NotFoundError("HistoryRecord", session_id)

    # Update structured data with doctor's edits
    record.structured_json = structured_json
    record.updated_at = datetime.now(timezone.utc)

    # Mark session as completed
    session.status = SessionStatus.COMPLETED
    session.completed_at = datetime.now(timezone.utc)
    await db.flush()

    return {
        "session_id": session_id,
        "status": session.status,
        "structured_json": structured_json,
    }
