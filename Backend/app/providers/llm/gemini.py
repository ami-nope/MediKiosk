"""
Google Gemini LLM provider.

Uses the official google-genai Python SDK with async support.
"""

from __future__ import annotations

import json
import logging
from typing import Any

try:
    from google import genai  # type: ignore
    from google.genai import types  # type: ignore
except (ImportError, ModuleNotFoundError):
    genai = None  # type: ignore
    types = None  # type: ignore


from app.config import Settings
from app.exceptions import ProviderError
from app.placeholders.clinical import extract_red_flags
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _is_greeting_only(text: str) -> bool:
    cleaned = text.strip(" .,!?:;").lower()
    return cleaned in {"hi", "hello", "hey", "yo", "namaste", "good morning", "good afternoon", "good evening"}


def _is_confused_reply(text: str) -> bool:
    cleaned = text.strip().lower()
    return _contains_any(
        cleaned,
        (
            "what",
            "what did you ask",
            "i mean what",
            "dont understand",
            "don't understand",
            "did not understand",
            "confused",
        ),
    ) and len(cleaned) <= 80


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
            "year",
            "years",
            "hour",
            "hours",
        ),
    )


def _has_severity(text: str) -> bool:
    return _contains_any(text, ("mild", "moderate", "severe", "bad", "worse", "better")) or any(
        str(n) in text for n in range(1, 11)
    )


def _is_negative_short_answer(text: str) -> bool:
    cleaned = text.strip(" .,!?:;").lower()
    return cleaned in {"no", "nope", "none", "nothing", "nothing else", "nil", "nahi", "nahin"}


def _meaningful_turn_count(messages: list[dict[str, str]]) -> int:
    count = 0
    for msg in messages:
        if msg["role"] != "user":
            continue
        text = msg["content"].strip().lower()
        if _is_greeting_only(text) or _is_confused_reply(text) or len(text) < 3:
            continue
        count += 1
    return count


