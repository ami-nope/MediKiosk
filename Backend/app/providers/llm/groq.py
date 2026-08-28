"""Groq LLM provider using the official Groq SDK."""

from __future__ import annotations

import logging
from typing import Any

try:
    from groq import (  # type: ignore
        APIConnectionError,
        APITimeoutError,
        AuthenticationError,
        AsyncGroq,
        BadRequestError,
        NotFoundError,
        RateLimitError,
    )
except (ImportError, ModuleNotFoundError):
    AsyncGroq = None  # type: ignore
    APIConnectionError = APITimeoutError = AuthenticationError = BadRequestError = None  # type: ignore
    NotFoundError = RateLimitError = None  # type: ignore

from app.config import Settings
from app.exceptions import ProviderError
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class GroqProvider(LLMProvider):
    """LLM provider using Groq chat completions with streamed responses."""

    _TOOL_SAFE_FALLBACK_MODEL = "qwen/qwen3.6-27b"

    def __init__(self, settings: Settings) -> None:
        self._model = settings.GROQ_MODEL
        self._api_key = settings.GROQ_API_KEY.strip()
        self._base_url = settings.GROQ_BASE_URL.rstrip("/")
        self._timeout = settings.GROQ_TIMEOUT_SECONDS
        self._max_completion_tokens = settings.GROQ_MAX_COMPLETION_TOKENS
        self._client: Any | None = None
        self._last_error: str | None = None

    def _api_key_configured(self) -> bool:
        if not self._api_key:
            return False
        lowered = self._api_key.lower()
        return not (
            lowered.startswith("gsk-your")
            or "your-key" in lowered
            or "your-api-key" in lowered
        )

    def _get_client(self) -> Any:
        if self._client is None:
            if AsyncGroq is None:
                raise ProviderError("groq", "groq SDK is not installed")
            if not self._api_key_configured():
                raise ProviderError("groq", "GROQ_API_KEY is not configured")
            base_url = self._base_url.removesuffix("/openai/v1")
            self._client = AsyncGroq(
                api_key=self._api_key,
                base_url=base_url,
                timeout=self._timeout,
            )
        return self._client

    @property
    def last_error(self) -> str | None:
        return self._last_error

    @property
    def provider_name(self) -> str:
        return "groq"

    async def chat(self, messages: list[dict[str, str]]) -> str:
        """Call Groq using the streamed chat-completions shape from the SDK."""
        try:
            return await self._chat_with_model(self._model, messages)
        except ProviderError:
            raise
        except Exception as exc:
            if self._should_retry_without_gpt_oss_tools(exc):
                logger.warning(
                    "Groq model %s attempted blocked tool use; retrying with %s",
                    self._model,
                    self._TOOL_SAFE_FALLBACK_MODEL,
                )
                try:
                    return await self._chat_with_model(self._TOOL_SAFE_FALLBACK_MODEL, messages)
                except Exception as retry_exc:
                    self._last_error = str(retry_exc)
                    logger.warning("Groq fallback chat failed", exc_info=True)
                    raise self._provider_error_from_exception(retry_exc) from retry_exc

            self._last_error = str(exc)
            logger.warning("Groq chat failed", exc_info=True)
            raise self._provider_error_from_exception(exc) from exc

    async def _chat_with_model(self, model: str, messages: list[dict[str, str]]) -> str:
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_completion_tokens": self._max_completion_tokens,
            "top_p": 1,
            "stream": True,
            "stop": None,
        }
        reasoning_effort = self._reasoning_effort_for_model(model)
        if reasoning_effort is not None:
            kwargs["reasoning_effort"] = reasoning_effort

        try:
            completion = await self._get_client().chat.completions.create(**kwargs)

            chunks: list[str] = []
            async for chunk in completion:
                content = chunk.choices[0].delta.content or ""
                if content:
                    chunks.append(content)
            self._last_error = None
            return "".join(chunks)

        except TypeError as exc:
            if "reasoning_effort" not in str(exc):
                raise
            kwargs.pop("reasoning_effort", None)
            completion = await self._get_client().chat.completions.create(**kwargs)

            chunks = []
            async for chunk in completion:
                content = chunk.choices[0].delta.content or ""
                if content:
                    chunks.append(content)
            self._last_error = None
            return "".join(chunks)

    def _reasoning_effort_for_model(self, model: str) -> str | None:
        if model.startswith("openai/gpt-oss"):
            return "medium"
        if model == "qwen/qwen3.6-27b":
            return "none"
        return None

    def _should_retry_without_gpt_oss_tools(self, exc: Exception) -> bool:
        if self._model == self._TOOL_SAFE_FALLBACK_MODEL:
            return False
        message = str(exc).lower()
        return (
            self._model.startswith("openai/gpt-oss")
            and "tool choice is none" in message
            and "model called a tool" in message
        )

    def _provider_error_from_exception(self, exc: Exception) -> ProviderError:
        message = str(exc)
        if AuthenticationError is not None and isinstance(exc, AuthenticationError):
            return ProviderError("groq", "Groq API key was rejected. Check the saved key.")
        if RateLimitError is not None and isinstance(exc, RateLimitError):
            return ProviderError("groq", "Groq rate limit reached. Please retry shortly.")
        if NotFoundError is not None and isinstance(exc, NotFoundError):
            return ProviderError("groq", f"Configured Groq model '{self._model}' is not available.")
        if APITimeoutError is not None and isinstance(exc, (APITimeoutError, TimeoutError)):
            return ProviderError("groq", "Groq timed out. Please retry.")
        if APIConnectionError is not None and isinstance(exc, APIConnectionError):
            return ProviderError("groq", "Groq is unavailable from this server.")
        if BadRequestError is not None and isinstance(exc, BadRequestError):
            return ProviderError("groq", message)
        return ProviderError("groq", message)

    async def health_check(self) -> bool:
        if not self._api_key_configured():
            self._last_error = "GROQ_API_KEY is not configured"
            return False
        try:
            await self._get_client().models.list()
            self._last_error = None
            return True
        except Exception as exc:
            self._last_error = str(exc)
            logger.warning("Groq health check failed", exc_info=True)
            return False
