"""Speech-to-text provider interfaces."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass(frozen=True)
class STTEvent:
    event: str
    text: str = ""
    language: str | None = None
    message: str | None = None


class STTProvider(ABC):
    @abstractmethod
    async def stream(self, audio: AsyncIterator[bytes]) -> AsyncIterator[STTEvent]:
        """Yield provider events while consuming raw mono PCM audio."""
        yield STTEvent(event="error", message="STT provider is not configured")
