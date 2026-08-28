"""
Anthropic / Claude LLM provider.

Uses the official Anthropic Python SDK with async support.
"""

from __future__ import annotations

import logging
from typing import Any

from anthropic import AsyncAnthropic

from app.config import Settings
from app.exceptions import ProviderError
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class AnthropicProvider(LLMProvider):
    """LLM provider using the Anthropic Messages API."""

    def __init__(self, settings: Settings) -> None:
        self._model = settings.ANTHROPIC_MODEL
        self._api_key = settings.ANTHROPIC_API_KEY.strip()
        self._client: AsyncAnthropic | None = None

    def _api_key_configured(self) -> bool:
        if not self._api_key:
            return False
        lowered = self._api_key.lower()
        return not (
            lowered.startswith("sk-ant-your")
            or "your-key" in lowered
            or "your-api-key" in lowered
        )

    def _get_client(self) -> AsyncAnthropic:
        if self._client is None:
            if not self._api_key_configured():
                raise ProviderError("anthropic", "ANTHROPIC_API_KEY is not configured")
            self._client = AsyncAnthropic(api_key=self._api_key)
        return self._client

    @property
    def provider_name(self) -> str:
        return "anthropic"

    async def chat(self, messages: list[dict[str, str]]) -> str:
        """
        Call the Anthropic Messages API.

        The Anthropic SDK expects system messages to be passed separately.
        This method extracts any leading system message and passes the rest
        as user/assistant turns.
        """
        system_prompt: str | None = None
        chat_messages: list[dict[str, str]] = []

        for msg in messages:
            if msg["role"] == "system":
                system_prompt = msg["content"]
            else:
                chat_messages.append(msg)

        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": 4096,
            "messages": chat_messages,
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        try:
            response = await self._get_client().messages.create(**kwargs)
            # The response content is a list of content blocks; extract the text.
            text_parts = [
                getattr(block, "text", "")
                for block in response.content
                if getattr(block, "text", None)
            ]
            return "".join(text_parts)
        except ProviderError:
            raise
        except Exception as exc:
            logger.warning("Anthropic chat failed", exc_info=True)
            raise ProviderError("anthropic", str(exc)) from exc

    async def health_check(self) -> bool:
        """Verify connectivity by sending a minimal request."""
        if not self._api_key_configured():
            return False
        try:
            await self._get_client().messages.create(
                model=self._model,
                max_tokens=1,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except Exception:
            logger.warning("Anthropic health check failed")
            return False
