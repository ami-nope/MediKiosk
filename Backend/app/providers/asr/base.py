"""
ASR (Automatic Speech Recognition) Provider — Abstract base class + stub.

Same pattern as LLMProvider. When you're ready to integrate an ASR service
(Whisper, Google Speech-to-Text, etc.), create a concrete subclass and a
factory function mirroring the LLM provider setup.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class ASRProvider(ABC):
    """Abstract base class for ASR providers."""

    @abstractmethod
    async def transcribe(self, audio_bytes: bytes, language: str = "en") -> str:
        """
        Transcribe audio bytes to text.

        Args:
            audio_bytes: Raw audio data.
            language: BCP-47 language code.

        Returns:
            Transcribed text.
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Check whether the ASR provider is reachable."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable name of this provider."""
        ...


class StubASRProvider(ASRProvider):
    """Placeholder ASR provider — not yet implemented."""

    @property
    def provider_name(self) -> str:
        return "stub_asr"

    async def transcribe(self, audio_bytes: bytes, language: str = "en") -> str:
        # TODO: Implement ASR integration (e.g. Whisper API, Google STT, etc.)
        raise NotImplementedError("ASR provider is not yet implemented.")

    async def health_check(self) -> bool:
        # TODO: Implement ASR health check.
        raise NotImplementedError("ASR health check is not yet implemented.")
