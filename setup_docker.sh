#!/bin/bash

LOCKFILE="$HOME/.yrvi_setup.lock"
if [ -f "$LOCKFILE" ]; then
    LOCK_AGE=$(( $(date +%s) - $(date -r "$LOCKFILE" +%s) ))
    if [ "$LOCK_AGE" -lt 600 ]; then
        echo "$(date): Another instance is running (lock age: ${LOCK_AGE}s) — exiting"
        exit 0
    else
        echo "$(date): Stale lock found (${LOCK_AGE}s old) — removing and proceeding"
        rm -f "$LOCKFILE"
    fi
fi
touch "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT

# ─────────────────────────────────────────────────────────────
#  Docker Setup — You Rock Volatility Income Fund
#  Containerized branch: Docker replaces launchd/IBC
#
#  Usage:
#    bash setup_docker.sh --paper   # paper trading (IBKR paper account)
#    bash setup_docker.sh --live    # live trading  (IBKR live account)
#
#  What it does:
#    1. Checks Docker is running (install Docker Desktop first)
#    2. Configures secrets via the secrets container (browser or CLI)
#    3. Validates .env.compose and config (docker/preflight.sh)
#    4. Builds and starts all 5 containers (ib_gateway, api, scheduler, web, secrets)
#    5. Installs com.yourockfund.docker launchd service so containers
#       start automatically on every login / reboot
#    6. Installs YRVI Startup.app in /Applications
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ── Flag parsing ───────────────────────────────────────────────

usage() {
    echo ""
    echo "  Usage: setup_docker.sh --paper|--live"
    echo ""
    echo "    --paper          use paper trading secrets (IBKR paper account)"
    echo "    --live           use live trading secrets  (IBKR live account)"
    echo ""
}

TRADING_MODE=""
for arg in "$@"; do
    case "$arg" in
        --paper)         TRADING_MODE="paper" ;;
        --live)          TRADING_MODE="live"  ;;
        --help|-h) usage; exit 0 ;;
        *) printf "Unknown flag: %s\n" "$arg" >&2; usage; exit 1 ;;
    esac
done

if [ -z "$TRADING_MODE" ]; then
    usage
    exit 1
fi

# ── Globals ────────────────────────────────────────────────────

PROJ=$(cd "$(dirname "$0")" && pwd)
DOCKER_PLIST_SRC="$PROJ/com.yourockfund.docker.plist"
DOCKER_PLIST_DEST="$HOME/Library/LaunchAgents/com.yourockfund.docker.plist"
DOCKER_LABEL="com.yourockfund.docker"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { printf "  ${GREEN}✅${NC}  %s\n" "$1"; }
fail() { printf "  ${RED}❌${NC}  %s\n" "$1" >&2; exit 1; }
warn() { printf "  ${YELLOW}⚠️${NC}   %s\n" "$1"; }
info() { printf "  ${BLUE}ℹ️${NC}   %s\n" "$1"; }

MODE_LABEL="paper"
[ "$TRADING_MODE" = "live" ] && MODE_LABEL="LIVE"

echo ""
printf "${BOLD}${BLUE}"
echo "╔══════════════════════════════════════════════════╗"
printf "║    Docker Setup — YRVI Fund  (%-17s)  ║\n" "$MODE_LABEL"
echo "╚══════════════════════════════════════════════════╝"
printf "${NC}"
echo ""

# ── Step 1: Check Docker is running ──────────────────────────
echo "${BOLD}Step 1 / 6   Check Docker${NC}"
echo "──────────────────────────────────────────────────────"

if ! command -v docker &>/dev/null; then
    fail "docker not found — install Docker Desktop from https://www.docker.com/products/docker-desktop and retry"
fi

if ! docker info &>/dev/null 2>&1; then
    fail "Docker daemon not running — start Docker Desktop and retry"
fi

DOCKER_VER=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
ok "Docker running  (server $DOCKER_VER)"

echo ""
warn "Make sure Docker Desktop is set to auto-start:"
echo "       Docker Desktop → Settings → General:"
echo "         ✅  Start Docker Desktop when you sign in"
echo "       This ensures Docker is running before YRVI"
echo "       containers restart after a reboot."
echo ""

