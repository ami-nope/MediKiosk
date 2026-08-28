"""Health check router."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from app.dependencies import get_app_settings, get_llm_provider
from app.providers.llm.base import LLMProvider
from app.schemas.health import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(
    llm: LLMProvider = Depends(get_llm_provider),
) -> HealthResponse:
    """
    Basic health check — also pings the configured LLM provider.
    """
    llm_reachable = False
    try:
        llm_reachable = await asyncio.wait_for(llm.health_check(), timeout=8.0)
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        llm_provider=llm.provider_name,
        llm_reachable=llm_reachable,
        llm_error=getattr(llm, "last_error", None),
    )
