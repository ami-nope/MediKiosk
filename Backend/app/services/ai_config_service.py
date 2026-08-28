"""Runtime AI provider configuration for the local admin screen."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.config import Settings, get_settings


BACKEND_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
WORKSPACE_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
PROVIDERS = ("gemini", "groq", "openai", "omniroute", "openrouter", "anthropic", "ollama")
ENV_PATHS_TO_SYNC = (BACKEND_ENV_PATH, WORKSPACE_ENV_PATH)

PROVIDER_ENV_KEYS: dict[str, dict[str, str]] = {
    "gemini": {
        "api_key": "GEMINI_API_KEY",
        "model": "GEMINI_MODEL",
    },
    "groq": {
        "api_key": "GROQ_API_KEY",
        "model": "GROQ_MODEL",
        "base_url": "GROQ_BASE_URL",
    },
    "openai": {
        "api_key": "OPENAI_API_KEY",
        "model": "OPENAI_MODEL",
        "base_url": "OPENAI_BASE_URL",
    },
    "openrouter": {
        "api_key": "OPENROUTER_API_KEY",
        "model": "OPENROUTER_MODEL",
        "base_url": "OPENROUTER_BASE_URL",
    },
    "omniroute": {
        "api_key": "OPENROUTER_API_KEY",
        "model": "OPENROUTER_MODEL",
        "base_url": "OPENROUTER_BASE_URL",
    },
    "anthropic": {
        "api_key": "ANTHROPIC_API_KEY",
        "model": "ANTHROPIC_MODEL",
    },
    "ollama": {
        "model": "OLLAMA_MODEL",
        "base_url": "OLLAMA_BASE_URL",
    },
}


def _normalise_provider(provider: str) -> str:
    value = (provider or "").strip().lower()
    if value == "omnirouter":
        return "omniroute"
    return value


def _is_real_api_key(value: str) -> bool:
    key = value.strip().lower()
    if not key:
        return False
    return not (
        key.startswith("sk-your")
        or key.startswith("sk-ant-your")
        or key.startswith("gsk-your")
        or "your-key" in key
        or "your-api-key" in key
        or "your-gemini-key" in key
    )


def _env_value(settings: Settings, provider: str, field: str) -> str:
    env_key = PROVIDER_ENV_KEYS.get(provider, {}).get(field)
    if not env_key:
        return ""
    value = getattr(settings, env_key, "")
    return "" if value is None else str(value)


def _read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _write_env_updates(path: Path, updates: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    remaining = dict(updates)
    rewritten: list[str] = []

    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#") or "=" not in raw_line:
            rewritten.append(raw_line)
            continue

        key, _value = raw_line.split("=", 1)
        clean_key = key.strip()
        if clean_key in remaining:
            rewritten.append(f"{clean_key}={remaining.pop(clean_key)}")
        else:
            rewritten.append(raw_line)

    if remaining:
        if rewritten and rewritten[-1].strip():
            rewritten.append("")
        for key, value in remaining.items():
            rewritten.append(f"{key}={value}")

    path.write_text("\n".join(rewritten) + "\n", encoding="utf-8")


def get_admin_ai_config() -> dict[str, Any]:
    settings = get_settings()
    active_provider = _normalise_provider(settings.LLM_PROVIDER)
    if active_provider not in PROVIDERS:
        active_provider = "gemini"

    response = {"active_provider": active_provider, "providers": {}}
    for provider in PROVIDERS:
        api_key = _env_value(settings, provider, "api_key")
        response["providers"][provider] = {
            "enabled": provider == active_provider,
            "api_key_configured": _is_real_api_key(api_key),
            "model": _env_value(settings, provider, "model"),
            "base_url": _env_value(settings, provider, "base_url"),
        }
    return response


def update_admin_ai_config(update: dict[str, Any]) -> dict[str, Any]:
    current_env = _read_env_file(BACKEND_ENV_PATH)
    active_provider = _normalise_provider(update.get("active_provider", current_env.get("LLM_PROVIDER", "gemini")))
    if active_provider not in PROVIDERS:
        active_provider = _normalise_provider(current_env.get("LLM_PROVIDER", "gemini"))
    if active_provider not in PROVIDERS:
        active_provider = "gemini"

    env_updates: dict[str, str] = {"LLM_PROVIDER": active_provider}
    providers = update.get("providers", {})
    if isinstance(providers, dict):
        for provider, values in providers.items():
            normalised = _normalise_provider(provider)
            if normalised not in PROVIDERS or not isinstance(values, dict):
                continue

            for field in ("model", "base_url"):
                env_key = PROVIDER_ENV_KEYS.get(normalised, {}).get(field)
                value = values.get(field)
                if env_key and value is not None:
                    env_updates[env_key] = str(value).strip()

            api_key_name = PROVIDER_ENV_KEYS.get(normalised, {}).get("api_key")
            if api_key_name and values.get("clear_api_key"):
                env_updates[api_key_name] = ""
            elif api_key_name and values.get("api_key"):
                env_updates[api_key_name] = str(values["api_key"]).strip()

    for env_path in ENV_PATHS_TO_SYNC:
        if env_path.exists() or env_path == BACKEND_ENV_PATH:
            _write_env_updates(env_path, env_updates)

    get_settings.cache_clear()
    return get_admin_ai_config()


def get_effective_settings() -> Settings:
    return get_settings()
