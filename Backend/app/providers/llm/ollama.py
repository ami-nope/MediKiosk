"""
Ollama LLM provider — STUB.

This provider is intentionally not implemented. Fill in the chat() and
health_check() methods when you're ready to integrate with a local Ollama
server.
"""

from __future__ import annotations

import logging

import httpx

from app.config import Settings
from app.exceptions import ProviderError
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class OllamaProvider(LLMProvider):
    """LLM provider for a local Ollama server."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self._model = settings.OLLAMA_MODEL

    @property
    def provider_name(self) -> str:
        return "ollama"

    async def chat(self, messages: list[dict[str, str]]) -> str:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self._base_url}/api/chat",
                    json={
                        "model": self._model,
                        "messages": messages,
                        "stream": False,
                    },
                )
                response.raise_for_status()
                data = response.json()
                if isinstance(data, dict):
                    message = data.get("message")
                    if isinstance(message, dict):
                        content = message.get("content")
                        if isinstance(content, str):
                            return content
                    response_text = data.get("response")
                    if isinstance(response_text, str):
                        return response_text
                return ""
        except ProviderError:
            raise
        except Exception as exc:
            logger.warning("Ollama chat failed", exc_info=True)
            raise ProviderError("ollama", str(exc)) from exc

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self._base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            logger.warning("Ollama health check failed")
            return False
