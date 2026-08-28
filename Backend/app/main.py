"""
MediKiosk — FastAPI application entry-point.

Creates the app, registers routers, exception handlers, CORS, and the lifespan
context manager for startup/shutdown events.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.exceptions import register_exception_handlers


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan — run setup on startup, cleanup on shutdown."""
    settings = get_settings()

    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    yield  # Application is running

    # Shutdown: dispose of the DB engine
    from app.database import engine
    await engine.dispose()


def create_app() -> FastAPI:
    """Application factory."""
    settings = get_settings()

    app = FastAPI(
        title="MediKiosk API",
        description="AI-powered clinical history intake platform for hospital OPDs",
        version="0.1.0",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Exception handlers ────────────────────────────────────────────────
    register_exception_handlers(app)

    # ── Routers ───────────────────────────────────────────────────────────
    from app.routers import admin, consent, documents, health, history, patients, sessions, voice

    app.include_router(admin.router)
    app.include_router(health.router)
    app.include_router(patients.router)
    app.include_router(sessions.router)
    app.include_router(history.router)
    app.include_router(documents.router)
    app.include_router(consent.router)
    app.include_router(voice.router)

    return app


app = create_app()
