#!/usr/bin/env bash
# EchoID dev container helpers (Apple `container` CLI).
#
# Two services:
#   echoid-dev   Next.js (Node 22)               port :3000
#   echoid-asr   faster-whisper microservice     port :8000
#
# Usage:
#   scripts/dev.sh bridge      # start proxy bridge (host -> 0.0.0.0:17897)
#   scripts/dev.sh build       # build echoid-dev image (Node app)
#   scripts/dev.sh build-asr   # build echoid-asr image (Python + faster-whisper)
#   scripts/dev.sh asr         # start ASR container (detached, mounts ~/.cache/huggingface)
#   scripts/dev.sh shell       # open an interactive shell in a fresh dev container
#   scripts/dev.sh dev         # run `npm run dev` on :3000 (interactive)
#   scripts/dev.sh up          # bring up bridge + asr + dev (dev interactive)
#   scripts/dev.sh stop        # stop & remove BOTH containers + bridge
#   scripts/dev.sh status      # show container + bridge + endpoint status
#
# Env:
#   HOST_PROXY_PORT   default 7897 (Clash/Mihomo listen port on 127.0.0.1)
#   BRIDGE_PORT       default 17897 (host-side bridge listener, exposed to container)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEV_IMAGE="echoid-dev:latest"
DEV_NAME="echoid-dev"
ASR_IMAGE="echoid-asr:latest"
ASR_NAME="echoid-asr"

HOST_PROXY_PORT="${HOST_PROXY_PORT:-7897}"
BRIDGE_PORT="${BRIDGE_PORT:-17897}"

# Host IP reachable from inside the container (Apple `container` NAT gateway).
GATEWAY_IP="$(container network inspect default 2>/dev/null | \
              /usr/bin/awk -F'"' '/ipv4Gateway/ {print $4}')"
GATEWAY_IP="${GATEWAY_IP:-192.168.64.1}"

PROXY_URL="http://${GATEWAY_IP}:${BRIDGE_PORT}"
# ASR endpoint that the dev container will use.
# Apple `container` only publishes container ports to host loopback, not to the
# NAT gateway that other containers see. So we (a) publish ASR to host :8000,
# (b) run a small TCP bridge on the host at 0.0.0.0:${ASR_BRIDGE_PORT} that
# forwards to 127.0.0.1:8000, and (c) point the dev container to it via the
# NAT gateway IP.
ASR_HOST_PORT="${ASR_HOST_PORT:-8000}"
ASR_BRIDGE_PORT="${ASR_BRIDGE_PORT:-18000}"
ASR_ENDPOINT_INTERNAL="http://${GATEWAY_IP}:${ASR_BRIDGE_PORT}"

cmd_bridge() {
  pkill -f "proxy_bridge.py.*--listen-port ${BRIDGE_PORT}" 2>/dev/null || true
  nohup python3 "${REPO_DIR}/scripts/proxy_bridge.py" \
    --listen-host 0.0.0.0 \
    --listen-port "${BRIDGE_PORT}" \
    --upstream-host 127.0.0.1 \
    --upstream-port "${HOST_PROXY_PORT}" \
    >"${REPO_DIR}/scripts/.bridge.log" 2>&1 &
  disown || true
  sleep 0.3
  echo "[dev] bridge: 0.0.0.0:${BRIDGE_PORT} -> 127.0.0.1:${HOST_PROXY_PORT}"
  echo "[dev] proxy for containers: ${PROXY_URL}"
}

cmd_asr_bridge() {
  # Bridge that lets containers reach the ASR service via the NAT gateway.
  pkill -f "proxy_bridge.py.*--listen-port ${ASR_BRIDGE_PORT}" 2>/dev/null || true
  nohup python3 "${REPO_DIR}/scripts/proxy_bridge.py" \
    --listen-host 0.0.0.0 \
    --listen-port "${ASR_BRIDGE_PORT}" \
    --upstream-host 127.0.0.1 \
    --upstream-port "${ASR_HOST_PORT}" \
    >"${REPO_DIR}/scripts/.asr_bridge.log" 2>&1 &
  disown || true
  sleep 0.3
  echo "[dev] asr-bridge: 0.0.0.0:${ASR_BRIDGE_PORT} -> 127.0.0.1:${ASR_HOST_PORT}"
  echo "[dev] containers can reach ASR at: ${ASR_ENDPOINT_INTERNAL}"
}