# ── Step 2: Configure secrets ────────────────────────────────
echo ""
echo "${BOLD}Step 2 / 6   Configure secrets${NC}"
echo "──────────────────────────────────────────────────────"

cd "$PROJ"
mkdir -p docker/secrets

# Empty placeholders for the file-based secrets: block in
# docker-compose.yml — ib_gateway still reads tws_password_paper
# from /run/secrets/. Other services use the secrets container
# HTTP path; their files stay empty.
for _placeholder in \
    docker/secrets/tws_password_paper \
    docker/secrets/tws_password_live \
    docker/secrets/render_secret \
    docker/secrets/anthropic_api_key \
    docker/secrets/discord_webhook_url \
    docker/secrets/discord_webhook_weekly_plan \
    docker/secrets/ibkr_password_live; do
    [ -f "$_placeholder" ] || touch "$_placeholder"
done
unset _placeholder

SECRETS_URL="http://localhost:8001"

info "Starting secrets container..."
docker compose --env-file .env.compose up -d --build secrets >/dev/null 2>&1 \
    || fail "Failed to start secrets container — check: docker compose --env-file .env.compose logs secrets"

WAIT=0
until curl -sf "$SECRETS_URL/health" >/dev/null 2>&1; do
    if [ "$WAIT" -ge 30 ]; then
        fail "Secrets container did not become healthy within 30s — check: docker compose --env-file .env.compose logs secrets"
    fi
    sleep 3
    WAIT=$((WAIT + 3))
done
ok "Secrets container running"

secrets_complete() {
    curl -sf "$SECRETS_URL/secrets/status" 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('complete') else 'false')" 2>/dev/null \
        || echo "false"
}

post_secret() {
    local name="$1"
    local value="$2"
    local code
    code=$(printf '%s' "$value" \
        | python3 -c "import json,sys; print(json.dumps({'value': sys.stdin.read()}))" \
        | curl -s -o /dev/null -w '%{http_code}' \
            -X POST "$SECRETS_URL/secret/$name" \
            -H 'Content-Type: application/json' \
            --data-binary @-)
    [ "$code" = "200" ]
}

if [ "$(secrets_complete)" = "true" ]; then
    ok "Secrets already configured"
else
    info "Opening $SECRETS_URL in your browser..."
    case "$(uname -s)" in
        Darwin) open "$SECRETS_URL" 2>/dev/null || true ;;
        Linux)  xdg-open "$SECRETS_URL" 2>/dev/null || true ;;
        *)      info "Open $SECRETS_URL in a browser to enter secrets" ;;
    esac

    BROWSER_OK=false
    ELAPSED=0
    while [ "$ELAPSED" -lt 300 ]; do
        if [ "$(secrets_complete)" = "true" ]; then
            BROWSER_OK=true
            break
        fi
        printf "\r  Waiting for secrets... (%ds / 300s)" "$ELAPSED"
        sleep 5
        ELAPSED=$((ELAPSED + 5))
    done
    printf "\r%-60s\r" ""

    if [ "$BROWSER_OK" = true ]; then
        ok "Secrets configured via browser"
    else
        warn "Browser setup incomplete — switching to CLI..."

        prompt_required() {
            local name="$1"
            local label="$2"
            local value confirm
            while true; do
                printf "  Enter %s: " "$label"
                read -rs value </dev/tty
                echo ""
                if [ -z "$value" ]; then
                    printf "  ${RED}❌${NC}  '%s' cannot be empty.\n" "$label"
                    continue
                fi
                printf "  Confirm %s: " "$label"
                read -rs confirm </dev/tty
                echo ""
                if [ "$value" = "$confirm" ]; then
                    if post_secret "$name" "$value"; then
                        ok "$label saved"
                        return 0
                    else
                        fail "Failed to save '$label' to secrets container"
                    fi
                else
                    printf "  ${RED}❌${NC}  Values do not match. Please try again.\n"
                fi
            done
        }

        prompt_optional() {
            local name="$1"
            local label="$2"
            local value
            printf "  %s (press Enter to skip): " "$label"
            read -rs value </dev/tty
            echo ""
            if [ -n "$value" ]; then
                if post_secret "$name" "$value"; then
                    ok "$label saved"
                else
                    fail "Failed to save '$label' to secrets container"
                fi
            else
                info "$label — skipped"
            fi
        }

        echo ""
        info "Required account info:"
        prompt_required "account_paper"      "IBKR paper account ID (e.g. DU123456)"
        prompt_required "tws_userid_paper"   "IBKR paper username"

        echo ""
        info "Required secrets:"
        prompt_required "tws_password_paper" "IBKR paper trading password"
        prompt_required "render_secret"      "Render screener API secret"

        echo ""
        info "Optional (for live trading only):"
        prompt_optional "account_live"      "IBKR live account ID"
        prompt_optional "tws_userid_live"   "IBKR live username"
        prompt_optional "tws_password_live" "IBKR live trading password"

        echo ""
        info "Optional secrets:"
        prompt_optional "vnc_server_password"          "VNC password (default: ibgateway123!test)"
        prompt_optional "discord_webhook_url"          "Discord webhook URL"
        prompt_optional "discord_webhook_weekly_plan"  "Discord weekly plan webhook"
    fi
