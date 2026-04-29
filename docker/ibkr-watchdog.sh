#!/bin/bash
# Host-side watchdog for YRVI container uptime.
# Runs from launchd, alerts on sustained failures, and restarts ib_gateway only
# for repeated Gateway-specific readiness failures.

set -u

PROJ=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$PROJ/.env.compose"
LOG_FILE="${YRVI_WATCHDOG_LOG:-$PROJ/docker_watchdog.log}"
STATE_FILE="${YRVI_WATCHDOG_STATE:-$PROJ/docker_watchdog_state}"
API_URL="${YRVI_WATCHDOG_API_URL:-http://127.0.0.1:8000/api/status}"
FAIL_THRESHOLD="${YRVI_WATCHDOG_FAIL_THRESHOLD:-3}"
RESTART_COOLDOWN_SECS="${YRVI_WATCHDOG_RESTART_COOLDOWN_SECS:-600}"
ALERT_REPEAT_SECS="${YRVI_WATCHDOG_ALERT_REPEAT_SECS:-3600}"
DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

log() {
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*" >> "$LOG_FILE"
}

read_state() {
    GATEWAY_FAIL_COUNT=0
    LAST_RESTART=0
    LAST_CATEGORY=healthy
    LAST_ALERT=0
    if [ -f "$STATE_FILE" ]; then
        # shellcheck disable=SC1090
        . "$STATE_FILE" 2>/dev/null || true
    fi
    GATEWAY_FAIL_COUNT="${GATEWAY_FAIL_COUNT:-${FAIL_COUNT:-0}}"
}

write_state() {
    {
        printf 'GATEWAY_FAIL_COUNT=%s\n' "${GATEWAY_FAIL_COUNT:-0}"
        printf 'LAST_RESTART=%s\n' "${LAST_RESTART:-0}"
        printf 'LAST_CATEGORY=%s\n' "${LAST_CATEGORY:-healthy}"
        printf 'LAST_ALERT=%s\n' "${LAST_ALERT:-0}"
    } > "$STATE_FILE"
}

load_discord_webhook() {
    if [ -z "$DISCORD_WEBHOOK_URL" ] && [ -r "$PROJ/docker/secrets/discord_webhook_url" ]; then
        DISCORD_WEBHOOK_URL="$(tr -d '\r\n' < "$PROJ/docker/secrets/discord_webhook_url")"
    fi
}

