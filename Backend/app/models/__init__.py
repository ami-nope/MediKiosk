"""
MediKiosk — ORM models package.

Import all models here so Alembic and the application can discover them
from a single import of `app.models`.
"""

from app.models.consent_log import ConsentLog  # noqa: F401
from app.models.document import Document  # noqa: F401
from app.models.history_record import HistoryRecord  # noqa: F401
from app.models.patient import Patient  # noqa: F401
from app.models.session import Session, SessionStatus  # noqa: F401