fi

# ── Step 3: Validate .env.compose and config ─────────────────
echo ""
echo "${BOLD}Step 3 / 6   Validate .env.compose and config${NC}"
echo "──────────────────────────────────────────────────────"

if [ ! -f ".env.compose" ]; then
    fail ".env.compose not found — copy .env.compose.example to .env.compose and fill in credentials"
fi

# Account credentials are now managed by the secrets container — preflight
# verifies the required secrets are populated there.
if [ "$TRADING_MODE" = "live" ]; then
    LIVE_ACCT=$(curl -sf "$SECRETS_URL/secret/account_live" 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('value',''))" 2>/dev/null || echo "")
    LIVE_USER=$(curl -sf "$SECRETS_URL/secret/tws_userid_live" 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('value',''))" 2>/dev/null || echo "")
    if [ -z "$LIVE_ACCT" ] || [ -z "$LIVE_USER" ]; then
        fail "Live mode requires account_live and tws_userid_live in the secrets UI ($SECRETS_URL)"
    fi
fi

if [ "$TRADING_MODE" = "paper" ]; then
    sh docker/preflight.sh || fail "Preflight check failed — fix the issues above and retry"
fi
ok "Config validated"

# ── Step 4: Build and start containers ───────────────────────
echo ""
echo "${BOLD}Step 4 / 6   Build and start all 5 containers${NC}"
echo "──────────────────────────────────────────────────────"

info "Building images and starting api, scheduler, ib_gateway, web (secrets already running)..."

if docker compose --env-file .env.compose up -d --build; then

    sleep 3
    RUNNING=$(docker compose --env-file .env.compose ps 2>/dev/null \
        | grep -cE "Up|running|healthy" || true)
    if [ "$RUNNING" -ge 5 ]; then
        ok "All $RUNNING containers running"
    elif [ "$RUNNING" -gt 0 ]; then
        warn "$RUNNING / 5 containers running — IB Gateway may still be initializing (allow 60 s)"
        info "Monitor: docker compose --env-file .env.compose logs -f ib_gateway"
    else
        warn "Containers started but status unclear — check:"
        info "  docker compose --env-file .env.compose ps"
    fi

    # ── dry_run safety check ──────────────────────────────────
    info "Checking dry_run safety default..."
    sleep 5
    DRY_RUN=$(curl -sf http://127.0.0.1:8000/api/settings 2>/dev/null \
        | python3 -c \
          "import sys,json; print(json.load(sys.stdin).get('dry_run','?'))" \
          2>/dev/null \
        || echo "?")
    if [ "$DRY_RUN" = "True" ] || [ "$DRY_RUN" = "true" ]; then
        ok "dry_run=true — no IBKR orders will be submitted until you enable trading"
    elif [ "$DRY_RUN" = "False" ] || [ "$DRY_RUN" = "false" ]; then
        warn "dry_run=false — the scheduler WILL submit orders to IBKR when scheduled jobs run"
    else
        info "dry_run not checked yet (API still starting — verify at http://localhost:8000/api/settings)"
    fi

