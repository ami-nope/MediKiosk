"""Sarvam Bulbul v3 streaming text-to-speech bridge."""

from __future__ import annotations

import base64
import json
from typing import AsyncIterator
from urllib.parse import urlencode

import websockets

from app.config import Settings
from app.providers.tts.base import TTSProvider


class SarvamTTSProvider(TTSProvider):
    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.SARVAM_API_KEY.strip()
        self._model = settings.SARVAM_TTS_MODEL

    async def synthesize_stream(self, text: str, language: str) -> AsyncIterator[bytes]:
        if not self._api_key:
            raise RuntimeError("SARVAM_API_KEY is not configured")
        if not text.strip():
            return

        query = urlencode({"model": self._model, "send_completion_event": "true"})
        url = f"wss://api.sarvam.ai/text-to-speech/ws?{query}"
        async with websockets.connect(
            url,
            additional_headers={"Api-Subscription-Key": self._api_key},
            open_timeout=10,
            ping_interval=20,
        ) as socket:
            await socket.send(json.dumps({
                "type": "config",
                "data": {
                    "model": self._model,
                    "language_code": language,
                    "speaker": "shubh",
                    "speech_sample_rate": 24000,
                    "output_audio_codec": "mp3",
                    "pace": 1.0,
                    "temperature": 0.4,
                    "min_buffer_size": 30,
                    "max_chunk_length": 150,
                },
            }))
            await socket.send(json.dumps({"type": "text", "data": {"text": text}}))
            await socket.send(json.dumps({"type": "flush"}))

            async for raw in socket:
                payload = json.loads(raw)
                if payload.get("type") == "audio":
                    audio = payload.get("data", {}).get("audio")
                    if audio:
                        yield base64.b64decode(audio)
                elif payload.get("type") == "error":
                    raise RuntimeError(payload.get("data", {}).get("message", "Sarvam TTS error"))
                elif payload.get("type") == "event" and payload.get("data", {}).get("event_type") == "final":
                    break