cmd_build() {
  container build -t "${DEV_IMAGE}" -f "${REPO_DIR}/Dockerfile" "${REPO_DIR}"
}

cmd_build_asr() {
  container build -t "${ASR_IMAGE}" -f "${REPO_DIR}/services/asr/Dockerfile" \
    "${REPO_DIR}/services/asr"
}

cmd_asr() {
  container stop "${ASR_NAME}" 2>/dev/null || true
  container rm "${ASR_NAME}" 2>/dev/null || true
  container run -d \
    --name "${ASR_NAME}" \
    --network default \
    -v "${HOME}/.cache/huggingface:/root/.cache/huggingface" \
    -p "${ASR_HOST_PORT}:8000" \
    -e "HTTP_PROXY=${PROXY_URL}" \
    -e "HTTPS_PROXY=${PROXY_URL}" \
    -e "http_proxy=${PROXY_URL}" \
    -e "https_proxy=${PROXY_URL}" \
    -e "NO_PROXY=localhost,127.0.0.1" \
    "${ASR_IMAGE}" >/dev/null
  echo "[dev] asr container started; waiting for model load..."
  for i in $(seq 1 30); do
    if curl -sS -m 2 http://localhost:${ASR_HOST_PORT}/healthz 2>/dev/null | grep -q '"ok":true'; then
      echo "[dev] asr ready at http://localhost:${ASR_HOST_PORT}"
      cmd_asr_bridge
      return 0
    fi
    sleep 1
  done
  echo "[dev] asr did not become ready in 30s. Logs:"
  container logs "${ASR_NAME}" 2>&1 | tail -20
  return 1
}

_run_common_args() {
  echo \
    --rm \
    --name "${DEV_NAME}" \
    --network default \
    -v "${REPO_DIR}:/app" \
    -w /app \
    -e "HTTP_PROXY=${PROXY_URL}" \
    -e "HTTPS_PROXY=${PROXY_URL}" \
    -e "http_proxy=${PROXY_URL}" \
    -e "https_proxy=${PROXY_URL}" \
    -e "NO_PROXY=localhost,127.0.0.1,${GATEWAY_IP}" \
    -e "no_proxy=localhost,127.0.0.1,${GATEWAY_IP}" \
    -e "ASR_ENDPOINT=${ASR_ENDPOINT_INTERNAL}"
}

cmd_shell() {
  container run -it $(_run_common_args) "${DEV_IMAGE}" bash
}

cmd_dev() {
  container run -it $(_run_common_args) -p 3000:3000 "${DEV_IMAGE}" \
    bash -lc "npm install && npx prisma generate && npx prisma db push && npm run dev -- -H 0.0.0.0"
}

cmd_up() {
  cmd_bridge
  cmd_build_asr || true    # only rebuild if image missing? cheap to skip if cached
  cmd_asr
  cmd_watchdog_start
  echo "[dev] now run:  ./scripts/dev.sh dev   (interactive Next.js)"
}

cmd_stop() {
  container stop "${DEV_NAME}" 2>/dev/null || true
  container rm "${DEV_NAME}" 2>/dev/null || true
  container stop "${ASR_NAME}" 2>/dev/null || true
  container rm "${ASR_NAME}" 2>/dev/null || true
  pkill -f "proxy_bridge.py.*--listen-port ${BRIDGE_PORT}" 2>/dev/null || true
  pkill -f "proxy_bridge.py.*--listen-port ${ASR_BRIDGE_PORT}" 2>/dev/null || true
  pkill -f "asr_watchdog.sh" 2>/dev/null || true
  echo "[dev] stopped"
}