def _fallback_question(
    last_user_msg: str,
    meaningful_turns_count: int,
    transcript_text: str = "",
    last_assistant_msg: str = "",
) -> str:
    """Symptom-aware OPD fallback when Gemini is unavailable."""

    if extract_red_flags(last_user_msg):
        return (
            "**Urgent symptom noted.** I am marking this for nursing/doctor triage now.\n"
            "Are you breathless, faint, confused, or very weak right now?"
        )

    if _is_greeting_only(last_user_msg):
        return "**Hi. Tell me the main problem.** For example: knee pain, skin rash, fever, cough, or diarrhoea."

    if _is_confused_reply(last_user_msg):
        if (
            "please choose one" in last_assistant_msg
            or "which is worse" in last_assistant_msg
            or "which problem" in last_assistant_msg
        ):
            return "**Please choose one:** Is the knee problem worse, or the skin problem worse today?"
        if "knee" in last_assistant_msg:
            return "**Knee question:** Is it pain, shaking/jerking, swelling, or injury?"
        if "skin" in last_assistant_msg:
            return "**Skin question:** Is it itching, rash, wound, swelling, or color change?"
        return "**No problem.** Please describe the main symptom in simple words."

    context_text = f"{transcript_text} {last_user_msg}"
    last_message_only = last_user_msg.lower()

    if _is_negative_short_answer(last_user_msg):
        if "to clarify" in last_assistant_msg:
            return "**Warning signs:** Any pain, urine burning, discharge, injury, testicle pain, or fever?"
        if "important details" in last_assistant_msg:
            return "**Warning signs:** Any pain, urine burning, discharge, injury, testicle pain, or fever?"
        if "warning signs" in last_assistant_msg:
            return "**Medicines/allergy:** Any current medicines or known allergy?"
        if "medicines/allergy" in last_assistant_msg:
            return "**Past history:** Any diabetes, BP, asthma, heart problem, or surgery?"
        if "past history" in last_assistant_msg:
            return "**History intake is complete.** Please continue to document upload."
        if "anything else important" in last_assistant_msg:
            return "**Medicines/allergy:** Any current medicines or known allergy?"

    fever = _contains_any(
        context_text,
        ("fever", "temperature", "chills", "body ache", "body pain", "rash"),
    )
    respiratory = _contains_any(
        context_text,
        ("cough", "cold", "throat", "breath", "wheeze", "sputum", "phlegm"),
    )
    abdomen = _contains_any(
        context_text,
        ("stomach", "abdomen", "abdominal", "vomit", "loose motion", "diarrhea", "diarrhoea", "nausea"),
    )
    diarrhoea = _contains_any(
        context_text,
        ("diarrhea", "diarrhoea", "loose motion", "loose motions", "loose stool", "loose stools"),
    )
    urinary = _contains_any(
        context_text,
        ("urine", "urinary", "burning", "frequency", "flank", "kidney stone"),
    )
    gyn = _contains_any(
        context_text,
        ("pregnant", "pregnancy", "period", "lmp", "vaginal", "discharge", "pelvic"),
    )
    injury = _contains_any(
        context_text,
        ("injury", "fall", "accident", "cut", "wound", "bite", "burn", "fracture"),
    )
    mental_health = _contains_any(
        context_text,
        ("anxiety", "depression", "stress", "panic", "sleep", "self harm", "self-harm"),
    )
    knee = _contains_any(
        context_text,
        ("knee", "leg jerk", "jerks", "jerking", "joint", "limp", "walking"),
    )
    skin = _contains_any(
        context_text,
        ("skin", "rash", "itch", "itching", "patch", "spots", "redness", "wound", "boil", "swelling"),
    )
    mens_sexual_health = _contains_any(
        context_text,
        (
            "erectile dysfunction",
            "erection",
            "premature",
            "early ejaculation",
            "ejaculation",
            "sex problem",
            "sexual",
        ),
    )

    if mens_sexual_health:
        if "important details" in last_assistant_msg and _contains_any(
            last_message_only,
            ("erectile dysfunction", "erection", "sex problem", "sexual"),
        ):
            return "**I noted erectile dysfunction.** Do you get morning erections? Yes or no."
        if _contains_any(last_message_only, ("too early", "premature", "early ejaculation")):
            return "**To clarify:** Is the main issue erection firmness, early ejaculation, or both?"
        if not _has_duration(context_text):
            return "**Erection problem:** How long has this been happening?"
        if not _contains_any(context_text, ("morning", "stress", "anxiety", "diabetes", "bp", "medicine", "alcohol", "smoking")):
            return "**Important details:** Any morning erection, stress, diabetes/BP, smoking, alcohol, or new medicine?"
        if not _contains_any(context_text, ("pain", "urine", "discharge", "injury", "testicle", "fever")):
            return "**Warning signs:** Any pain, urine burning, discharge, injury, testicle pain, or fever?"

    if knee and skin and _contains_any(last_message_only, (" and ", ",", "plus", "also", "with")):
        return "**Two problems noted.** Which is worse today: knee jerks or the skin issue?"

    if knee:
        if not _contains_any(context_text, ("pain", "jerk", "jerking", "shake", "shaking", "swelling", "injury", "fall")):
            return "**Knee problem:** Is it pain, shaking/jerking, swelling, or injury?"
        if not _has_duration(context_text):
            return "**Knee timing:** When did it start, and does it happen again and again?"
        if not _contains_any(context_text, ("walk", "walking", "stand", "weak", "numb", "fever", "red", "hot")):
            return "**Knee warning signs:** Any trouble walking, weakness, numbness, fever, redness, or heat?"

    if skin:
        if not _contains_any(context_text, ("itch", "itching", "rash", "red", "patch", "spot", "wound", "boil", "swelling", "pain")):
            return "**Skin issue:** Is it itching, rash, wound, swelling, pain, or color change?"
        if not _has_duration(context_text):
            return "**Skin timing:** When did it start, and is it spreading?"
        if not _contains_any(context_text, ("fever", "pus", "bleed", "bleeding", "allergy", "new soap", "medicine", "pain")):
            return "**Skin warning signs:** Any fever, pus, bleeding, allergy, new medicine, or severe pain?"

    if diarrhoea:
        if not _contains_any(context_text, ("day", "days", "today", "yesterday", "since", "hour", "hours")):
            return "**Diarrhoea details:** Since when, and how many times today?"
        if not _contains_any(context_text, ("blood", "mucus", "fever", "vomit", "vomiting", "pain")):
            return "**Warning signs:** Any fever, vomiting, stomach pain, blood, or mucus?"
        if not _contains_any(context_text, ("water", "urine", "dizzy", "weak", "dry", "thirst")):
            return "**Dehydration check:** Are you dizzy, very thirsty, or passing less urine?"

    if meaningful_turns_count <= 1:
        if fever:
            return "**Fever details:** How many days, and highest temperature if measured?"
        if respiratory:
            return "**Breathing details:** How many days, and any sputum or wheezing?"
        if abdomen:
            return "**Stomach problem:** Where is the pain/discomfort, and when did it start?"
        if urinary:
            return "**Urine problem:** When did it start? Any fever, side pain, or blood?"
        if gyn:
            return "**Women health:** When was your last period? Any chance of pregnancy?"
        if injury:
            return "**Injury details:** When did it happen? Any heavy bleeding or fainting?"
        if mental_health:
            return "**Your safety matters.** Are you safe from harming yourself right now?"
        return "**Start here:** Tell your age, sex, main problem, and when it started."

    if not _has_severity(context_text):
        return "**Severity:** Rate it 0 to 10. Is it better, worse, or same?"

    if "anything else important" in last_assistant_msg:
        return "**Medicines/allergy:** Any current medicines or known allergy?"

    if meaningful_turns_count <= 3:
        if fever:
            return "**Other symptoms:** Cough, rash, headache, burning urine, vomiting, or loose stools?"
        if respiratory:
            return "**Any danger signs:** Chest pain, fever, blood in sputum, or low SpO2?"
        if abdomen:
            return "**Other symptoms:** Vomiting, loose stools, blood, burning urine, or pregnancy?"
        if urinary:
            return "**Risk check:** Diabetes, kidney stone, pregnancy, fever, or side pain?"
        if gyn:
            return "**Warning signs:** Heavy bleeding, severe pain, fever, discharge, or dizziness?"
        if injury:
            return "**Wound check:** Is it deep, dirty, swollen, very painful, or from a bite/burn?"
        return "**Anything else important?** Tell one symptom you have, or type 'nothing else'."

    if not _contains_any(context_text, ("medicine", "tablet", "injection", "allergy", "no allergy", "none", " no ")):
        return "**Medicines/allergy:** Any current medicines or known allergy?"

    if not _contains_any(context_text, ("diabetes", "bp", "blood pressure", "asthma", "heart", "surgery", "no history", "none")):
        return "**Past history:** Any diabetes, BP, asthma, heart problem, or surgery?"

    return "**History intake is complete.** Please continue to document upload."



