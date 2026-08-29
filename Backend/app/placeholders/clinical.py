"""Clinical helper functions for MediKiosk.

These helpers keep the API layer thin by centralizing prompt building,
summary parsing, red-flag detection, and OCR structuring heuristics here.
They are intentionally simple and easy to replace later without touching
routers or service code.
"""

from __future__ import annotations

import json
import re
from typing import Any


_MAX_TRANSCRIPT_TURNS = 14
_NEGATION_WORDS = (
    "no ",
    "not ",
    "not having ",
    "never ",
    "denies ",
    "denied ",
    "without ",
    "without any ",
    "negative for ",
    "free of ",
    "nil ",
    "none ",
    "nahi ",
    "nahin ",
)
_RED_FLAG_PHRASES = (
    "chest pain",
    "chest pressure",
    "chest tightness",
    "pain going to left arm",
    "pain radiating to left arm",
    "jaw pain",
    "shortness of breath",
    "difficulty breathing",
    "trouble breathing",
    "severe breathlessness",
    "unable to breathe",
    "spo2 below",
    "spo2 less than",
    "oxygen saturation below",
    "oxygen saturation less than",
    "fainting",
    "syncope",
    "collapse",
    "seizure",
    "fits",
    "convulsion",
    "stroke",
    "one-sided weakness",
    "one sided weakness",
    "slurred speech",
    "facial droop",
    "face drooping",
    "severe bleeding",
    "heavy bleeding",
    "vomiting blood",
    "black stool",
    "blood in stool",
    "blood in vomit",
    "suicidal",
    "self-harm",
    "self harm",
    "want to die",
    "anaphylaxis",
    "loss of consciousness",
    "confusion",
    "drowsy",
    "unconscious",
    "bluish",
    "severe allergic reaction",
    "swelling of lips",
    "swelling of tongue",
    "snake bite",
    "dog bite",
    "animal bite",
    "electric shock",
    "major burn",
    "severe burn",
    "severe abdominal pain",
    "rigid abdomen",
    "pregnant and bleeding",
    "bleeding during pregnancy",
    "severe dehydration",
    "not passing urine",
    "high fever with rash",
    "fever with stiff neck",
    "stiff neck",
    "severe headache with fever",
    "coughing blood",
    "hemoptysis",
    "haemoptysis",
)
_URGENCY_ASSERTIONS = (
    "marking this as priority",
    "flagged as urgent",
    "urgent triage",
    "priority for nursing",
    "priority for doctor",
    "needs immediate medical attention",
    "requires immediate medical attention",
)
_QUESTION_STARTERS = (
    "do you ",
    "are you ",
    "have you ",
    "did you ",
    "can you ",
    "could you ",
    "is there ",
    "any ",
    "please tell ",
    "tell me ",
    "also tell ",
)
_MEDICATION_HINTS = (
    "tablet",
    "tab",
    "capsule",
    "cap",
    "syrup",
    "injection",
    "inj",
    "ointment",
    "cream",
    "drops",
    "mg",
    "mcg",
    "ml",
    "iu",
    "units",
)
_LAB_HINTS = (
    "hb",
    "hemoglobin",
    "wbc",
    "platelet",
    "creatinine",
    "urea",
    "glucose",
    "sugar",
    "sodium",
    "potassium",
    "bilirubin",
    "alt",
    "ast",
    "tsh",
    "bp",
    "spo2",
    "bpm",
    "mmhg",
)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _recent_transcript(transcript: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(transcript) <= _MAX_TRANSCRIPT_TURNS:
        return transcript
    return transcript[-_MAX_TRANSCRIPT_TURNS:]


def _strip_code_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def _extract_json_candidate(text: str) -> Any | None:
    stripped = _strip_code_fences(text)
    candidates = [stripped]

    if "{" in stripped and "}" in stripped:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if end > start:
            candidates.append(stripped[start : end + 1])

    if "[" in stripped and "]" in stripped:
        start = stripped.find("[")
        end = stripped.rfind("]")
        if end > start:
            candidates.append(stripped[start : end + 1])

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except Exception:
            continue
    return None


def _normalise_role(role: Any) -> str | None:
    role_text = _clean_text(role).lower()
    if role_text in {"user", "assistant", "system"}:
        return role_text
    return None


def _sentence_around(text: str, index: int) -> str:
    starts = [text.rfind(mark, 0, index) for mark in (".", "?", "!", "\n")]
    start = max(starts) + 1

    ends = [text.find(mark, index) for mark in (".", "?", "!", "\n")]
    ends = [position for position in ends if position != -1]
    end = min(ends) + 1 if ends else len(text)

    return text[start:end].strip()


def _looks_like_screening_question(sentence: str) -> bool:
    normalised = " ".join(sentence.lower().split())
    if not normalised:
        return False
    if normalised.endswith("?"):
        return True
    return any(normalised.startswith(starter) for starter in _QUESTION_STARTERS)


def build_history_messages(
    transcript: list[dict[str, Any]],
    user_message: str,
    patient_language: str = "en",
    patient_info: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    """Build a chat message list for the history-taking flow."""

    messages: list[dict[str, str]] = []

    language_code = _clean_text(patient_language or "en").lower()
    if language_code in {"en", "eng", "english"}:
        language_instruction = "Respond in clear English."
    elif language_code in {"hi", "hin", "hindi"}:
        language_instruction = "Respond in simple Hindi, using easy patient language."
    else:
        language_instruction = (
            f"Respond in the patient's preferred language ({patient_language}). "
            "If the exact locale is not available, use the closest understandable match."
        )

    patient_context_str = ""
    if patient_info:
        ctx_parts = []
        if patient_info.get("display_name"):
            ctx_parts.append(f"Patient Name: {patient_info['display_name']}")
        if patient_info.get("age"):
            ctx_parts.append(f"Age: {patient_info['age']}")
        if patient_info.get("gender"):
            ctx_parts.append(f"Gender: {patient_info['gender']}")
        if patient_info.get("past_illnesses"):
            ctx_parts.append(f"Known Past Illnesses/History: {patient_info['past_illnesses']}")
        if patient_info.get("allergies"):
            ctx_parts.append(f"Known Allergies: {patient_info['allergies']}")
        if patient_info.get("current_medications"):
            ctx_parts.append(f"Current Medications: {patient_info['current_medications']}")
        if ctx_parts:
            patient_context_str = (
                "\n\nKNOWN PATIENT PROFILE (Do not re-ask these details; greet them warmly and refer to them naturally if relevant):\n"
                + "\n".join(f"- {p}" for p in ctx_parts)
                + "\n"
            )

    system_prompt = (
        "You are Ami, a warm and conversational OPD intake assistant for MediKiosk. "
        "Respond naturally to what the patient just said before asking a relevant follow-up. "
        "Ask at most two clear questions at a time, and avoid sounding like a fixed form. "
        "Keep replies concise and easy for a patient to understand. Use **bold** for important field names. "
        "If the patient says this is a routine checkup, ask only their age, sex, reason for the checkup, "
        "relevant known conditions, and whether they have current or emergency symptoms; then finish after "
        "enough information is collected. Do not ask every general-history question for a routine checkup. "
        "For unrelated requests, briefly say you can help with health intake and ask for the health concern. "
        "Do not engage in dating, sexual, coding, or abusive conversation. "
        "Never ask what medicines the patient is taking; prescriptions are uploaded later. "
        "Collect only: age, sex, main problem, start time, severity 0-10, key related symptoms, "
        "major past illness, and emergency danger signs. Do not repeat answered fields. "
        "After 5-8 patient answers or enough core history, finish with exactly: "
        "'**History intake is complete.** Thank you. Please continue to document upload.' "
        "Escalate urgent symptoms briefly and ask one safety question. "
        f"{patient_context_str}"
        f"{language_instruction}"
    )
    messages.append({"role": "system", "content": system_prompt})

    for turn in _recent_transcript(transcript):
        role = _normalise_role(turn.get("role"))
        content = _clean_text(turn.get("content", ""))
        if role and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": _clean_text(user_message)})
    return messages


def build_summary_prompt(
    transcript: list[dict[str, Any]],
    structured_data: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    """Build a prompt that asks the model to return structured JSON."""

    messages: list[dict[str, str]] = []

    system_prompt = (
        "Convert OPD intake transcript to concise JSON only. "
        "Use null/[] for unknown. Do not invent diagnosis, drugs, or tests. "
        "Keys: chief_complaint, history_of_present_illness, associated_symptoms, "
        "pertinent_negatives, vitals_if_known, medications, allergies, past_medical_history, "
        "triage_priority, red_flags, assessment, plan, recommended_department, follow_up_questions."
    )
    messages.append({"role": "system", "content": system_prompt})

    transcript_text = "\n".join(
        f"{_clean_text(turn.get('role', '')).upper()}: {_clean_text(turn.get('content', ''))}"
        for turn in transcript
        if _clean_text(turn.get("content", ""))
    )
    existing_json = (
        json.dumps(structured_data, indent=2, ensure_ascii=False)
        if structured_data is not None
        else "null"
    )
    messages.append(
        {
            "role": "user",
            "content": (
                "Return valid JSON only.\n"
                f"Transcript:\n{transcript_text or 'No transcript available.'}\n"
                f"Existing JSON:\n{existing_json}"
            ),
        }
    )

    return messages


def extract_red_flags(llm_response: str) -> bool:
    """Detect whether the model output suggests urgent or emergent symptoms."""

    parsed = _extract_json_candidate(llm_response)
    if isinstance(parsed, dict):
        for key in (
            "is_priority",
            "priority",
            "red_flag",
            "urgent",
            "emergency",
            "needs_immediate_attention",
        ):
            value = parsed.get(key)
            if isinstance(value, bool):
                return value
            if isinstance(value, str) and value.strip().lower() in {
                "true",
                "yes",
                "urgent",
                "emergency",
                "priority",
            }:
                return True
            if isinstance(value, (int, float)) and value != 0:
                return True
        for key in ("red_flags", "flags", "warnings"):
            value = parsed.get(key)
            if isinstance(value, list) and value:
                return True
            if isinstance(value, str) and value.strip():
                return True

    text = llm_response.lower()
    if any(assertion in text for assertion in _URGENCY_ASSERTIONS):
        return True

    for phrase in _RED_FLAG_PHRASES:
        index = text.find(phrase)
        if index == -1:
            continue
        sentence = _sentence_around(text, index)
        if _looks_like_screening_question(sentence):
            continue
        window = text[max(0, index - 60) : index]
        if any(negation in window for negation in _NEGATION_WORDS):
            continue
        return True

    return False


def parse_summary_response(llm_response: str) -> dict[str, Any]:
    """Parse a summary response into structured data if possible."""

    parsed = _extract_json_candidate(llm_response)
    if isinstance(parsed, dict):
        for key in ("summary", "structured_summary", "data", "result"):
            nested = parsed.get(key)
            if isinstance(nested, dict):
                return nested
        return parsed

    if isinstance(parsed, list):
        return {"items": parsed}

    return {
        "raw_summary": llm_response,
        "parse_error": "Response was not valid JSON",
    }


def process_ocr_result(ocr_text: str) -> dict[str, Any]:
    """Turn OCR text into a small structured payload."""

    text = _clean_text(ocr_text)
    lower = text.lower()
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    doc_type_scores = {
        "prescription": sum(
            1
            for hint in ("rx", "prescription", "tab", "tablet", "capsule", "dose")
            if hint in lower
        ),
        "lab_report": sum(
            1
            for hint in (
                "laboratory",
                "lab report",
                "haemoglobin",
                "hemoglobin",
                "wbc",
                "rbc",
                "platelet",
                "creatinine",
            )
            if hint in lower
        ),
        "discharge_summary": sum(
            1
            for hint in ("discharge summary", "admission", "discharged", "diagnosis", "follow up")
            if hint in lower
        ),
        "radiology_report": sum(
            1
            for hint in ("x-ray", "xray", "ct ", "mri", "ultrasound", "sonography", "impression")
            if hint in lower
        ),
        "referral": sum(
            1
            for hint in ("referral", "referred", "consultation", "opinion")
            if hint in lower
        ),
    }
    document_type = max(doc_type_scores, key=doc_type_scores.get)
    if doc_type_scores[document_type] == 0:
        document_type = "unknown"

    medication_mentions: list[str] = []
    lab_mentions: list[str] = []
    possible_red_flags: list[str] = []
    dates: list[str] = []
    patient_name: str | None = None

    date_pattern = re.compile(
        r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b"
    )
    patient_name_pattern = re.compile(r"\b(?:patient name|name)\s*[:\-]\s*(.+)$", re.IGNORECASE)
    medication_line_pattern = re.compile(
        r"\b(?:\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?)\b|(?:tab|tablet|capsule|syrup|injection|inj|ointment|cream|drops)\b)",
        re.IGNORECASE,
    )
    lab_value_pattern = re.compile(
        r"\b\d+(?:\.\d+)?\s*(?:mg/dl|g/dl|mmol/l|mmhg|bpm|%|iu|units?)\b",
        re.IGNORECASE,
    )

    for line in lines:
        for match in date_pattern.findall(line):
            if match not in dates:
                dates.append(match)

        if patient_name is None:
            match = patient_name_pattern.search(line)
            if match:
                patient_name = match.group(1).strip()

        line_lower = line.lower()
        if medication_line_pattern.search(line_lower) or any(
            hint in line_lower for hint in _MEDICATION_HINTS
        ):
            if line not in medication_mentions:
                medication_mentions.append(line)

        if lab_value_pattern.search(line_lower) or any(hint in line_lower for hint in _LAB_HINTS):
            if line not in lab_mentions:
                lab_mentions.append(line)

        if any(phrase in line_lower for phrase in _RED_FLAG_PHRASES):
            if line not in possible_red_flags:
                possible_red_flags.append(line)

    return {
        "document_type": document_type,
        "patient_name": patient_name,
        "dates": dates,
        "medication_mentions": medication_mentions,
        "lab_mentions": lab_mentions,
        "possible_red_flags": possible_red_flags,
        "raw_ocr_text": text,
    }
