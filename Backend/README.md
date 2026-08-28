# MediKiosk Backend

AI-powered clinical history intake platform for hospital OPDs.

## What This Backend Does

- Register patients
- Start and track kiosk sessions
- Collect patient history through an LLM chat flow
- Upload supporting documents
- Record patient consent
- Generate structured clinical summaries

## Tech Stack

- FastAPI for the API layer
- SQLAlchemy 2.0 and Alembic for database access and migrations
- SQLite by default, PostgreSQL supported via `DATABASE_URL`
- Pydantic v2 and pydantic-settings for validation and config
- OpenAI, Anthropic, Gemini, and Ollama LLM provider support

## Quick Start

### 1. Create a virtual environment

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys and preferred settings
```

### 4. Run database migrations

```bash
alembic upgrade head
```

This creates the SQLite database file (`medikiosk.db`) with all tables.

### 5. Start the server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Health check: http://localhost:8000/health

## Realtime Voice Intake

Voice mode uses Sarvam's realtime speech APIs and the existing history service:

```env
SARVAM_API_KEY=your-sarvam-api-key
SARVAM_STT_MODEL=saaras:v3-realtime
SARVAM_TTS_MODEL=bulbul:v3
SUPPORTED_LANGUAGES=["en-IN","hi-IN","bn-IN","or-IN"]
```

The browser sends mono 16 kHz PCM audio to `ws://localhost:8000/ws/voice/{session_id}`.
Saaras runs with automatic language detection and fast VAD. Only English, Hindi,
Bengali, and Odia turns are accepted for the voice reply. Partial transcripts,
final transcripts, assistant text, and Bulbul audio chunks are returned over the
same socket. STT, LLM, and TTS failures are sent as explicit error events; voice
mode does not generate local fallback replies.

To test locally, install the updated requirements, start the backend and frontend,
create a patient session in the kiosk, accept consent, then allow microphone
access and tap the microphone button. Use the text field when microphone access
or a Sarvam service is unavailable.

## Switching LLM Providers

Change `LLM_PROVIDER` in your `.env` file. No code changes are needed.

### Google Gemini

Recommended for the free tier.

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-3.7-flash
# Cheaper option: gemini-3.5-flash-lite
```

### Groq

```env
LLM_PROVIDER=groq
GROQ_API_KEY=gsk-your-key
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=qwen/qwen3.6-27b
GROQ_MAX_COMPLETION_TOKENS=2048
```

Groq uses an OpenAI-compatible API endpoint, but has separate `GROQ_*`
settings so it can be managed independently from OpenAI. `qwen/qwen3.6-27b`
is the safer default for this text-only intake flow because Groq's GPT-OSS
models can invoke built-in tools, which is not needed for kiosk history-taking.

### OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
```

Works with OpenAI-compatible APIs such as Azure OpenAI, vLLM, and LM Studio
by changing `OPENAI_BASE_URL`.

### Anthropic / Claude

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### Ollama

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

Works with a local Ollama server on your machine.

## Switching to PostgreSQL

1. Install the async Postgres driver:

   ```bash
   pip install asyncpg
   ```

2. Update `DATABASE_URL` in `.env`:

   ```env
   DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/medikiosk
   ```

3. Run migrations:

   ```bash
   alembic upgrade head
   ```

No code changes are required.

## Project Structure

```text
app/
|-- main.py              # FastAPI app factory
|-- config.py            # Settings from .env
|-- database.py          # Async SQLAlchemy engine
|-- dependencies.py      # FastAPI dependency injection
|-- exceptions.py        # Custom errors and handlers
|
|-- models/              # SQLAlchemy ORM models
|   |-- patient.py
|   |-- session.py
|   |-- history_record.py
|   |-- document.py
|   `-- consent_log.py
|
|-- schemas/             # Pydantic request/response schemas
|   |-- patient.py
|   |-- session.py
|   |-- history.py
|   |-- document.py
|   |-- consent.py
|   `-- health.py
|
|-- routers/              # Thin API routers
|   |-- patients.py
|   |-- sessions.py
|   |-- history.py
|   |-- documents.py
|   |-- consent.py
|   `-- health.py
|
|-- services/            # Business logic
|   |-- patient_service.py
|   |-- session_service.py
|   |-- history_service.py
|   |-- document_service.py
|   |-- consent_service.py
|   `-- summary_service.py
|
|-- providers/           # Pluggable provider abstraction
|   |-- llm/             # OpenAI, Anthropic, Gemini, Ollama
|   |   |-- base.py
|   |   |-- factory.py
|   |   |-- openai.py
|   |   |-- anthropic.py
|   |   |-- gemini.py
|   |   `-- ollama.py
|   |-- asr/
|   `-- ocr/
|
`-- placeholders/
    `-- clinical.py      # Prompt building, summary parsing, OCR heuristics
```

## Clinical Helpers

Clinical logic is centralized in
[`app/placeholders/clinical.py`](app/placeholders/clinical.py). The current
implementation provides starter prompt building, JSON summary parsing,
red-flag heuristics, and lightweight OCR structuring. You can tighten or
replace those heuristics later without changing the API layer.

| Function | Purpose | Called from |
|---|---|---|
| `build_history_messages()` | Build the LLM message list for history-taking | `history_service.submit_message()` |
| `build_summary_prompt()` | Build the LLM prompt for structured clinical summarization | `summary_service.generate_summary()` |
| `extract_red_flags()` | Detect clinical red flags in LLM responses to mark sessions as priority | `history_service.submit_message()` |
| `parse_summary_response()` | Parse the LLM's summary output into a structured dict | `summary_service.generate_summary()` |
| `process_ocr_result()` | Structure raw OCR text from uploaded documents | `document_service.upload_document()` |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check + LLM provider ping |
| `POST` | `/patients` | Register a patient |
| `GET` | `/patients/{id}` | Get patient details |
| `POST` | `/sessions` | Start a new kiosk session |
| `GET` | `/sessions` | List sessions by status or priority |
| `GET` | `/sessions/{id}` | Get session details |
| `POST` | `/sessions/{id}/history` | Submit a message and get an LLM reply |
| `GET` | `/sessions/{id}/history` | Get full transcript and structured data |
| `POST` | `/sessions/{id}/documents` | Upload a file |
| `GET` | `/sessions/{id}/documents` | List session documents |
| `POST` | `/sessions/{id}/summary` | Generate structured summary |
| `PATCH` | `/sessions/{id}/summary` | Doctor edits summary and completes session |
| `POST` | `/sessions/{id}/consent` | Record patient consent |

## License

Private - all rights reserved.
