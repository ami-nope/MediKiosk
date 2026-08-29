"""OCR service — image validation, preprocessing, text extraction with confidence scoring.

Supports EasyOCR (CPU mode) with structured output (bounding boxes, confidence, text blocks),
along with robust fallback heuristics.
"""

from __future__ import annotations

import io
import logging
import asyncio
from typing import Any

from PIL import Image, ImageEnhance, ImageFilter

logger = logging.getLogger(__name__)

# ── Lazy-loaded OCR engine singleton ─────────────────────────────────────
_ocr_reader: Any = None
_ocr_available: bool | None = None


def get_ocr_reader() -> Any:
    """Lazy-init the EasyOCR reader (loaded once, reused across requests)."""
    global _ocr_reader, _ocr_available
    if _ocr_available is False:
        return None
    if _ocr_reader is not None:
        return _ocr_reader
    try:
        import easyocr
        # Initialize EasyOCR reader with CPU only
        _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        _ocr_available = True
        logger.info("EasyOCR reader initialised successfully (CPU mode).")
        return _ocr_reader
    except Exception as exc:
        _ocr_available = False
        logger.warning("EasyOCR init notice: %s", exc)
        return None


# ── Image Validation ─────────────────────────────────────────────────────

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB
MIN_DIMENSION = 100
MAX_DIMENSION = 8000


class ImageValidationError(Exception):
    """Raised when the uploaded document fails quality or security checks."""
    pass


def validate_and_load_image(data: bytes) -> Image.Image:
    """Validate image size, format, dimensions, and basic visibility."""
    if not data or len(data) == 0:
        raise ImageValidationError("Empty image file received.")

    if len(data) > MAX_FILE_SIZE:
        raise ImageValidationError(
            f"File too large ({len(data) / (1024 * 1024):.1f} MB). Maximum allowed size is 15 MB."
        )

    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        raise ImageValidationError("Invalid image format. Please capture or upload a clear PNG, JPEG, or WebP.")

    w, h = img.size
    if w < MIN_DIMENSION or h < MIN_DIMENSION:
        raise ImageValidationError(f"Image resolution too low ({w}x{h}px). Please move camera closer.")

    # Quality check: brightness
    try:
        sample = img.copy()
        sample.thumbnail((150, 150))
        gray = sample.convert("L")
        pixels = list(gray.getdata())
        avg_brightness = sum(pixels) / max(len(pixels), 1)
        if avg_brightness < 20:
            raise ImageValidationError("Document image is too dark. Please ensure good lighting.")
    except ImageValidationError:
        raise
    except Exception:
        pass

    return img


def preprocess_image(img: Image.Image) -> Image.Image:
    """Lightweight preprocessing to enhance text contrast without distorting handwriting."""
    # Scale down if extremely massive
    max_side = 2200
    w, h = img.size
    if max(w, h) > max_side:
        ratio = max_side / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    if img.mode != "RGB":
        img = img.convert("RGB")

    # Gentle contrast boost & mild sharpening
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.25)
    img = img.filter(ImageFilter.SHARPEN)

    return img


def image_to_png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def run_ocr_extraction(image_bytes: bytes) -> dict[str, Any]:
    """Execute OCR extraction on input image bytes.

    Returns:
        {
            "text": str,
            "blocks": list of {"text": str, "confidence": float, "bbox": [[x,y],...]},
            "average_confidence": float,
            "engine": str
        }
    """
    img = validate_and_load_image(image_bytes)
    processed = preprocess_image(img)

    reader = get_ocr_reader()
    if reader is not None:
        import numpy as np

        img_np = np.array(processed)
        loop = asyncio.get_running_loop()

        # Run synchronous EasyOCR in threadpool
        raw_results = await loop.run_in_executor(
            None,
            lambda: reader.readtext(img_np, detail=1, paragraph=False),
        )

        blocks = []
        text_lines = []
        total_conf = 0.0

        for bbox, text, conf in raw_results:
            clean_t = str(text).strip()
            if clean_t:
                confidence_score = round(float(conf), 3)
                blocks.append({
                    "text": clean_t,
                    "confidence": confidence_score,
                    "bbox": [[int(pt[0]), int(pt[1])] for pt in bbox],
                })
                text_lines.append(clean_t)
                total_conf += confidence_score

        avg_conf = round(total_conf / len(blocks), 3) if blocks else 0.0
        full_text = "\n".join(text_lines)

        return {
            "text": full_text,
            "blocks": blocks,
            "average_confidence": avg_conf,
            "engine": "easyocr_cpu",
        }

    # Fallback if EasyOCR is not loaded: pytesseract if installed, else simple notice
    try:
        import pytesseract
        loop = asyncio.get_running_loop()
        text = await loop.run_in_executor(None, lambda: pytesseract.image_to_string(processed))
        clean_text = text.strip()
        lines = [l.strip() for l in clean_text.splitlines() if l.strip()]
        blocks = [{"text": l, "confidence": 0.85, "bbox": []} for l in lines]
        return {
            "text": clean_text,
            "blocks": blocks,
            "average_confidence": 0.85,
            "engine": "pytesseract",
        }
    except Exception:
        pass

    return {
        "text": "",
        "blocks": [],
        "average_confidence": 0.0,
        "engine": "none",
        "error": "OCR engine currently initializing or not available.",
    }
