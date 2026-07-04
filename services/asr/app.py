"""
EchoID ASR microservice.

Wraps faster-whisper as a small FastAPI service. The Node.js pipeline POSTs a
multipart audio file to /transcribe and receives {text, words[]} where each
word has {text, start, end} in seconds — exactly matching the ASRResult
contract in src/types/core.ts on the TypeScript side.

Model: Systran/faster-whisper-small (multilingual, ~464MB, CPU-friendly).
The container mounts the host's ~/.cache/huggingface read-only so the model
file is reused (no re-download).
"""
from __future__ import annotations

import os
import tempfile
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("WHISPER_MODEL", "Systran/faster-whisper-small")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")  # int8 = fastest on CPU
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
DEFAULT_LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "zh")

_model: WhisperModel | None = None


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global _model
    # Loading the model eagerly at startup avoids a slow first request.
    print(f"[asr] loading model={MODEL_NAME} device={DEVICE} compute={COMPUTE_TYPE}...", flush=True)
    _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
    print("[asr] model loaded", flush=True)
    yield
    _model = None


app = FastAPI(lifespan=lifespan)


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": _model is not None, "model": MODEL_NAME}


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str | None = Form(default=None),
) -> dict:
    if _model is None:
        raise HTTPException(status_code=503, detail="model not loaded")

    lang = language or DEFAULT_LANGUAGE
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"

    # faster-whisper reads from a path; buffer the upload to a temp file.
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        segments, info = _model.transcribe(
            tmp_path,
            language=lang,
            beam_size=1,           # greedy = fastest; MVP quality is enough
            vad_filter=True,       # skip long silences
            word_timestamps=True,  # we need per-word start/end
            condition_on_previous_text=False,
        )

        words: list[dict] = []
        text_parts: list[str] = []
        for seg in segments:
            if seg.text:
                text_parts.append(seg.text)
            for w in seg.words or []:
                # w.word may have a leading space in whisper's tokenization; strip.
                token = (w.word or "").strip()
                if not token:
                    continue
                words.append({
                    "text": token,
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                })

        return {
            "text": "".join(text_parts).strip(),
            "words": words,
            "language": info.language,
            "duration": round(float(info.duration), 3),
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
