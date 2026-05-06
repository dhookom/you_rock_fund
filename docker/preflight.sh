#!/bin/sh
set -eu

env_file="${1:-.env.compose}"
secrets_dir="${YRVI_SECRETS_DIR:-./docker/secrets}"
failed=0

fail() {
    printf 'ERROR: %s\n' "$1" >&2
    failed=1
}

value_for() {
    key="$1"
    if [ ! -f "$env_file" ]; then
        return
    fi
    awk -F= -v key="$key" '
        $0 !~ /^[[:space:]]*#/ && $1 == key {
            sub(/^[^=]*=/, "")
            print
            exit
        }
    ' "$env_file"
}

is_placeholder() {
    value="$1"
    case "$value" in
        ""|your_*|YOUR_*|replace-with*|get_from*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

if [ ! -f "$env_file" ]; then
    fail "$env_file is missing. Copy .env.compose.example to .env.compose first."
else
    for key in ACCOUNT_PAPER TWS_USERID_PAPER; do
        value="$(value_for "$key")"
        if is_placeholder "$value"; then
            fail "$key in $env_file is blank or still a placeholder."
        fi
    done

    account_paper="$(value_for ACCOUNT_PAPER)"
    tws_userid_paper="$(value_for TWS_USERID_PAPER)"
    if [ -n "$account_paper" ] && [ "$account_paper" = "$tws_userid_paper" ]; then
        fail "TWS_USERID_PAPER must be the paper login username, not the paper account id."
    fi

    mode="$(value_for TRADING_MODE)"
    if [ "$mode" = "live" ]; then
        fail "This Compose stack is currently wired for paper Gateway login. Keep TRADING_MODE=paper until live Compose wiring is intentionally enabled."
    fi
fi

status_body="$(curl -sf http://localhost:8001/secrets/status 2>/dev/null || true)"

if [ -z "$status_body" ]; then
    fail "Secrets container is not running — run setup_docker.sh first"
else
    complete="$(printf '%s' "$status_body" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('complete') else 'false')" 2>/dev/null || echo "false")"
    if [ "$complete" != "true" ]; then
        fail "Required secrets not configured — open http://localhost:8001 to enter missing secrets"
    fi
fi

if [ "$failed" -ne 0 ]; then
    exit 1
fi

printf 'Container preflight OK: required config and secrets are populated.\n'
