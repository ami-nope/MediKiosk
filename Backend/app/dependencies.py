"""
MediKiosk — FastAPI dependency injection providers.
"""

from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import async_session_factory
from app.providers.llm.base import LLMProvider
from app.providers.llm.factory import create_chat_llm_provider
from app.services.ai_config_service import get_effective_settings


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session and ensure it's closed after the request."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── LLM provider singleton ───────────────────────────────────────────────
_llm_provider: LLMProvider | None = None


def get_llm_provider() -> LLMProvider:
    """Return the configured LLM provider (lazily instantiated singleton)."""
    return create_chat_llm_provider(get_effective_settings())


def get_app_settings() -> Settings:
    """Dependency wrapper around the cached settings."""
    return get_settings()
