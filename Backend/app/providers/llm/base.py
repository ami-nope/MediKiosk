"""
LLM Provider — Abstract base class.

All LLM providers must implement this interface. The rest of the application
interacts only with this ABC, never with provider-specific code directly.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def chat(self, messages: list[dict[str, str]]) -> str:
        """
        Send a list of chat messages to the LLM and return the assistant reply.

        Args:
            messages: A list of message dicts, each with "role" and "content" keys.
                      Roles: "system", "user", "assistant".

        Returns:
            The assistant's reply as a plain string.
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Check whether the LLM provider is reachable and operational.

        Returns:
            True if the provider is healthy, False otherwise.
        """
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable name of this provider (e.g. 'openai', 'anthropic')."""
        ...