else
    echo ""
    printf "  ${RED}❌${NC}  docker compose up failed.\n"
    info "  docker compose --env-file .env.compose ps"
    info "  docker compose --env-file .env.compose logs"
    exit 1
fi

# ── Step 5: Install Docker auto-start on login ────────────────
echo ""
echo "${BOLD}Step 5 / 6   Install Docker auto-start on login${NC}"
echo "──────────────────────────────────────────────────────"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

sed -e "s|__PROJ__|$PROJ|g" -e "s|__HOME__|$HOME|g" "$DOCKER_PLIST_SRC" > "$DOCKER_PLIST_DEST"

if [ -t 0 ]; then
    launchctl bootstrap "gui/$(id -u)" "$DOCKER_PLIST_DEST" 2>/dev/null || \
        launchctl load "$DOCKER_PLIST_DEST" 2>/dev/null || true
    ok "com.yourockfund.docker installed — containers will auto-start on every login"
else
    ok "com.yourockfund.docker already active (launched by launchd — skipping re-register)"
fi
info "  Reboot log: cat ~/Library/Logs/yrvi-autostart.log"

# ── Step 6: Install Desktop app (macOS only) ─────────────────
echo ""
echo "${BOLD}Step 6 / 6   Install Desktop app${NC}"
echo "──────────────────────────────────────────────────────"

OS=$(uname -s)

if [ "$OS" = "Darwin" ]; then
    APP_DEST="/Applications/YRVI Startup.app"

    if [ -e "$APP_DEST" ]; then
        ok "YRVI Startup app already installed — skipping"
    else
        cp -R "$PROJ/assets/app_template/" "$APP_DEST"
        mkdir -p "$APP_DEST/Contents/Resources"
        cp "$PROJ/assets/YRVI.icns" "$APP_DEST/Contents/Resources/YRVI.icns"
        sed -i '' "s|__PROJ__|$PROJ|g" "$APP_DEST/Contents/MacOS/yrvi_startup"
        chmod +x "$APP_DEST/Contents/MacOS/yrvi_startup"
        xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || true
        defaults write com.apple.dock persistent-apps -array-add \
            "<dict><key>tile-data</key><dict><key>file-data</key><dict>\
<key>_CFURLString</key><string>/Applications/YRVI Startup.app</string>\
<key>_CFURLStringType</key><integer>0</integer></dict></dict></dict>"
        killall Dock 2>/dev/null || true

        ok "YRVI Startup app installed"
    fi

    # Register yrvi:// URL scheme (idempotent — skips if already registered)
    bash "$PROJ/scripts/yrvi-register-url-scheme.sh"
    ok "yrvi:// upgrade URL scheme registered"
else
    info "Desktop app is macOS only"
    info "  Access dashboard at http://localhost:3000"
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
printf "${BOLD}${GREEN}  Setup complete.${NC}\n"
echo "══════════════════════════════════════════════════════"
echo ""
echo "  Dashboard:  http://localhost:3000"
echo "  API status: http://localhost:8000/api/status"
echo ""
echo "  Wait for IB Gateway to log in (watch for 'Login has completed'):"
echo "    docker compose --env-file .env.compose logs -f ib_gateway"
echo ""
echo "  VNC (if IBKR shows a dialog at first login):"
echo "    1. Set the VNC password at http://localhost:8001 (or use default)"
echo "    2. docker compose --env-file .env.compose up -d --force-recreate ib_gateway"
echo "    3. Connect a VNC client to localhost:5900"
echo "    macOS: open vnc://localhost:5900 in Finder → Go → Connect to Server"
echo ""
echo "  Pre-flight check anytime:"
echo "    bash startup.sh"
echo ""
echo "  Re-run setup (skips already-configured secrets):"
echo "    bash setup_docker.sh --$TRADING_MODE"
echo ""
