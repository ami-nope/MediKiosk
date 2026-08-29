"""
History service — manages the conversation transcript and LLM interaction.

This is where patient messages flow through the placeholder clinical functions
and into the LLM provider. The actual clinical question logic is NOT here —
it lives in app/placeholders/clinical.py.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError, ProviderError
from app.models.history_record import HistoryRecord
from app.models.session import Session
from app.placeholders.clinical import build_history_messages, extract_red_flags
from app.providers.llm.base import LLMProvider
from app.services.session_service import get_session


_INTAKE_COMPLETE_MARKERS = (
    "intake_complete",
    "intake complete",
    "intake is complete",
    "history intake is complete",
    "complete intake history",
    "recorded all details",
    "proceed to attach",
    "next screen",
)
logger = logging.getLogger(__name__)
_COMPLETE_REPLY = "**History intake is complete.** Thank you. Please continue to document upload."


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _user_turns_with_current(transcript: list[dict[str, Any]], user_message: str) -> list[str]:
    turns = [
        str(turn.get("content", "")).strip()
        for turn in transcript
        if turn.get("role") == "user" and str(turn.get("content", "")).strip()
    ]
    current = user_message.strip()
    if current:
        turns.append(current)
    return turns


def _has_duration(text: str) -> bool:
    return _contains_any(
        text,
        (
            "today",
            "yesterday",
            "since",
            "ago",
            "day",
            "days",
            "week",
            "weeks",
            "month",
            "months",
            "hour",
            "hours",
        ),
    )


def _has_symptom(text: str) -> bool:
    return _contains_any(
        text,
        (
            "pain",
            "fever",
            "cough",
            "cold",
            "throat",
            "breath",
            "vomit",
            "loose",
            "diarrhea",
            "diarrhoea",
            "stomach",
            "rash",
            "itch",
            "urine",
            "injury",
            "dizzy",
            "headache",
            "weak",
            "swelling",
            "bleeding",
            "checkup",
        ),
    )


def _has_demographics(text: str) -> bool:
    has_age = bool(re.search(r"\b(?:[1-9]\d?|1[01]\d|120)\b", text))
    has_sex = _contains_any(
        text,
        (
            " m ",
            " f ",
            " fem ",
            " male",
            " female",
            " man",
            " woman",
            " boy",
            " girl",
            " other",
            " nonbinary",
            " non-binary",
        ),
    )
    return has_age and has_sex


def _has_age(text: str) -> bool:
    return bool(re.search(r"\b(?:[1-9]\d?|1[01]\d|120)\b", text))


def _has_sex(text: str) -> bool:
    return _contains_any(
        text,
        (
            " m ",
            " f ",
            " fem ",
            " male",
            " female",
            " man",
            " woman",
            " boy",
            " girl",
            " other",
            " nonbinary",
            " non-binary",
        ),
    )


def _has_severity(text: str) -> bool:
    return _contains_any(text, ("mild", "moderate", "severe", "bad", "worse", "better", "too much")) or bool(
        re.search(r"\b(?:[0-9]|10)\b", text)
    )


def _has_med_or_allergy_info(text: str) -> bool:
    return _contains_any(
        text,
        (
            "medicine",
            "medicines",
            "painkiller",
            "painkillers",
            "tablet",
            "injection",
            "allergy",
            "allergic",
            "nuts",
            "no allergy",
            "no allergies",
        ),
    )


def _patient_wants_to_finish(text: str) -> bool:
    cleaned = text.strip().lower()
    return cleaned in {
        "done",
        "finish",
        "finished",
        "complete",
        "save",
        "end",
        "continue",
        "proceed",
        "nothing else",
        "no more",
    }


def _last_assistant_text(transcript: list[dict[str, Any]]) -> str:
    for turn in reversed(transcript):
        if turn.get("role") == "assistant":
            return str(turn.get("content", "")).lower()
    return ""


def _assistant_asked(transcript: list[dict[str, Any]], keywords: tuple[str, ...]) -> bool:
    assistant_text = " ".join(
        str(turn.get("content", "")).lower()
        for turn in transcript
        if turn.get("role") == "assistant"
    )
    return any(keyword in assistant_text for keyword in keywords)


def _has_past_history_answer(text: str) -> bool:
    return _contains_any(
        text,
        (
            "diabetes",
            "bp",
            "blood pressure",
            "asthma",
            "heart",
            "tb",
            "thyroid",
            "none",
            "no history",
            "no disease",
        ),
    )


def _related_symptom_question(context: str) -> str:
    if _contains_any(context, ("fever", "temperature", "chills", "body ache")):
        return "**Symptoms:** Cough, rash, vomiting, or burning urine? Yes/No."
    if _contains_any(context, ("cough", "cold", "throat", "breath", "wheeze", "sputum")):
        return "**Danger:** Breathlessness or chest pain? Yes/No."
    if _contains_any(context, ("stomach", "abdomen", "vomit", "loose", "diarrhea", "diarrhoea", "nausea")):
        return "**Symptoms:** Vomiting, loose stool, or blood? Yes/No."
    if _contains_any(context, ("urine", "urinary", "burning urine", "frequency")):
        return "**Symptoms:** Fever or side pain? Yes/No."
    return "**Symptoms:** Anything else with it? Yes/No."


def _deterministic_intake_reply(transcript: list[dict[str, Any]], user_message: str) -> str | None:
    user_turns = _user_turns_with_current(transcript, user_message)
    context = f" {' '.join(user_turns).lower()} "
    current = f" {user_message.strip().lower()} "
    last_assistant = _last_assistant_text(transcript)

    if _should_complete_intake(transcript, user_message):
        return _COMPLETE_REPLY

    if _patient_wants_to_finish(user_message):
        return _COMPLETE_REPLY

    if extract_red_flags(user_message):
        return (
            "**Urgent symptom noted.** I am marking this for nursing/doctor triage now.\n"
            "Are you breathless, faint, confused, or very weak right now?"
        )

    asked_demographics = "age" in last_assistant or "gender" in last_assistant or "male/female" in last_assistant
    demographic_fragment = _has_age(current) or _has_sex(current)
    if asked_demographics or (len(user_turns) <= 2 and demographic_fragment and not _has_symptom(context)):
        if not _has_age(context):
            return "**Age:** Please enter your age in years."
        if not _has_sex(context):
            return "**Gender:** Please enter Male, Female, or Other."
        return "**What brings you in today?** Please describe your main concern in your own words."

    if not _has_age(context):
        return "**Age:** How old are you?"
    if not _has_sex(context):
        return "**Sex:** Male, Female, or Other?"
    if not _has_symptom(context):
        return "**Problem:** What is your main problem?"
    if not _has_duration(context):
        return "**Started:** Since when?"
    if not _has_severity(context):
        return "**Severity:** 0 to 10?"
    if not _assistant_asked(transcript, ("**symptoms:**", "**danger:**")) and len(user_turns) < 8:
        return _related_symptom_question(context)
    if not _has_past_history_answer(context) and len(user_turns) < 9:
        return "**History:** Diabetes, BP, asthma, or heart disease? Yes/No."

    return _COMPLETE_REPLY


def _should_complete_intake(transcript: list[dict[str, Any]], user_message: str) -> bool:
    user_turns = _user_turns_with_current(transcript, user_message)
    context = f" {' '.join(user_turns).lower()} "

    if _patient_wants_to_finish(user_message):
        return len(user_turns) >= 2

    has_core_history = (
        _has_demographics(context)
        and _has_symptom(context)
        and _has_duration(context)
        and _has_severity(context)
    )
    if has_core_history and len(user_turns) >= 5 and _assistant_asked(transcript, ("**symptoms:**", "**danger:**")):
        return True

    # Kiosk intake should not become a full consultation. Once the model has
    # asked many turns and core history exists, close the intake for review.
    return (has_core_history and len(user_turns) >= 7) or len(user_turns) >= 10


def _fallback_intake_reply(transcript: list[dict[str, Any]], user_message: str) -> str:
    """Local intake path used when the LLM provider fails."""
    if _should_complete_intake(transcript, user_message):
        return _COMPLETE_REPLY

    if extract_red_flags(user_message):
        return (
            "**Urgent symptom noted.** I am marking this for nursing/doctor triage now.\n"
            "Are you breathless, faint, confused, or very weak right now?"
        )

    user_turns = _user_turns_with_current(transcript, user_message)
    turn_count = len(user_turns)
    current = user_message.strip().lower()
    context = " ".join(user_turns).lower()

    if current in {"hi", "hello", "hey", "namaste"}:
        return "**Hi.** Tell me your age, sex, main problem, and when it started."

    if not _has_symptom(context):
        return "**Main problem:** What health issue brought you to OPD today?"

    fever = _contains_any(context, ("fever", "temperature", "chills", "body ache"))
    respiratory = _contains_any(context, ("cough", "cold", "throat", "breath", "wheeze", "sputum"))
    abdomen = _contains_any(context, ("stomach", "abdomen", "vomit", "loose", "diarrhea", "diarrhoea", "nausea"))
    urinary = _contains_any(context, ("urine", "urinary", "burning urine", "frequency"))

    if not _has_duration(context):
        return "**Timing:** When did this start, and is it getting better or worse?"

    if not any(word in context for word in ("mild", "moderate", "severe", "better", "worse", "10")):
        return "**Severity:** Rate it from 0 to 10. Is it better, worse, or same?"

    if turn_count <= 3:
        if fever:
            return "**Other symptoms:** Cough, rash, headache, burning urine, vomiting, or loose stools?"
        if respiratory:
            return "**Danger signs:** Any chest pain, fever, blood in sputum, wheezing, or low SpO2?"
        if abdomen:
            return "**Other symptoms:** Fever, vomiting, loose stools, blood, burning urine, or pregnancy?"
        if urinary:
            return "**Risk check:** Fever, side pain, blood in urine, diabetes, stones, or pregnancy?"
        return "**Anything else important?** Tell one more symptom, or type 'nothing else'."

    if not _has_past_history_answer(context):
        return "**History:** Diabetes, BP, asthma, or heart disease? Yes/No."

    return _COMPLETE_REPLY


async def _get_history_record(db: AsyncSession, session_id: str) -> HistoryRecord:
    """Fetch the HistoryRecord for a session or raise NotFoundError."""
    result = await db.execute(
        select(HistoryRecord).where(HistoryRecord.session_id == session_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise NotFoundError("HistoryRecord", session_id)
    return record


async def submit_message(
    db: AsyncSession,
    session_id: str,
    user_message: str,
    llm: LLMProvider,
    *,
    allow_fallback: bool = True,
) -> tuple[str, bool, bool, str, str | None]:
    """
    Process a patient message: append to transcript, call LLM, store reply.

    Returns:
        A tuple of (assistant_reply, is_priority, intake_complete, provider, fallback_reason).
    """
    # Fetch session and its history record
    session = await get_session(db, session_id)
    record = await _get_history_record(db, session_id)

    # Load existing transcript
    transcript: list[dict[str, Any]] = json.loads(record.raw_transcript)
    previous_complete = any(
        turn.get("role") == "assistant"
        and any(marker in str(turn.get("content", "")).lower() for marker in _INTAKE_COMPLETE_MARKERS)
        for turn in transcript
    )
    if previous_complete:
        return (
            _COMPLETE_REPLY,
            session.is_priority,
            True,
            "local",
            None,
        )

    # Build the conversation and let the configured provider answer each turn.
    # The deterministic intake flow below is only a fallback when the provider fails.
    patient_language = session.patient.preferred_language if session.patient else "en"
    patient_info = None
    if session.patient:
        patient_info = {
            "display_name": session.patient.display_name,
            "age": session.patient.age,
            "gender": session.patient.gender,
            "past_illnesses": session.patient.past_illnesses,
            "allergies": session.patient.allergies,
            "current_medications": session.patient.current_medications,
        }
    messages = build_history_messages(transcript, user_message, patient_language, patient_info=patient_info)

    # ── Call the LLM ──
    try:
        assistant_reply = await asyncio.wait_for(llm.chat(messages), timeout=60)
        provider = getattr(llm, "last_used_provider", None) or llm.provider_name
        fallback_reason = getattr(llm, "fallback_reason", None)
    except TimeoutError:
        if not allow_fallback:
            raise ProviderError(llm.provider_name, "LLM timed out")
        logger.warning("LLM chat timed out; continuing intake with local fallback", exc_info=True)
        assistant_reply = _fallback_intake_reply(transcript, user_message)
        provider = "local"
        fallback_reason = "provider chain timed out"
    except ProviderError:
        if not allow_fallback:
            raise
        logger.warning("LLM chat failed; continuing intake with local fallback", exc_info=True)
        assistant_reply = _fallback_intake_reply(transcript, user_message)
        provider = "local"
        fallback_reason = getattr(llm, "fallback_reason", None) or getattr(llm, "last_error", None)

    if not assistant_reply.strip():
        raise ProviderError(llm.provider_name, "AI service returned an empty response")

    # Check both the patient's words and the assistant reply. Patient text is
    # the primary signal; assistant text may contain an explicit priority marker.
    now = datetime.now(timezone.utc).isoformat()
    has_red_flags = extract_red_flags(user_message) or extract_red_flags(assistant_reply)
    intake_complete = any(marker in assistant_reply.lower() for marker in _INTAKE_COMPLETE_MARKERS)

    # Update priority if red flags detected
    if has_red_flags and not session.is_priority:
        session.is_priority = True

    # Append both turns to the transcript
    transcript.append({"role": "user", "content": user_message, "timestamp": now})
    assistant_turn = {"role": "assistant", "content": assistant_reply, "timestamp": now, "provider": provider}
    if fallback_reason:
        assistant_turn["fallback_reason"] = fallback_reason
    transcript.append(assistant_turn)

    # Persist
    record.raw_transcript = json.dumps(transcript)
    record.updated_at = datetime.now(timezone.utc)
    await db.flush()

    return assistant_reply, session.is_priority, intake_complete, provider, fallback_reason


async def get_history(
    db: AsyncSession,
    session_id: str,
) -> dict[str, Any]:
    """Retrieve the full history for a session."""
    # Validate session exists
    await get_session(db, session_id)
    record = await _get_history_record(db, session_id)

    return {
        "session_id": session_id,
        "raw_transcript": json.loads(record.raw_transcript),
        "structured_json": record.structured_json,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }
