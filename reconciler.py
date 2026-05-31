"""
Reconciler — Friday 4:30PM PST (runs after assignment detection)

Pulls this week's fills from IBKR via reqExecutions and upserts the week
into ytd_tracker.json. Keeps the tracker accurate even if the Docker volume
is wiped between runs.

run_reconcile():
  - Connects to IBKR and fetches all fills from the past 10 days
  - Identifies CSP sells (OPT SELL PUT), CC sells (OPT SELL CALL), stock sells (STK SELL)
  - Groups by week_start (Monday), computes realized premium per week
  - Upserts into ytd_tracker.json — IBKR is source of truth
  - Logs a summary and returns the updated tracker dict
"""
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from ib_insync import IB, ExecutionFilter

from config import IBKR_HOST, IBKR_PORT, ACCOUNT

IBKR_CLIENT_ID_RECONCILE = 4   # dedicated client ID — doesn't conflict with other modules
FUND_BUDGET               = 250_000
YTD_FILE                  = "ytd_tracker.json"

log = logging.getLogger(__name__)


def _load_ytd() -> dict:
    try:
        with open(YTD_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"weeks": [], "total_premium": 0.0, "weeks_traded": 0,
                "best_week": None, "worst_week": None}


def _save_ytd(tracker: dict):
    with open(YTD_FILE, "w") as f:
        json.dump(tracker, f, indent=2)


def _week_start(dt: datetime) -> str:
    monday = dt.date() - timedelta(days=dt.weekday())
    return monday.strftime("%Y-%m-%d")


def _fetch_fills(ib: IB) -> list:
    cutoff = datetime.now(timezone.utc) - timedelta(days=10)
    f = ExecutionFilter(
        acctCode=ACCOUNT,
        time=cutoff.strftime("%Y%m%d %H:%M:%S"),
    )
    return ib.reqExecutions(f)


def _parse_fills(fills: list) -> dict:
    weeks = defaultdict(lambda: {"csp_premium": 0.0, "cc_premium": 0.0, "shares_sold_pnl": 0.0})

    for fill in fills:
        exec_  = fill.execution
        cont   = fill.contract
        report = fill.commissionReport

        if exec_.side != "SLD":
            continue

        ws         = _week_start(fill.time)
        proceeds   = exec_.avgPrice * abs(exec_.shares) * getattr(cont, "multiplier", 1) or 1
        commission = getattr(report, "commission", 0.0) or 0.0
        net        = proceeds - abs(commission)

        if cont.secType == "OPT":
            multiplier = float(getattr(cont, "multiplier", 100) or 100)
            net = exec_.avgPrice * abs(exec_.shares) * multiplier - abs(commission)
            if cont.right == "P":
                weeks[ws]["csp_premium"] += net
            elif cont.right == "C":
                weeks[ws]["cc_premium"] += net
        elif cont.secType == "STK":
            realized = getattr(report, "realizedPNL", 0.0) or 0.0
            weeks[ws]["shares_sold_pnl"] += realized

    return weeks


def _upsert_weeks(tracker: dict, new_weeks: dict) -> dict:
    existing = {w["week_start"]: w for w in tracker.get("weeks", [])}

    for ws, data in new_weeks.items():
        realized = round(data["csp_premium"] + data["cc_premium"] + data["shares_sold_pnl"], 2)
        existing[ws] = {
            "week_start":       ws,
            "csp_premium":      round(data["csp_premium"], 2),
            "cc_premium":       round(data["cc_premium"], 2),
            "shares_sold_pnl":  round(data["shares_sold_pnl"], 2),
            "realized":         realized,
            "yield_pct":        round(realized / FUND_BUDGET * 100, 3),
        }

    week_list      = sorted(existing.values(), key=lambda w: w["week_start"])
    total_premium  = round(sum(w["realized"] for w in week_list), 2)
    best           = max(week_list, key=lambda w: w["realized"])
    worst          = min(week_list, key=lambda w: w["realized"])

    return {
        "weeks":         week_list,
        "total_premium": total_premium,
        "weeks_traded":  len(week_list),
        "best_week":     {"week_start": best["week_start"],  "realized": best["realized"],  "yield_pct": best["yield_pct"]},
        "worst_week":    {"week_start": worst["week_start"], "realized": worst["realized"], "yield_pct": worst["yield_pct"]},
    }


def run_reconcile() -> dict:
    log.info("=" * 65)
    log.info(f"🔁 FRIDAY RECONCILE — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    log.info("=" * 65)

    ib = IB()
    try:
        ib.connect(IBKR_HOST, IBKR_PORT, clientId=IBKR_CLIENT_ID_RECONCILE)
        log.info(f"✅ Connected (clientId={IBKR_CLIENT_ID_RECONCILE})")

        fills = _fetch_fills(ib)
        log.info(f"   Fetched {len(fills)} fills from IBKR (last 10 days)")

        if not fills:
            log.info("   No fills — nothing to reconcile")
            return _load_ytd()

        new_weeks = _parse_fills(fills)
        if not new_weeks:
            log.info("   No sellable fills found — nothing to reconcile")
            return _load_ytd()

        tracker = _load_ytd()
        updated = _upsert_weeks(tracker, new_weeks)
        _save_ytd(updated)

        log.info(f"   Reconciled {len(new_weeks)} week(s):")
        for ws, data in sorted(new_weeks.items()):
            realized = data["csp_premium"] + data["cc_premium"] + data["shares_sold_pnl"]
            log.info(f"     {ws}  CSP=${data['csp_premium']:,.2f}  CC=${data['cc_premium']:,.2f}"
                     f"  Shares P&L=${data['shares_sold_pnl']:,.2f}  Total=${realized:,.2f}")

        log.info(f"   YTD total: ${updated['total_premium']:,.2f}  "
                 f"({updated['weeks_traded']} weeks)")
        return updated

    except Exception as e:
        log.error(f"❌ Reconcile error: {e}", exc_info=True)
        return _load_ytd()
    finally:
        if ib.isConnected():
            ib.disconnect()
