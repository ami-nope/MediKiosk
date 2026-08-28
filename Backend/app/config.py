"""
MediKiosk — Application configuration via pydantic-settings.

All settings are read from environment variables (or a .env file).
See .env.example for the full list of options.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
WORKSPACE_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Central configuration for MediKiosk backend."""

    model_config = SettingsConfigDict(
        env_file=(WORKSPACE_ENV_FILE, BACKEND_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./medikiosk.db"

    # ── LLM provider ─────────────────────────────────────────────────────
    LLM_PROVIDER: str = "omniroute"
    LLM_FALLBACK_PROVIDERS: str = "groq,gemini,omniroute,openrouter,anthropic"

    # OpenAI-compatible
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_TIMEOUT_SECONDS: float = 45.0
    OPENAI_MAX_TOKENS: int = 96

    # Summary generation is local by default so the kiosk never waits on GPU.
    SUMMARY_USE_LLM: bool = False
    SUMMARY_LLM_TIMEOUT_SECONDS: float = 10.0

    # Anthropic / Claude
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"

    # Google Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.7-flash"

    # Groq
    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com"
    GROQ_MODEL: str = "qwen/qwen3.6-27b"
    GROQ_TIMEOUT_SECONDS: float = 45.0
    GROQ_MAX_COMPLETION_TOKENS: int = 2048

    # OpenRouter / Omnirouter-compatible
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "http://localhost:20128/v1"
    OPENROUTER_MODEL: str = "auto/pro-reasoning"
    OPENROUTER_TIMEOUT_SECONDS: float = 45.0
    OPENROUTER_MAX_TOKENS: int = 512

    # Ollama (local)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3"

    # ── Sarvam voice interaction ────────────────────────────────────────
    SARVAM_API_KEY: str = ""
    SARVAM_STT_MODEL: str = "saaras:v3-realtime"
    SARVAM_TTS_MODEL: str = "bulbul:v3"
    SUPPORTED_LANGUAGES: list[str] = ["en-IN", "hi-IN", "bn-IN", "or-IN"]

    # ── File uploads ──────────────────────────────────────────────────────
    UPLOAD_DIR: str = "./uploads"

    # ── CORS ──────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse the comma-separated CORS_ORIGINS string into a list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def llm_fallback_provider_list(self) -> list[str]:
        """Parse the comma-separated fallback provider list."""
        return [provider.strip() for provider in self.LLM_FALLBACK_PROVIDERS.split(",") if provider.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
