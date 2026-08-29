"""Patient model."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    external_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True,
        comment="Mock ABHA-style external identifier",
    )
    age: Mapped[int | None] = mapped_column(nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    past_illnesses: Mapped[str | None] = mapped_column(String(1000), nullable=True, comment="Medical history / chronic conditions")
    allergies: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="Known allergies")
    current_medications: Mapped[str | None] = mapped_column(String(1000), nullable=True, comment="Ongoing prescriptions")
    preferred_language: Mapped[str] = mapped_column(
        String(10), nullable=False, default="en",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    sessions = relationship("Session", back_populates="patient", lazy="selectin")
