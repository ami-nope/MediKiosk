"""
LLM Provider factory.

Reads the LLM_PROVIDER setting and returns the appropriate concrete provider
instance. This is the only place where provider selection logic lives —
the rest of the application is provider-agnostic.
"""

from __future__ import annotations

from app.config import Settings
from app.providers.llm.base import LLMProvider


def _normalise_provider_name(provider: str) -> str:
    value = provider.strip().lower()
    if value == "omnirouter":
        return "omniroute"
    return value


def create_llm_provider(settings: Settings) -> LLMProvider:
    """
    Factory function that instantiates the correct LLM provider based on config.

    Args:
        settings: Application settings containing LLM_PROVIDER and provider-specific keys.

    Returns:
        A concrete LLMProvider instance.

    Raises:
        ValueError: If LLM_PROVIDER is not a recognised provider name.
    """
    provider = _normalise_provider_name(settings.LLM_PROVIDER)

    if provider == "openai":
        from app.providers.llm.openai import OpenAIProvider
        return OpenAIProvider(settings)

    if provider == "anthropic":
        from app.providers.llm.anthropic import AnthropicProvider
        return AnthropicProvider(settings)

    if provider == "gemini":
        from app.providers.llm.gemini import GeminiProvider
        return GeminiProvider(settings)

    if provider == "groq":
        from app.providers.llm.groq import GroqProvider
        return GroqProvider(settings)

    if provider == "ollama":
        from app.providers.llm.ollama import OllamaProvider
        return OllamaProvider(settings)

    if provider in {"openrouter", "omnirouter", "omniroute"}:
        from app.providers.llm.openrouter import OpenRouterProvider
        return OpenRouterProvider(settings)

    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER '{provider}'. "
            "Supported values: 'openai', 'anthropic', 'gemini', 'groq', 'ollama', "
            "'omniroute' (aliases: 'omnirouter', 'openrouter')."
        )


def create_chat_llm_provider(settings: Settings) -> LLMProvider:
    """Create the chatbot provider chain: Ami first, then configured fallbacks."""
    provider_names = ["openai", settings.LLM_PROVIDER, *settings.llm_fallback_provider_list]
    return _create_fallback_provider(settings, provider_names)


def create_summary_llm_provider(settings: Settings) -> LLMProvider:
    """Create the report provider chain with a timeout for each model attempt."""
    provider_names = ["openai", settings.LLM_PROVIDER, *settings.llm_fallback_provider_list]
    return _create_fallback_provider(
        settings,
        provider_names,
        chat_timeout=settings.SUMMARY_LLM_TIMEOUT_SECONDS,
    )


def _create_fallback_provider(
    settings: Settings,
    provider_names: list[str],
    *,
    chat_timeout: float | None = None,
) -> LLMProvider:
    from app.providers.llm.fallback import FallbackLLMProvider

    providers: list[LLMProvider] = []
    seen: set[str] = set()

    for provider_name in provider_names:
        normalised = _normalise_provider_name(provider_name)
        if not normalised or normalised in seen:
            continue
        seen.add(normalised)
        try:
            provider_settings = settings.model_dump()
            provider_settings["LLM_PROVIDER"] = normalised
            providers.append(create_llm_provider(Settings(**provider_settings)))
        except ValueError:
            continue

    return FallbackLLMProvider(providers, chat_timeout=chat_timeout)
