"""Fallback chain for chat LLM providers."""

from __future__ import annotations

import asyncio
import logging

from app.exceptions import ProviderError
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class FallbackLLMProvider(LLMProvider):
    """Try providers in order and remember which one answered."""

    def __init__(
        self,
        providers: list[LLMProvider],
        *,
        health_timeout: float = 3.0,
        chat_timeout: float | None = None,
    ) -> None:
        if not providers:
            raise ValueError("FallbackLLMProvider requires at least one provider")
        self._providers = providers
        self._health_timeout = health_timeout
        self._chat_timeout = chat_timeout
        self._last_used_provider: str | None = None
        self._last_error: str | None = None
        self._last_fallback_reason: str | None = None

    @property
    def last_used_provider(self) -> str | None:
        return self._last_used_provider

    @property
    def last_error(self) -> str | None:
        return self._last_error

    @property
    def fallback_reason(self) -> str | None:
        return self._last_fallback_reason

    @property
    def provider_name(self) -> str:
        return self._last_used_provider or self._providers[0].provider_name

    def _failure_reason(self, provider: LLMProvider, exc: Exception | None = None) -> str:
        if exc is None:
            detail = "empty response"
        elif isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
            detail = "timed out"
        else:
            detail = getattr(exc, "detail", str(exc))
        detail = " ".join(detail.split())
        if len(detail) > 240:
            detail = f"{detail[:237]}..."
        return f"{provider.provider_name}: {detail}"

    async def chat(self, messages: list[dict[str, str]]) -> str:
        errors: list[str] = []
        self._last_used_provider = None
        self._last_fallback_reason = None

        for provider in self._providers:
            try:
                if self._chat_timeout is None:
                    reply = await provider.chat(messages)
                else:
                    reply = await asyncio.wait_for(provider.chat(messages), timeout=self._chat_timeout)
                if reply.strip():
                    self._last_used_provider = provider.provider_name
                    self._last_error = None
                    self._last_fallback_reason = "; ".join(errors) if errors else None
                    return reply
                errors.append(self._failure_reason(provider))
            except (ProviderError, TimeoutError, asyncio.TimeoutError) as exc:
                errors.append(self._failure_reason(provider, exc))
                logger.warning("LLM provider failed; trying next provider", exc_info=True)
            except Exception as exc:
                errors.append(self._failure_reason(provider, exc))
                logger.warning("Unexpected LLM provider failure; trying next provider", exc_info=True)

        self._last_error = "; ".join(errors) or "No provider answered."
        self._last_fallback_reason = self._last_error
        raise ProviderError("fallback", self._last_error)

    async def health_check(self) -> bool:
        errors: list[str] = []

        for provider in self._providers:
            try:
                healthy = await asyncio.wait_for(provider.health_check(), timeout=self._health_timeout)
                if healthy:
                    self._last_used_provider = provider.provider_name
                    self._last_error = None
                    return True
                errors.append(f"{provider.provider_name}: unhealthy")
            except Exception as exc:
                errors.append(f"{provider.provider_name}: {exc}")

        self._last_error = "; ".join(errors) or "No provider is healthy."
        return False
