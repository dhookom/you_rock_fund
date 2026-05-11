import json
import os
from pathlib import Path
from dotenv import load_dotenv

from secrets_client import get_secret

load_dotenv()

# ── You Rock Volatility Income Fund ──────────────────────────
IBKR_HOST      = os.environ["IBKR_HOST"]
IBKR_PORT      = int(os.environ["IBKR_PORT"])   # IB Gateway: 4002 = paper, 4001 = live
IBKR_CLIENT_ID = int(os.environ["IBKR_CLIENT_ID"])

TRADING_MODE   = os.environ.get("TRADING_MODE", "paper").lower()
_ACCOUNT_KEY   = "account_live" if TRADING_MODE == "live" else "account_paper"
ACCOUNT        = get_secret(_ACCOUNT_KEY, "ACCOUNT")
if not ACCOUNT:
    raise RuntimeError(
        f"ACCOUNT not set — configure '{_ACCOUNT_KEY}' in the secrets container "
        f"(http://localhost:8001) or set ACCOUNT in the environment."
    )

# IBKR client IDs — each module gets its own to allow concurrent connections
IBKR_CLIENT_ID_WHEEL = 2        # wheel_manager.py
IBKR_CLIENT_ID_RISK  = 3        # risk_manager.py

# Execution
EXECUTE_HOUR_PST = 10            # 10AM PST Monday
EXECUTE_MINUTE   = 0

# Screener API
RENDER_URL    = os.environ["RENDER_URL"]
RENDER_SECRET = get_secret("render_secret", "RENDER_SECRET")

# ── Fund parameters (settings.json is source of truth) ───────

_BASE = Path(__file__).parent

def get_settings() -> dict:
    """Hot-reload fund settings from settings.json on every call."""
    defaults: dict = {}
    defaults_file = _BASE / "settings_default.json"
    settings_file = _BASE / "settings.json"
    if defaults_file.exists():
        try:
            defaults = json.loads(defaults_file.read_text())
        except Exception:
            pass
    if settings_file.exists():
        try:
            return {**defaults, **json.loads(settings_file.read_text())}
        except Exception:
            pass
    return defaults

_s = get_settings()

TOTAL_FUND_BUDGET   = _s.get("fund_budget",      250_000)
NUM_POSITIONS       = _s.get("num_positions",     5)
TARGET_PER_POSITION = int(TOTAL_FUND_BUDGET // NUM_POSITIONS)
MAX_PER_POSITION    = _s.get("max_position_size", 70_000)
WEEKLY_INCOME_GOAL  = 0.01       # 1% per week
DRY_RUN             = _s.get("dry_run",           False)
