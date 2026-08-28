"""Low-latency voice conversation WebSocket."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import Settings, get_settings
from app.database import async_session_factory
from app.dependencies import get_llm_provider
from app.exceptions import ProviderError
from app.providers.stt.base import STTEvent
from app.providers.stt.sarvam_stt import SarvamSTTProvider
from app.providers.tts.sarvam_tts import SarvamTTSProvider
from app.services import history_service

router = APIRouter(tags=["Voice"])


@router.websocket("/ws/voice/{session_id}")
async def voice_session(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    settings = get_settings()
    audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=32)

    async def audio_chunks() -> AsyncIterator[bytes]:
        while True:
            chunk = await audio_queue.get()
            if chunk is None:
                return
            yield chunk

    async def receive_audio() -> None:
        try:
            while True:
                message = await websocket.receive()
                if message.get("bytes"):
                    await audio_queue.put(message["bytes"])
                elif message.get("text"):
                    payload = json.loads(message["text"])
                    if payload.get("type") == "stop":
                        await audio_queue.put(None)
                        return
        except WebSocketDisconnect:
            await audio_queue.put(None)

    stt = SarvamSTTProvider(settings)
    tts = SarvamTTSProvider(settings)
    receiver = asyncio.create_task(receive_audio())
    try:
        async for event in stt.stream(audio_chunks()):
            if event.event == "transcript.partial":
                await websocket.send_json({"type": "transcript.partial", "text": event.text})
            elif event.event == "vad.speech_start":
                await websocket.send_json({"type": "vad.speech_start"})
            elif event.event == "vad.speech_end":
                await websocket.send_json({"type": "vad.speech_end"})
            elif event.event == "error":
                await websocket.send_json({"type": "error", "stage": "stt", "message": event.message})
                return
            elif event.event == "transcript.final" and event.text.strip():
                await websocket.send_json({
                    "type": "transcript.final",
                    "text": event.text,
                    "language": event.language,
                })
                await process_turn(websocket, session_id, event, settings, tts)
    except WebSocketDisconnect:
        return
    except Exception as exc:
        await websocket.send_json({"type": "error", "stage": "stt", "message": str(exc)})
    finally:
        receiver.cancel()


async def process_turn(
    websocket: WebSocket,
    session_id: str,
    event: STTEvent,
    settings: Settings,
    tts: SarvamTTSProvider,
) -> None:
    language = event.language or ""
    supported = set(settings.SUPPORTED_LANGUAGES)
    if language not in supported:
        await websocket.send_json({"type": "error", "stage": "stt", "message": "Detected language is not supported. Please use English, Hindi, Bengali, or Odia."})
        return

    try:
        async with async_session_factory() as db:
            reply, priority, complete, provider, fallback_reason = await history_service.submit_message(
                db, session_id, event.text, get_llm_provider(), allow_fallback=False,
            )
            await db.commit()
        await websocket.send_json({
            "type": "assistant.text",
            "text": reply,
            "provider": provider,
            "fallback_reason": fallback_reason,
            "is_priority": priority,
            "intake_complete": complete,
        })
    except ProviderError as exc:
        await websocket.send_json({"type": "error", "stage": "llm", "message": str(exc)})
        return
    except Exception as exc:
        await websocket.send_json({"type": "error", "stage": "llm", "message": str(exc)})
        return

    try:
        sentence = ""
        for character in reply:
            sentence += character
            if character in ".!?\n" and sentence.strip():
                async for audio in tts.synthesize_stream(sentence.strip(), language):
                    await websocket.send_bytes(audio)
                sentence = ""
        if sentence.strip():
            async for audio in tts.synthesize_stream(sentence.strip(), language):
                await websocket.send_bytes(audio)
        await websocket.send_json({"type": "assistant.done", "intake_complete": complete})
    except Exception as exc:
        await websocket.send_json({"type": "error", "stage": "tts", "message": str(exc)})