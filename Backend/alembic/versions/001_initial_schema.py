"""Initial schema — all tables

Revision ID: 001
Revises: None
Create Date: 2026-08-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── patients ──────────────────────────────────────────────────────────
    op.create_table(
        "patients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=True, unique=True),
        sa.Column("preferred_language", sa.String(10), nullable=False, server_default="en"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_patients_external_id", "patients", ["external_id"])

    # ── sessions ──────────────────────────────────────────────────────────
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "patient_id",
            sa.String(36),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="in_progress"),
        sa.Column("is_priority", sa.Boolean, nullable=False, server_default=sa.text("0")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sessions_patient_id", "sessions", ["patient_id"])
    op.create_index("ix_sessions_status", "sessions", ["status"])
    op.create_index("ix_sessions_is_priority", "sessions", ["is_priority"])

    # ── history_records ───────────────────────────────────────────────────
    op.create_table(
        "history_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("raw_transcript", sa.Text, nullable=False, server_default="[]"),
        sa.Column("structured_json", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_history_records_session_id", "history_records", ["session_id"])

    # ── documents ─────────────────────────────────────────────────────────
    op.create_table(
        "documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_path", sa.String(512), nullable=False),
        sa.Column("ocr_text", sa.Text, nullable=True),
        sa.Column("structured_json", sa.JSON, nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_documents_session_id", "documents", ["session_id"])

    # ── consent_logs ──────────────────────────────────────────────────────
    op.create_table(
        "consent_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("consented", sa.Boolean, nullable=False),
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_consent_logs_session_id", "consent_logs", ["session_id"])


def downgrade() -> None:
    op.drop_table("consent_logs")
    op.drop_table("documents")
    op.drop_table("history_records")
    op.drop_table("sessions")
    op.drop_table("patients")
