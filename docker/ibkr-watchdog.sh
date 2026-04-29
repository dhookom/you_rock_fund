#!/bin/bash
# Host-side watchdog for IB Gateway API readiness.
# Runs from launchd and restarts ib_gateway only after repeated API failures.

set -u

PROJ=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$PROJ/.env.compose"
LOG_FILE="${YRVI_WATCHDOG_LOG:-$PROJ/docker_watchdog.log}"
STATE_FILE="${YRVI_WATCHDOG_STATE:-$PROJ/docker_watchdog_state}"
API_URL="${YRVI_WATCHDOG_API_URL:-http://127.0.0.1:8000/api/status}"
FAIL_THRESHOLD="${YRVI_WATCHDOG_FAIL_THRESHOLD:-3}"
RESTART_COOLDOWN_SECS="${YRVI_WATCHDOG_RESTART_COOLDOWN_SECS:-600}"

log() {
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*" >> "$LOG_FILE"
}

read_state() {
    FAIL_COUNT=0
    LAST_RESTART=0
    if [ -f "$STATE_FILE" ]; then
        # shellcheck disable=SC1090
        . "$STATE_FILE" 2>/dev/null || true
    fi
}

write_state() {
    {
        printf 'FAIL_COUNT=%s\n' "${FAIL_COUNT:-0}"
        printf 'LAST_RESTART=%s\n' "${LAST_RESTART:-0}"
    } > "$STATE_FILE"
}

if [ ! -f "$ENV_FILE" ]; then
    log "SKIP .env.compose missing"
    exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
    log "SKIP docker command not found"
    exit 0
fi

if ! docker info >/dev/null 2>&1; then
    log "SKIP Docker daemon not available"
    exit 0
fi

read_state

status_json="$(curl -sf --max-time 25 "$API_URL" 2>/dev/null || true)"
health="$(STATUS_JSON="$status_json" python3 - <<'PY' 2>/dev/null || true
import json
import os
import sys

try:
    data = json.loads(os.environ.get("STATUS_JSON", ""))
except Exception:
    print("bad_json")
    raise SystemExit

gateway_running = data.get("gateway_running") is True
ibkr_connected = data.get("ibkr_connected") is True
ibkr_error = data.get("ibkr_error")

if gateway_running and ibkr_connected and not ibkr_error:
    print("healthy")
else:
    print("unhealthy")
PY
)"

if [ "$health" = "healthy" ]; then
    if [ "${FAIL_COUNT:-0}" -ne 0 ]; then
        log "OK recovered; resetting failure count"
    fi
    FAIL_COUNT=0
    write_state
    exit 0
fi

FAIL_COUNT=$(( ${FAIL_COUNT:-0} + 1 ))
log "WARN unhealthy API status (failure $FAIL_COUNT/$FAIL_THRESHOLD)"
write_state

if [ "$FAIL_COUNT" -lt "$FAIL_THRESHOLD" ]; then
    exit 0
fi

now="$(date +%s)"
since_restart=$(( now - ${LAST_RESTART:-0} ))
if [ "$since_restart" -lt "$RESTART_COOLDOWN_SECS" ]; then
    log "SKIP restart suppressed by cooldown (${since_restart}s < ${RESTART_COOLDOWN_SECS}s)"
    exit 0
fi

log "ACTION restarting ib_gateway after $FAIL_COUNT consecutive unhealthy checks"
if docker compose --env-file "$ENV_FILE" -f "$PROJ/docker-compose.yml" --project-directory "$PROJ" restart ib_gateway >> "$LOG_FILE" 2>&1; then
    FAIL_COUNT=0
    LAST_RESTART="$now"
    write_state
    log "OK ib_gateway restart command completed"
else
    log "ERROR ib_gateway restart command failed"
fi
