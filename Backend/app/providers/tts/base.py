"""Text-to-speech provider interfaces."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator


class TTSProvider(ABC):
    @abstractmethod
    async def synthesize_stream(self, text: str, language: str) -> AsyncIterator[bytes]:
        """Yield encoded audio chunks for one sentence."""
        yield b""
