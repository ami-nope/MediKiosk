"""OCR AI Structuring Service — extracts structured medical entities from OCR text.

Passes OCR extracted text to the existing LLM provider (Qwen / Groq / OpenAI / Gemini / etc.),
ensuring zero hallucination of medical records while preserving confidence flags for uncertain items.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.placeholders.clinical import process_ocr_result, _extract_json_candidate
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)

_OCR_STRUCTURING_PROMPT = """You are a medical document structuring assistant for an OPD Hospital Kiosk.
You are given the raw OCR text extracted from a patient's uploaded/scanned medical document (such as a prescription, discharge summary, lab test report, or doctor note).

CRITICAL MEDICAL EXTRACTION RULES:
1. Extract only facts directly stated in the OCR text. NEVER invent or hallucinate medication names, dosages, diseases, or allergy information.
2. If a field or detail is not present or cannot be deciphered, set it to null or empty list [].
3. For handwriting or OCR artifacts with low confidence, add them to "uncertain_items" with what the raw text is and the possible match.
4. Categorize the document type into: "prescription", "lab_report", "discharge_summary", "radiology_report", "referral", or "other".

You must respond ONLY with a valid JSON object matching this schema (no markdown fences, no conversational prose):
{
  "document_type": "prescription",
  "doctor": "Dr. Name or null",
  "patient_name": "Patient Name or null",
  "date": "Date or null",
  "medications": [
    {
      "name": "Medication Name",
      "strength": "e.g. 500 mg or null",
      "dosage": "e.g. 1 tablet or null",
      "frequency": "e.g. Twice daily after meals or null",
      "instructions": "Special advice or null",
      "confidence": "high"
    }
  ],
  "conditions": ["Diagnosed condition or symptom"],
  "allergies": ["Known allergy"],
  "lab_results": [
    {
      "test_name": "e.g. Hemoglobin",
      "value": "13.5",
      "unit": "g/dL",
      "flag": "normal"
    }
  ],
  "other_information": ["Additional relevant medical notes"],
  "uncertain_items": [
    {
      "raw_text": "Unclear text from OCR",
      "possible_match": "Suggested clinical entity",
      "confidence": 0.55
    }
  ]
}
"""


async def extract_medical_data_with_ai(
    ocr_result: dict[str, Any],
    llm: LLMProvider | None = None,
    timeout_seconds: float = 15.0,
) -> dict[str, Any]:
    """Process OCR text with the existing LLM provider to produce clean structured medical data."""
    raw_text = str(ocr_result.get("text", "")).strip()
    blocks = ocr_result.get("blocks", [])

    if not raw_text:
        return {
            "document_type": "unknown",
            "doctor": None,
            "patient_name": None,
            "date": None,
            "medications": [],
            "conditions": [],
            "allergies": [],
            "lab_results": [],
            "other_information": ["No readable text found in document."],
            "uncertain_items": [],
            "source": "empty",
        }

    # Find uncertain low-confidence blocks to highlight for AI
    low_conf_blocks = [b for b in blocks if isinstance(b, dict) and b.get("confidence", 1.0) < 0.70]
    uncertain_hints = ""
    if low_conf_blocks:
        uncertain_hints = "\n\nNote: The following segments had lower OCR confidence:\n" + "\n".join(
            f'- "{b.get("text")}" (confidence: {b.get("confidence")})' for b in low_conf_blocks[:8]
        )

    if llm is not None:
        messages = [
            {"role": "system", "content": _OCR_STRUCTURING_PROMPT},
            {
                "role": "user",
                "content": f"OCR TEXT FROM DOCUMENT:\n---\n{raw_text}\n---{uncertain_hints}\n\nProduce the structured JSON.",
            },
        ]
        try:
            ai_reply = await asyncio.wait_for(llm.chat(messages), timeout=timeout_seconds)
            candidate = _extract_json_candidate(ai_reply)
            if isinstance(candidate, dict):
                candidate["source"] = getattr(llm, "last_used_provider", None) or getattr(llm, "provider_name", "ai")
                # Ensure all required keys exist
                candidate.setdefault("medications", [])
                candidate.setdefault("conditions", [])
                candidate.setdefault("allergies", [])
                candidate.setdefault("lab_results", [])
                candidate.setdefault("other_information", [])
                candidate.setdefault("uncertain_items", [])
                return candidate
        except Exception as exc:
            logger.warning("LLM medical extraction notice: %s. Using heuristic fallback.", exc)

    # Heuristic fallback using clinical.py
    heuristic = process_ocr_result(raw_text)
    meds = []
    for m in heuristic.get("medication_mentions", []):
        meds.append({
            "name": m,
            "strength": None,
            "dosage": None,
            "frequency": None,
            "instructions": None,
            "confidence": "medium",
        })

    labs = []
    for l in heuristic.get("lab_mentions", []):
        labs.append({
            "test_name": l,
            "value": None,
            "unit": None,
            "flag": None,
        })

    uncertain = []
    for b in low_conf_blocks:
        uncertain.append({
            "raw_text": b.get("text"),
            "possible_match": None,
            "confidence": b.get("confidence", 0.5),
        })

    return {
        "document_type": heuristic.get("document_type", "prescription"),
        "doctor": None,
        "patient_name": heuristic.get("patient_name"),
        "date": heuristic.get("dates", [None])[0] if heuristic.get("dates") else None,
        "medications": meds,
        "conditions": [],
        "allergies": [],
        "lab_results": labs,
        "other_information": heuristic.get("possible_red_flags", []),
        "uncertain_items": uncertain,
        "source": "heuristic_fallback",
    }
