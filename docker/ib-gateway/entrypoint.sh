#!/bin/bash
set -eu

SECRETS_BASE="http://secrets:8001/secret"
MAX_RETRIES=10
RETRY_DELAY=3
VNC_DEFAULT="ibgateway123!test"

TRADING_MODE="${TRADING_MODE:-paper}"

if [ "$TRADING_MODE" = "live" ]; then
    PASSWORD_KEY="tws_password_live"
    USERID_KEY="tws_userid_live"
else
    PASSWORD_KEY="tws_password_paper"
    USERID_KEY="tws_userid_paper"
fi

# Fetch a secret value by name. Echoes the value on stdout, empty string on failure.
# Always returns 0 so callers can decide whether empty is fatal.
fetch_secret() {
    name="$1"
    attempt=0
    while [ "$attempt" -lt "$MAX_RETRIES" ]; do
        attempt=$((attempt + 1))
        body=$(curl -sf --max-time 5 "${SECRETS_BASE}/${name}" 2>/dev/null || true)
        if [ -n "$body" ]; then
            value=$(printf '%s' "$body" | sed -n 's/.*"value"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p')
            if [ -n "$value" ]; then
                printf '%s' "$value"
                return 0
            fi
        fi
        sleep "$RETRY_DELAY"
    done
    return 0
}

echo "yrvi-gw-entrypoint: fetching ${PASSWORD_KEY} from secrets container..."
password=$(fetch_secret "$PASSWORD_KEY")
if [ -z "$password" ]; then
    echo "yrvi-gw-entrypoint: ERROR — could not fetch ${PASSWORD_KEY} after $MAX_RETRIES attempts" >&2
    echo "yrvi-gw-entrypoint: secrets container unreachable, or password not configured" >&2
    echo "yrvi-gw-entrypoint: open http://localhost:8001 to enter the password, then restart this container" >&2
    exit 1
fi

echo "yrvi-gw-entrypoint: fetching ${USERID_KEY} from secrets container..."
userid=$(fetch_secret "$USERID_KEY")
if [ -z "$userid" ]; then
    echo "yrvi-gw-entrypoint: ERROR — could not fetch ${USERID_KEY} after $MAX_RETRIES attempts" >&2
    echo "yrvi-gw-entrypoint: open http://localhost:8001 to enter the IBKR username, then restart this container" >&2
    exit 1
fi

echo "yrvi-gw-entrypoint: fetching vnc_server_password from secrets container (optional)..."
vnc_password=$(fetch_secret "vnc_server_password")
if [ -z "$vnc_password" ]; then
    vnc_password="$VNC_DEFAULT"
    echo "yrvi-gw-entrypoint: vnc_server_password not set — using default"
fi

# The image's common.sh errors if both TWS_PASSWORD and TWS_PASSWORD_FILE are set.
# Pass the password as TWS_PASSWORD and clear the file path.
unset TWS_PASSWORD_FILE
export TWS_PASSWORD="$password"
export TWS_USERID="$userid"
export VNC_SERVER_PASSWORD="$vnc_password"

echo "yrvi-gw-entrypoint: secrets loaded (mode=${TRADING_MODE}, userid set, password ${#password} chars), starting IB Gateway..."

exec "$@"
