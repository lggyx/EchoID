# EchoID ASR microservice
# faster-whisper (CTranslate2) + FastAPI + uv-managed venv.
#
# We install uv (fast Python package manager) and use it to resolve
# dependencies from pyproject.toml into an isolated venv at /opt/venv.

FROM python:3.11-slim-bookworm

# System deps: ffmpeg for audio decoding, libgomp for CTranslate2 threading,
# ca-certificates for HTTPS through the host proxy.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      libgomp1 \
      ca-certificates \
      curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv (single static binary).
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /usr/local/bin/

ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    HF_HOME=/root/.cache/huggingface \
    OMP_NUM_THREADS=2

WORKDIR /app

# Install dependencies first (cache-friendly).
COPY pyproject.toml ./
RUN uv sync --no-install-project --no-dev

# Then app code.
COPY app.py ./

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