send_discord() {
    title="$1"
    message="$2"
    severity="${3:-warning}"

    load_discord_webhook
    if [ -z "$DISCORD_WEBHOOK_URL" ]; then
        return 0
    fi

    WEBHOOK_URL="$DISCORD_WEBHOOK_URL" TITLE="$title" MESSAGE="$message" SEVERITY="$severity" python3 - <<'PY' 2>/dev/null || true
import json
import os
import urllib.request
from datetime import datetime, timezone

colors = {
    "error": 0xE74C3C,
    "warning": 0xF1C40F,
    "resolved": 0x2ECC71,
    "info": 0x95A5A6,
}
payload = {
    "embeds": [{
        "title": os.environ["TITLE"],
        "description": os.environ["MESSAGE"],
        "color": colors.get(os.environ.get("SEVERITY"), 0xF1C40F),
        "footer": {"text": "You Rock Volatility Income Fund"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }]
}
data = json.dumps(payload).encode()
request = urllib.request.Request(
    os.environ["WEBHOOK_URL"],
    data=data,
    headers={"Content-Type": "application/json"},
)
urllib.request.urlopen(request, timeout=10).read()
PY
}

maybe_alert() {
    category="$1"
    title="$2"
    message="$3"
    severity="${4:-warning}"
    now="$(date +%s)"

    if [ "${LAST_CATEGORY:-healthy}" != "$category" ] || [ $(( now - ${LAST_ALERT:-0} )) -ge "$ALERT_REPEAT_SECS" ]; then
        log "ALERT $category $title"
        send_discord "$title" "$message" "$severity"
        LAST_ALERT="$now"
    fi
    LAST_CATEGORY="$category"
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
classification="$(STATUS_JSON="$status_json" python3 - <<'PY' 2>/dev/null || true
import json
import os

try:
    data = json.loads(os.environ.get("STATUS_JSON", ""))
except Exception:
    print("api_unreachable|API status endpoint is unavailable or returned invalid JSON.|0")
    raise SystemExit

gateway_tcp_open = data.get("gateway_tcp_open")
if gateway_tcp_open is None:
    gateway_tcp_open = data.get("gateway_running") is True
else:
    gateway_tcp_open = gateway_tcp_open is True

gateway_api_ready = data.get("gateway_api_ready")
if gateway_api_ready is None:
    gateway_api_ready = data.get("ibkr_connected") is True
else:
    gateway_api_ready = gateway_api_ready is True

scheduler_running = data.get("scheduler_running")
if scheduler_running is None:
    scheduler_running = data.get("scheduler_pid") is not None
else:
    scheduler_running = scheduler_running is True

ibkr_error = data.get("ibkr_error")
scheduler_age = data.get("scheduler_heartbeat_age_seconds")

if not gateway_tcp_open:
    print("gateway_tcp_down|IB Gateway is not listening on its API port. VNC on localhost:5900 may show login, 2FA, or Gateway startup state.|1")
elif not gateway_api_ready or ibkr_error:
    detail = f" Last error: {ibkr_error}" if ibkr_error else ""
    print(f"gateway_api_down|IB Gateway port is open but the IBKR API handshake is failing.{detail} VNC on localhost:5900 may show a dialog or login issue.|1")
elif not scheduler_running:
    detail = f" Heartbeat age: {scheduler_age}s." if scheduler_age is not None else ""
    print(f"scheduler_stale|Scheduler heartbeat is stale or missing.{detail} Run: docker compose --env-file .env.compose restart scheduler|0")
else:
    print("healthy|All monitored services are healthy.|0")
PY
)"

if [ -z "$classification" ]; then
    classification="api_unreachable|API status endpoint is unavailable or returned invalid JSON.|0"
fi

category="${classification%%|*}"
rest="${classification#*|}"
message="${rest%|*}"
restartable="${classification##*|}"

if [ "$category" = "healthy" ]; then
    if [ "${GATEWAY_FAIL_COUNT:-0}" -ne 0 ] || [ "${LAST_CATEGORY:-healthy}" != "healthy" ]; then
        log "OK recovered; resetting failure count"
        send_discord "YRVI infrastructure recovered" "Gateway API readiness and scheduler heartbeat are healthy again." "resolved"
    fi
    GATEWAY_FAIL_COUNT=0
    LAST_CATEGORY=healthy
    write_state
    exit 0
fi

if [ "$restartable" = "1" ]; then
    GATEWAY_FAIL_COUNT=$(( ${GATEWAY_FAIL_COUNT:-0} + 1 ))
else
    GATEWAY_FAIL_COUNT=0
fi

log "WARN $category: $message (gateway failure $GATEWAY_FAIL_COUNT/$FAIL_THRESHOLD)"
maybe_alert "watchdog_$category" "YRVI infrastructure warning: $category" "$message" "warning"
write_state

if [ "$restartable" != "1" ] || [ "$GATEWAY_FAIL_COUNT" -lt "$FAIL_THRESHOLD" ]; then
    exit 0
fi

now="$(date +%s)"
since_restart=$(( now - ${LAST_RESTART:-0} ))
if [ "$since_restart" -lt "$RESTART_COOLDOWN_SECS" ]; then
    log "SKIP restart suppressed by cooldown (${since_restart}s < ${RESTART_COOLDOWN_SECS}s)"
    exit 0
fi

log "ACTION restarting ib_gateway after $GATEWAY_FAIL_COUNT consecutive Gateway readiness failures"
if docker compose --env-file "$ENV_FILE" -f "$PROJ/docker-compose.yml" --project-directory "$PROJ" restart ib_gateway >> "$LOG_FILE" 2>&1; then
    GATEWAY_FAIL_COUNT=0
    LAST_RESTART="$now"
    write_state
    log "OK ib_gateway restart command completed"
    send_discord "YRVI restarted IB Gateway" "The host watchdog restarted \`ib_gateway\` after repeated Gateway readiness failures." "warning"
else
    log "ERROR ib_gateway restart command failed"
    send_discord "YRVI IB Gateway restart failed" "The host watchdog attempted to restart \`ib_gateway\`, but the Docker Compose command failed. Check \`docker_watchdog.log\`." "error"
fi
