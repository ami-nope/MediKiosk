"""
MediKiosk — Custom exceptions and FastAPI exception handlers.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class NotFoundError(Exception):
    """Raised when a requested resource does not exist."""

    def __init__(self, resource: str, resource_id: str):
        self.resource = resource
        self.resource_id = resource_id
        super().__init__(f"{resource} with id '{resource_id}' not found")


class ProviderError(Exception):
    """Raised when an LLM / ASR / OCR provider call fails."""

    def __init__(self, provider: str, detail: str):
        self.provider = provider
        self.detail = detail
        super().__init__(f"Provider '{provider}' error: {detail}")


def register_exception_handlers(app: FastAPI) -> None:
    """Attach custom exception handlers to the FastAPI app."""

    @app.exception_handler(NotFoundError)
    async def not_found_handler(_request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={"detail": str(exc)},
        )

    @app.exception_handler(ProviderError)
    async def provider_error_handler(_request: Request, exc: ProviderError) -> JSONResponse:
        detail = str(exc)
        lowered = detail.lower()
        if "tool choice is none" in lowered and "model called a tool" in lowered:
            detail = "AI provider could not answer this turn. Please retry or continue the intake."
        return JSONResponse(
            status_code=502,
            content={"detail": detail, "provider": exc.provider},
        )
