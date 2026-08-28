"""HistoryRecord model — one per session, accumulates the full conversation."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class HistoryRecord(Base):
    __tablename__ = "history_records"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    raw_transcript: Mapped[str] = mapped_column(
        Text, nullable=False, default="[]",
        comment="JSON-serialized list of message dicts [{role, content, timestamp}, ...]",
    )
    structured_json: Mapped[dict | None] = mapped_column(
        JSON, nullable=True,
        comment="LLM-extracted structured clinical data (chief complaint, HPI, etc.)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    session = relationship("Session", back_populates="history_record")
