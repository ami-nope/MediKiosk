"""Sarvam Saaras v3 realtime speech-to-text bridge."""

from __future__ import annotations

import asyncio
import base64
import json
from typing import AsyncIterator
from urllib.parse import urlencode

import websockets

from app.config import Settings
from app.providers.stt.base import STTEvent, STTProvider


class SarvamSTTProvider(STTProvider):
    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.SARVAM_API_KEY.strip()
        self._model = settings.SARVAM_STT_MODEL

    async def stream(self, audio: AsyncIterator[bytes]) -> AsyncIterator[STTEvent]:
        if not self._api_key:
            yield STTEvent("error", message="SARVAM_API_KEY is not configured")
            return

        query = urlencode({
            "model": self._model,
            "language_code": "auto",
            "stream_type": "fast",
            "endpointing": "vad",
            "encoding": "linear16",
            "sample_rate": 16000,
            "vad_signals": "true",
            "silence_duration_ms": 500,
        })
        url = f"wss://api.sarvam.ai/speech-to-text-realtime/ws?{query}"
        try:
            async with websockets.connect(
                url,
                additional_headers={"Api-Subscription-Key": self._api_key},
                open_timeout=10,
                ping_interval=20,
            ) as socket:
                send_task = asyncio.create_task(self._send_audio(socket, audio))
                try:
                    async for raw in socket:
                        payload = json.loads(raw)
                        event = payload.get("event", "")
                        if event == "transcript.partial":
                            yield STTEvent(event, payload.get("text", ""), payload.get("language"))
                        elif event == "transcript.final":
                            yield STTEvent(event, payload.get("text", ""), payload.get("language"))
                        elif event == "error":
                            yield STTEvent(event, message=payload.get("message", "Sarvam STT error"))
                            if payload.get("is_fatal", True):
                                break
                        elif event in {"vad.speech_start", "vad.speech_end"}:
                            yield STTEvent(event)
                finally:
                    send_task.cancel()
        except Exception as exc:
            yield STTEvent("error", message=f"Sarvam STT connection failed: {exc}")

    @staticmethod
    async def _send_audio(socket: object, audio: AsyncIterator[bytes]) -> None:
        async for chunk in audio:
            await socket.send(json.dumps({
                "event": "audio_input",
                "audio": base64.b64encode(chunk).decode("ascii"),
            }))
        await socket.send(json.dumps({"event": "end"}))
