# EchoID dev container
# Base: Node 22 on Debian 12 (bookworm). ffmpeg is required for audio decoding.
FROM node:22-bookworm-slim

# System deps: ffmpeg (audio pipeline), openssl (prisma), ca-certificates (https via proxy),
# curl (health checks/debug), git (some npm packages need it).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      openssl \
      ca-certificates \
      curl \
      git \
      python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# We bind-mount the project at runtime, so we don't COPY here.
# Keep node_modules inside the container image cache via named volume in dev.

EXPOSE 3000

# Default: interactive shell. `container run` will override with `npm run dev` etc.
CMD ["bash"]
