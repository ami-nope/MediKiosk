"""OmniRouter OpenAI-compatible AI gateway provider."""

from __future__ import annotations

import logging

from openai import APIConnectionError, APITimeoutError, AsyncOpenAI, NotFoundError, RateLimitError

from app.config import Settings
from app.exceptions import ProviderError
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class OpenRouterProvider(LLMProvider):
    """LLM provider using OmniRouter's OpenAI-compatible API."""

    def __init__(self, settings: Settings) -> None:
        self._model = settings.OPENROUTER_MODEL
        self._api_key = settings.OPENROUTER_API_KEY.strip()
        self._base_url = settings.OPENROUTER_BASE_URL
        self._timeout = settings.OPENROUTER_TIMEOUT_SECONDS
        self._max_tokens = settings.OPENROUTER_MAX_TOKENS
        self._client: AsyncOpenAI | None = None

    def _api_key_configured(self) -> bool:
        if not self._api_key:
            return False
        lowered = self._api_key.lower()
        return not ("your-key" in lowered or "your-api-key" in lowered)

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            if not self._api_key_configured():
                raise ProviderError("openrouter", "OPENROUTER_API_KEY is not configured")
            self._client = AsyncOpenAI(
                api_key=self._api_key,
                base_url=self._base_url,
                timeout=self._timeout,
                default_headers={
                    "HTTP-Referer": "http://localhost:5173",
                    "X-OpenRouter-Title": "MediKIOSK",
                },
            )
        return self._client

    @property
    def provider_name(self) -> str:
        return "omniroute"

    async def chat(self, messages: list[dict[str, str]]) -> str:
        try:
            response = await self._get_client().chat.completions.create(
                model=self._model,
                messages=messages,  # type: ignore[arg-type]
                temperature=0.2,
                max_tokens=self._max_tokens,
            )
            return response.choices[0].message.content or ""
        except ProviderError:
            raise
        except RateLimitError as exc:
            logger.warning("OmniRouter rate limit hit", exc_info=True)
            raise ProviderError("omniroute", "AI gateway rate limit reached. Please retry shortly.") from exc
        except NotFoundError as exc:
            logger.warning("OmniRouter model not found", exc_info=True)
            raise ProviderError(
                "omniroute",
                f"Configured OmniRouter model '{self._model}' is not available.",
            ) from exc
        except (APITimeoutError, TimeoutError) as exc:
            logger.warning("OmniRouter chat timed out", exc_info=True)
            raise ProviderError("omniroute", "AI gateway timed out. Please retry.") from exc
        except APIConnectionError as exc:
            logger.warning("OmniRouter connection failed", exc_info=True)
            raise ProviderError("omniroute", "AI gateway is unavailable.") from exc
        except Exception as exc:
            logger.warning("OmniRouter chat failed", exc_info=True)
            raise ProviderError("omniroute", "AI gateway request failed.") from exc

    async def health_check(self) -> bool:
        if not self._api_key_configured():
            return False
        try:
            await self._get_client().models.list()
            return True
        except Exception:
            logger.warning("OpenRouter health check failed")
            return False
