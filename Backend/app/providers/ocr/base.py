"""
OCR (Optical Character Recognition) Provider — Abstract base class + stub.

Same pattern as LLMProvider. When you're ready to integrate an OCR service
(Tesseract, Google Vision, Azure Document Intelligence, etc.), create a
concrete subclass and a factory function mirroring the LLM provider setup.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class OCRProvider(ABC):
    """Abstract base class for OCR providers."""

    @abstractmethod
    async def extract_text(self, image_bytes: bytes) -> str:
        """
        Extract text from an image.

        Args:
            image_bytes: Raw image data (JPEG, PNG, PDF page, etc.).

        Returns:
            Extracted text content.
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Check whether the OCR provider is reachable."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable name of this provider."""
        ...


class StubOCRProvider(OCRProvider):
    """Placeholder OCR provider — not yet implemented."""

    @property
    def provider_name(self) -> str:
        return "stub_ocr"

    async def extract_text(self, image_bytes: bytes) -> str:
        # TODO: Implement OCR integration (e.g. Tesseract, Google Vision, etc.)
        raise NotImplementedError("OCR provider is not yet implemented.")

    async def health_check(self) -> bool:
        # TODO: Implement OCR health check.
        raise NotImplementedError("OCR health check is not yet implemented.")
