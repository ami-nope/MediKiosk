"""Local admin routes for AI provider configuration."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.ai_config_service import get_admin_ai_config, update_admin_ai_config


router = APIRouter(prefix="/admin", tags=["Admin"])


class AdminProviderUpdate(BaseModel):
    enabled: bool | None = None
    api_key: str | None = None
    clear_api_key: bool = False
    model: str | None = None
    base_url: str | None = None


class AdminAIConfigUpdate(BaseModel):
    active_provider: str = Field(..., description="Active AI provider")
    providers: dict[str, AdminProviderUpdate] = Field(default_factory=dict)


@router.get("/ai-config")
async def read_ai_config() -> dict[str, Any]:
    return get_admin_ai_config()


@router.put("/ai-config")
async def write_ai_config(data: AdminAIConfigUpdate) -> dict[str, Any]:
    return update_admin_ai_config(data.model_dump())