cmd_status() {
  echo "-- containers --"
  container list 2>/dev/null | grep -E "NAME|${DEV_NAME}|${ASR_NAME}" || echo "  (none)"
  echo "-- bridges --"
  pgrep -f "proxy_bridge.py.*${BRIDGE_PORT}" >/dev/null \
    && echo "  proxy    0.0.0.0:${BRIDGE_PORT}    -> 127.0.0.1:${HOST_PROXY_PORT}" \
    || echo "  proxy    down"
  pgrep -f "proxy_bridge.py.*${ASR_BRIDGE_PORT}" >/dev/null \
    && echo "  asr      0.0.0.0:${ASR_BRIDGE_PORT}    -> 127.0.0.1:${ASR_HOST_PORT}" \
    || echo "  asr      down"
  pgrep -f "asr_watchdog.sh" >/dev/null \
    && echo "  watchdog running (log: scripts/.watchdog.log)" \
    || echo "  watchdog down"
  echo "-- endpoints --"
  code=$(curl -sS -m 2 -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "n/a")
  echo "  dev  http://localhost:3000  => ${code}"
  code=$(curl -sS -m 2 -o /dev/null -w "%{http_code}" http://localhost:${ASR_HOST_PORT}/healthz 2>/dev/null || echo "n/a")
  echo "  asr  http://localhost:${ASR_HOST_PORT}/healthz => ${code}"
}

cmd_watchdog() {
  # Foreground — good for a spare terminal window during a demo.
  exec "${REPO_DIR}/scripts/asr_watchdog.sh"
}

cmd_watchdog_start() {
  # Detached background. Idempotent — kills any prior watcher first.
  pkill -f "asr_watchdog.sh" 2>/dev/null || true
  sleep 0.2
  nohup "${REPO_DIR}/scripts/asr_watchdog.sh" \
    >"${REPO_DIR}/scripts/.watchdog.log" 2>&1 &
  disown || true
  sleep 0.3
  echo "[dev] asr watchdog started · log: scripts/.watchdog.log"
}

cmd_watchdog_stop() {
  pkill -f "asr_watchdog.sh" 2>/dev/null && echo "[dev] watchdog stopped" \
    || echo "[dev] watchdog was not running"
}

case "${1:-}" in
  bridge)          cmd_bridge ;;
  build)           cmd_build ;;
  build-asr)       cmd_build_asr ;;
  asr)             cmd_asr ;;
  shell)           cmd_shell ;;
  dev)             cmd_dev ;;
  up)              cmd_up ;;
  stop)            cmd_stop ;;
  status)          cmd_status ;;
  watchdog)        cmd_watchdog ;;
  watchdog-start)  cmd_watchdog_start ;;
  watchdog-stop)   cmd_watchdog_stop ;;
  *)
    /bin/cat <<EOF
usage: $0 {bridge|build|build-asr|asr|shell|dev|up|stop|status|watchdog|watchdog-start|watchdog-stop}
  bridge          start host proxy bridge (0.0.0.0:${BRIDGE_PORT} -> 127.0.0.1:${HOST_PROXY_PORT})
  build           build ${DEV_IMAGE} (Node app)
  build-asr       build ${ASR_IMAGE} (faster-whisper + FastAPI)
  asr             start ASR container detached, publish :8000
  shell           interactive shell inside dev container
  dev             run \`npm run dev\` interactive, publish :3000
  up              bridge + build-asr + asr + watchdog (then run \`dev\`)
  stop            stop & remove BOTH containers + bridges + watchdog
  status          show container / bridge / watchdog / endpoint status
  watchdog        ASR sidecar watchdog (foreground · Ctrl-C to exit)
  watchdog-start  ASR watchdog detached (log: scripts/.watchdog.log)
  watchdog-stop   stop the detached ASR watchdog
EOF
    exit 1
    ;;
esac
