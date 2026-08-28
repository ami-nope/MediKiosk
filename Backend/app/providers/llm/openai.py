"""
OpenAI-compatible LLM provider.

Works with the official OpenAI API and any compatible endpoint (Azure OpenAI,
vLLM, LM Studio, etc.) by setting OPENAI_BASE_URL.
"""

from __future__ import annotations

import logging
import re

import httpx
from openai import (
    APIConnectionError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
)

from app.config import Settings
from app.exceptions import ProviderError
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)

THINK_BLOCK_RE = re.compile(r"\s*<think\b[^>]*>.*?</think>\s*", re.IGNORECASE | re.DOTALL)


def _normalise_openai_base_url(base_url: str) -> str:
    """Accept either an OpenAI-compatible base URL or a pasted chat endpoint."""
    clean_url = base_url.strip().rstrip("/")
    chat_suffix = "/chat/completions"
    if clean_url.endswith(chat_suffix):
        clean_url = clean_url[: -len(chat_suffix)]
    return clean_url or "https://api.openai.com/v1"


class OpenAIProvider(LLMProvider):
    """LLM provider using the OpenAI chat completions API."""

    def __init__(self, settings: Settings) -> None:
        self._model = settings.OPENAI_MODEL
        self._api_key = settings.OPENAI_API_KEY.strip()
        self._base_url = _normalise_openai_base_url(settings.OPENAI_BASE_URL)
        self._timeout = settings.OPENAI_TIMEOUT_SECONDS
        self._max_tokens = settings.OPENAI_MAX_TOKENS
        self._client: AsyncOpenAI | None = None
        self._last_error: str | None = None

    def _api_key_configured(self) -> bool:
        if not self._api_key:
            return False
        lowered = self._api_key.lower()
        return not (
            lowered.startswith("sk-your")
            or "your-key" in lowered
            or "your-api-key" in lowered
        )

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            if not self._api_key_configured():
                raise ProviderError("openai", "OPENAI_API_KEY is not configured")
            self._client = AsyncOpenAI(
                api_key=self._api_key,
                base_url=self._base_url,
                timeout=self._timeout,
                default_headers={"User-Agent": "MediKIOSK/1.0"},
            )
        return self._client

    @property
    def last_error(self) -> str | None:
        return self._last_error

    def _rate_limit_message(self, exc: RateLimitError) -> str:
        detail = str(exc).lower()
        if "insufficient_quota" in detail or "credit_balance_exhausted" in detail:
            return "OpenAI billing credits exhausted. Add API credits and retry."
        return "OpenAI rate limit reached. Please retry shortly."

    @property
    def provider_name(self) -> str:
        if self._uses_amii_gateway():
            return "ami"
        return "openai"

    def _uses_amii_gateway(self) -> bool:
        return "api.amii.lol" in self._base_url.lower()

    def _uses_qwen_model(self) -> bool:
        return self._model.strip().lower().startswith("qwen")

    def _should_disable_thinking(self) -> bool:
        return self._uses_amii_gateway() or self._uses_qwen_model()

    def _thinking_extra_body(self) -> dict[str, bool] | None:
        if not self._should_disable_thinking():
            return None
        return {"think": False}

    def _strip_thinking(self, content: str) -> str:
        if not self._should_disable_thinking():
            return content
        return THINK_BLOCK_RE.sub("", content).strip()

    async def chat(self, messages: list[dict[str, str]]) -> str:
        """Call the OpenAI-compatible chat completions endpoint."""
        kwargs = {
            "model": self._model,
            "messages": messages,  # type: ignore[arg-type]
            "temperature": 0.2,
            "max_tokens": self._max_tokens,
        }
        extra_body = self._thinking_extra_body()
        if extra_body:
            kwargs["extra_body"] = extra_body

        try:
            response = await self._get_client().chat.completions.create(**kwargs)
            content = response.choices[0].message.content
            self._last_error = None
            return self._strip_thinking(content or "")
        except ProviderError:
            raise
        except BadRequestError as exc:
            if "extra_body" not in kwargs:
                logger.warning("OpenAI request was rejected", exc_info=True)
                raise ProviderError("openai", "OpenAI rejected the request. Check the configured model.") from exc

            logger.warning("OpenAI-compatible gateway rejected think=false; retrying without it", exc_info=True)
            kwargs.pop("extra_body", None)
            try:
                response = await self._get_client().chat.completions.create(**kwargs)
                content = response.choices[0].message.content
                self._last_error = None
                return self._strip_thinking(content or "")
            except BadRequestError as retry_exc:
                logger.warning("OpenAI request was rejected", exc_info=True)
                raise ProviderError("openai", "OpenAI rejected the request. Check the configured model.") from retry_exc
        except AuthenticationError as exc:
            logger.warning("OpenAI authentication failed", exc_info=True)
            raise ProviderError("openai", "OpenAI API key was rejected. Check the saved key.") from exc
        except RateLimitError as exc:
            logger.warning("OpenAI rate limit hit", exc_info=True)
            message = self._rate_limit_message(exc)
            self._last_error = message
            raise ProviderError("openai", message) from exc
        except NotFoundError as exc:
            logger.warning("OpenAI model not found", exc_info=True)
            raise ProviderError("openai", f"Configured OpenAI model '{self._model}' is not available.") from exc
        except PermissionDeniedError as exc:
            logger.warning("OpenAI-compatible gateway blocked the request", exc_info=True)
            raise ProviderError("openai", "OpenAI-compatible gateway blocked the request.") from exc
        except (APITimeoutError, TimeoutError) as exc:
            logger.warning("OpenAI chat timed out", exc_info=True)
            raise ProviderError("openai", "OpenAI timed out. Please retry.") from exc
        except APIConnectionError as exc:
            logger.warning("OpenAI connection failed", exc_info=True)
            raise ProviderError("openai", "OpenAI is unavailable from this server.") from exc
        except Exception as exc:
            logger.warning("OpenAI chat failed", exc_info=True)
            raise ProviderError("openai", str(exc)) from exc

    async def health_check(self) -> bool:
        """Check whether the configured OpenAI-compatible gateway is online."""
        if not self._api_key_configured():
            return False

        gateway_url = self._base_url.removesuffix("/v1")
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(gateway_url)
                if response.is_success:
                    self._last_error = None
                    return True
        except (httpx.TimeoutException, httpx.RequestError):
            self._last_error = "Ami gateway is unreachable from this server."
            logger.warning("OpenAI-compatible gateway status check failed", exc_info=True)
            return False

        try:
            kwargs = {
                "model": self._model,
                "messages": [
                    {"role": "system", "content": "Reply with OK only."},
                    {"role": "user", "content": "ping"},
                ],
                "temperature": 0,
                "max_tokens": 1,
            }
            extra_body = self._thinking_extra_body()
            if extra_body:
                kwargs["extra_body"] = extra_body

            response = await self._get_client().chat.completions.create(**kwargs)
            self._last_error = None
            return bool(response.choices)
        except BadRequestError:
            logger.warning("OpenAI health probe with token limit failed; retrying without token limit")
            try:
                response = await self._get_client().chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": "Reply with OK only."},
                        {"role": "user", "content": "ping"},
                    ],
                    temperature=0,
                )
                self._last_error = None
                return bool(response.choices)
            except RateLimitError as exc:
                self._last_error = self._rate_limit_message(exc)
                logger.warning("OpenAI health check retry hit rate limit", exc_info=True)
                return False
            except Exception:
                self._last_error = "OpenAI health check failed."
                logger.warning("OpenAI health check retry failed", exc_info=True)
                return False
        except AuthenticationError:
            self._last_error = "OpenAI API key was rejected."
            logger.warning("OpenAI health check authentication failed", exc_info=True)
            return False
        except RateLimitError as exc:
            self._last_error = self._rate_limit_message(exc)
            logger.warning("OpenAI health check hit rate limit", exc_info=True)
            return False
        except NotFoundError:
            self._last_error = f"OpenAI model '{self._model}' is not available."
            logger.warning("OpenAI health check model not found", exc_info=True)
            return False
        except PermissionDeniedError:
            self._last_error = "OpenAI-compatible gateway blocked the request."
            logger.warning("OpenAI health check was blocked", exc_info=True)
            return False
        except (APITimeoutError, TimeoutError):
            self._last_error = "OpenAI timed out."
            logger.warning("OpenAI health check timed out", exc_info=True)
            return False
        except APIConnectionError:
            self._last_error = "OpenAI is unreachable from this server."
            logger.warning("OpenAI health check connection failed", exc_info=True)
            return False
        except Exception:
            self._last_error = "OpenAI health check failed."
            logger.warning("OpenAI health check failed", exc_info=True)
            return False
