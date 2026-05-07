#!/bin/bash
set -eu

SECRETS_URL="http://secrets:8001/secret/tws_password_paper"
MAX_RETRIES=10
RETRY_DELAY=3

echo "yrvi-gw-entrypoint: fetching tws_password_paper from secrets container..."

password=""
attempt=0
while [ "$attempt" -lt "$MAX_RETRIES" ]; do
    attempt=$((attempt + 1))
    body=$(curl -sf --max-time 5 "$SECRETS_URL" 2>/dev/null || true)
    if [ -n "$body" ]; then
        password=$(printf '%s' "$body" | sed -n 's/.*"value"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p')
        if [ -n "$password" ]; then
            break
        fi
    fi
    echo "yrvi-gw-entrypoint: attempt $attempt/$MAX_RETRIES failed, retrying in ${RETRY_DELAY}s..." >&2
    sleep "$RETRY_DELAY"
done

if [ -z "$password" ]; then
    echo "yrvi-gw-entrypoint: ERROR — could not fetch tws_password_paper after $MAX_RETRIES attempts" >&2
    echo "yrvi-gw-entrypoint: secrets container unreachable, or password not configured" >&2
    echo "yrvi-gw-entrypoint: open http://localhost:8001 to enter the password, then restart this container" >&2
    exit 1
fi

# The image's common.sh errors if both TWS_PASSWORD and TWS_PASSWORD_FILE are set.
# Pass the password as TWS_PASSWORD and clear the file path.
unset TWS_PASSWORD_FILE
export TWS_PASSWORD="$password"

echo "yrvi-gw-entrypoint: password fetched (${#password} chars), starting IB Gateway..."

exec "$@"
