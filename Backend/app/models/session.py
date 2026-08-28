"""Session model."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SessionStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    AWAITING_REVIEW = "awaiting_review"
    COMPLETED = "completed"


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, native_enum=False, length=20),
        nullable=False,
        default=SessionStatus.IN_PROGRESS,
        index=True,
    )
    is_priority: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # Relationships
    patient = relationship("Patient", back_populates="sessions", lazy="selectin")
    history_record = relationship(
        "HistoryRecord", back_populates="session", uselist=False, lazy="selectin",
    )
    documents = relationship("Document", back_populates="session", lazy="selectin")
    consent_logs = relationship("ConsentLog", back_populates="session", lazy="selectin")
