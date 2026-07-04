#!/usr/bin/env bash
# Watchdog for the echoid-asr Apple `container`.
#
# Apple's `container` CLI is not systemd — if the ASR sidecar stops
# (macOS sleep, vmnet flake, container OOM), nothing restarts it, and
# the Node pipeline surfaces the failure as a cryptic
# `fetch failed`. This tiny watcher polls /healthz and re-invokes
# `scripts/dev.sh asr` when the port stops answering.
#
# Usage:
#   scripts/dev.sh watchdog        # foreground (Ctrl-C to stop)
#   scripts/dev.sh watchdog-start  # detached; log at scripts/.watchdog.log
#   scripts/dev.sh watchdog-stop
#
# Env:
#   ASR_HEALTH_URL   default http://localhost:8000/healthz
#   POLL_SECONDS     default 15
#   FAIL_THRESHOLD   default 2  (consecutive fails before restart)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ASR_HEALTH_URL="${ASR_HEALTH_URL:-http://localhost:8000/healthz}"
POLL_SECONDS="${POLL_SECONDS:-15}"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-2}"
LOG_FILE="${REPO_DIR}/scripts/.watchdog.log"

log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  printf '[%s] %s\n' "$ts" "$*"
}

# Single-shot health probe. Prints nothing; returns 0 iff healthy.
probe() {
  local code
  code="$(curl -sS -m 3 -o /dev/null -w '%{http_code}' "$ASR_HEALTH_URL" 2>/dev/null || echo 000)"
  [ "$code" = "200" ]
}

restart_asr() {
  log "ASR unreachable · restarting via scripts/dev.sh asr"
  # `scripts/dev.sh asr` idempotently stops+removes any prior container.
  if "${REPO_DIR}/scripts/dev.sh" asr >>"$LOG_FILE" 2>&1; then
    log "asr restart completed"
  else
    log "asr restart FAILED — see $LOG_FILE for details"
  fi
}

main() {
  log "watchdog starting · url=$ASR_HEALTH_URL · poll=${POLL_SECONDS}s · fail_threshold=$FAIL_THRESHOLD"
  local fails=0
  while true; do
    if probe; then
      if [ "$fails" -gt 0 ]; then
        log "asr recovered after $fails failed probe(s)"
        fails=0
      fi
    else
      fails=$((fails + 1))
      log "asr probe FAILED ($fails/$FAIL_THRESHOLD)"
      if [ "$fails" -ge "$FAIL_THRESHOLD" ]; then
        restart_asr
        fails=0
      fi
    fi
    sleep "$POLL_SECONDS"
  done
}

main