class GeminiProvider(LLMProvider):
    """LLM provider using the Google Gemini API."""

    def __init__(self, settings: Settings) -> None:
        self._model = settings.GEMINI_MODEL
        self._api_key = settings.GEMINI_API_KEY.strip()
        self._client: genai.Client | None = None

    def _api_key_configured(self) -> bool:
        if not self._api_key:
            return False
        lowered = self._api_key.lower()
        return not (
            "your-key" in lowered
            or "your api key" in lowered
            or "your-gemini-key" in lowered
        )

    def _get_client(self) -> Any:
        if self._client is None:
            if genai is None:
                raise ProviderError("gemini", "google-genai SDK is not installed")
            if not self._api_key_configured():
                raise ProviderError("gemini", "GEMINI_API_KEY is not configured")
            self._client = genai.Client(api_key=self._api_key)
        return self._client


    @property
    def provider_name(self) -> str:
        return "gemini"

    async def chat(self, messages: list[dict[str, str]]) -> str:
        """Call the Gemini API and raise ProviderError when it is unavailable."""
        system_instruction: str | None = None
        contents: list[dict[str, Any]] = []

        for msg in messages:
            if msg["role"] == "system":
                system_instruction = msg["content"]
            else:
                role = "model" if msg["role"] == "assistant" else "user"
                contents.append(
                    {
                        "role": role,
                        "parts": [{"text": msg["content"]}],
                    }
                )

        config_kwargs: dict[str, Any] = {"max_output_tokens": 4096, "temperature": 0.2}
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction

        try:
            client = self._get_client()
            response = await client.aio.models.generate_content(
                model=self._model,
                contents=contents,
                config=types.GenerateContentConfig(**config_kwargs),
            )
            if response.text:
                return response.text
            raise ProviderError("gemini", "empty response")
        except Exception as exc:
            logger.warning(f"Gemini API call failed: {exc}.")
            raise ProviderError("gemini", str(exc)) from exc

        # ── Fallback clinical response generator (Turn-Aware Progressing Intake) ──
        meaningful_turns_count = _meaningful_turn_count(messages)
        last_user_msg = ""
        last_assistant_msg = ""
        for m in reversed(messages):
            if m["role"] == "user":
                last_user_msg = m["content"].lower()
                break
        for m in reversed(messages):
            if m["role"] == "assistant":
                last_assistant_msg = m["content"].lower()
                break

        # If summarization prompt
        if system_instruction and "structured clinical summary" in system_instruction.lower():
            # Build summary dynamically from transcript turns
            user_messages = [m["content"] for m in messages if m["role"] == "user"]
            chief = user_messages[0] if user_messages else "Patient reported acute symptoms"
            details = " | ".join(user_messages[1:]) if len(user_messages) > 1 else "Intake recorded via kiosk interface."
            return f'''{{
  "chief_complaint": {json.dumps(chief)},
  "history_of_present_illness": {json.dumps("Patient reported: " + details)},
  "associated_symptoms": ["General discomfort"],
  "pertinent_negatives": ["No loss of consciousness"],
  "medications": ["None reported"],
  "allergies": ["No known drug allergies (NKDA)"],
  "past_medical_history": "No major past illnesses recorded",
  "red_flags": [],
  "assessment": "Pending doctor physical examination and vital signs review",
  "plan": "Doctor OPD consultation and preliminary triage"
}}'''

        transcript_text = " ".join(
            m["content"].lower()
            for m in messages
            if m["role"] == "user" and m["content"].lower() != last_user_msg
        )
        return _fallback_question(last_user_msg, meaningful_turns_count, transcript_text, last_assistant_msg)


    async def health_check(self) -> bool:
        """Verify connectivity."""
        if not self._api_key_configured():
            return False
        try:
            await self._get_client().aio.models.generate_content(
                model=self._model,
                contents=[{"role": "user", "parts": [{"text": "ping"}]}],
                config=types.GenerateContentConfig(max_output_tokens=1),
            )
            return True
        except Exception:
            logger.warning("Gemini API ping failed")
            return False
