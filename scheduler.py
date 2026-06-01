import json
import logging
import asyncio
import os
import socket
from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.blocking import BlockingScheduler
from config import NUM_POSITIONS, TOTAL_FUND_BUDGET, IBKR_HOST, IBKR_PORT, IBKR_CLIENT_ID, ACCOUNT, get_settings
from secrets_client import get_secret
from market_calendar import is_first_trading_day_of_week, is_market_holiday

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    handlers=[
        logging.FileHandler("scheduler_log.txt"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

STATE_FILE      = "state.json"
SETTINGS_FILE   = "settings.json"
HEARTBEAT_FILE  = "scheduler_heartbeat.json"

DEFAULT_TIMEZONE = "America/Los_Angeles"


def _resolve_timezone() -> ZoneInfo:
    try:
        with open(SETTINGS_FILE) as f:
            tz_name = (json.load(f) or {}).get("timezone")
    except (FileNotFoundError, json.JSONDecodeError):
        tz_name = None
    tz_name = tz_name or os.environ.get("TIME_ZONE") or DEFAULT_TIMEZONE
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo(DEFAULT_TIMEZONE)


PST = _resolve_timezone()  # variable name kept for compatibility; reflects configured timezone


def _write_heartbeat():
    try:
        with open(HEARTBEAT_FILE, "w") as f:
            json.dump({"timestamp": datetime.now(PST).isoformat()}, f)
    except Exception:
        pass


def _discord_alert(message: str) -> None:
    """Send a plain-text Discord alert. No-ops when webhook is not configured."""
    try:
        webhook_url = get_secret("discord_webhook_url", "DISCORD_WEBHOOK_URL")
        if not webhook_url:
            return
        import requests
        from pathlib import Path
        _vf = Path(__file__).parent / "VERSION"
        _v  = f"v{_vf.read_text().strip()}" if _vf.exists() else "?"
        _tag = f"`{_v} · {ACCOUNT}`" if ACCOUNT else f"`{_v}`"
        requests.post(webhook_url, json={"content": f"{message}\n{_tag}"}, timeout=5)
    except Exception as e:
        log.warning(f"Discord alert failed: {e}")


def _fetch_account_summary(fallback: float) -> tuple[float, float]:
    """
    Fetch IBKR BuyingPower and NetLiquidation.
    Returns (buying_power, net_liq); falls back to (fallback, fallback) on any failure.
    BuyingPower already reflects all open positions (including manual trades outside the app),
    so it is the correct base budget for new CSPs.
    """
    try:
        from ib_insync import IB
        ib = IB()
        ib.connect(IBKR_HOST, IBKR_PORT, clientId=IBKR_CLIENT_ID, readonly=True)
        summary = ib.accountSummary(ACCOUNT)
        ib.disconnect()
        by_tag  = {v.tag: float(v.value) for v in summary if v.tag in ("BuyingPower", "NetLiquidation")}
        bp      = by_tag.get("BuyingPower")
        net_liq = by_tag.get("NetLiquidation")
        if bp and bp > 0 and net_liq and net_liq > 0:
            # Use the lesser of the two: for cash/Roth accounts BuyingPower < NetLiq (correct);
            # for margin/paper accounts BuyingPower is inflated (4x+), so NetLiq wins.
            effective = min(bp, net_liq)
            log.info(f"  💹 Compound mode: net_liq=${net_liq:,.0f}  buying_power=${bp:,.0f}  "
                     f"using=${effective:,.0f}")
            return effective, net_liq
        log.warning("  ⚠️  Account summary incomplete — using fund budget fallback")
    except Exception as e:
        log.warning(f"  ⚠️  Could not fetch account summary from IBKR ({e}) — using fund budget fallback")
    return fallback, fallback


def _fetch_net_liq(fallback: float) -> float:
    """Legacy wrapper — returns NetLiquidation only."""
    _, net_liq = _fetch_account_summary(fallback)
    return net_liq
    return fallback


def _ibkr_reachable() -> bool:
    """Quick TCP probe: returns True if the IB Gateway API port is accepting connections."""
    host = os.environ.get("IBKR_HOST", "127.0.0.1")
    port = int(os.environ.get("IBKR_PORT", "4004"))
    try:
        with socket.create_connection((host, port), timeout=5):
            return True
    except OSError:
        return False


def _new_loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    return loop


def _load_settings() -> dict:
    try:
        with open(SETTINGS_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def _parse_exec_time(settings: dict) -> tuple:
    """Return (hour, minute) PST for configured Monday execution time."""
    try:
        h, m = map(int, settings.get("execution_time", "10:00").split(":"))
        return h, m
    except Exception:
        return 10, 0

def _offset_time(hour: int, minute: int, delta_minutes: int) -> tuple:
    """Subtract delta_minutes from (hour, minute), return new (hour, minute)."""
    total = hour * 60 + minute - delta_minutes
    return total // 60, total % 60


def _load_state() -> dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


# ── Saturday 6PM — screener preview ───────────────────────────

def run_screener_preview():
    loop = _new_loop()
    now  = datetime.now(PST)
    log.info("\n" + "=" * 65)
    log.info(f"📋 SATURDAY PREVIEW — {now.strftime('%A %Y-%m-%d %H:%M %Z')}")
    log.info("=" * 65)
    try:
        from screener import get_top_targets
        from position_sizer import size_all

        state        = _load_state()
        holdings     = state.get("wheel_holdings", [])
        active       = [h for h in holdings if h.get("shares", 0) > 0]
        held_map     = {h["ticker"]: h for h in active}
        reserved     = round(sum(
            h.get("shares", 0) * h.get("assigned_strike", 0.0) for h in active
        ), 2)
        active_count = len(active)
        all_targets  = get_top_targets(10, always_include=set(held_map.keys()))

        # Split: tickers we already hold → CC; everything else → CSP
        cc_targets  = []
        csp_targets = []
        for t in all_targets:
            if t["ticker"] in held_map:
                t["action_type"] = "CC"
                t["shares"]      = held_map[t["ticker"]]["shares"]
                cc_targets.append(t)
            else:
                csp_targets.append(t)

        settings         = _load_settings()
        compound_enabled = settings.get("compound_enabled", True)
        if compound_enabled:
            # BuyingPower from IBKR already reflects all open positions (including manual
            # trades outside the app and wheel stock), so use it directly as the CSP budget.
            buying_power, _ = _fetch_account_summary(TOTAL_FUND_BUDGET)
            budget          = buying_power
        else:
            budget = TOTAL_FUND_BUDGET - reserved
        positions    = size_all(csp_targets, budget=budget, num_positions=NUM_POSITIONS,
                                cc_targets=cc_targets)
        exec_time    = settings.get("execution_time", "10:00")
        log.info(f"\n📋 {len(positions)} positions queued for Monday {exec_time} PST  "
                 f"(budget=${budget:,.0f}{'  compounding ON' if compound_enabled else ''})")

        from discord_poster import is_plan_enabled, post_weekly_plan
        if is_plan_enabled():
            post_weekly_plan(positions)
            log.info("✅ Weekly plan posted to Discord")
    except Exception as e:
        log.error(f"❌ Preview error: {e}", exc_info=True)
    finally:
        loop.close()


# ── Friday 4:15PM — assignment detection ──────────────────────

def run_assignment_detection():
    loop = _new_loop()
    now  = datetime.now(PST)
    if is_market_holiday(now.date()):
        log.info(f"⏭️  FRIDAY ASSIGNMENT DETECTION skipped — market holiday ({now.strftime('%Y-%m-%d')})")
        loop.close()
        return
    log.info("\n" + "=" * 65)
    log.info(f"🔍 FRIDAY ASSIGNMENT DETECTION — {now.strftime('%A %Y-%m-%d %H:%M %Z')}")
    log.info("=" * 65)
    try:
        from wheel_manager import detect_assignments
        state_before  = _load_state()
        known_tickers = {h["ticker"] for h in state_before.get("wheel_holdings", [])}

        called_away = detect_assignments()

        from discord_poster import is_enabled, post_friday_summary
        if is_enabled():
            state_after  = _load_state()
            today        = now.date().isoformat()
            new_ones     = [h for h in state_after.get("wheel_holdings", [])
                            if h["ticker"] not in known_tickers
                            and h.get("assignment_date") == today]
            settings      = _load_settings()
            fund_budget   = settings.get("fund_budget", TOTAL_FUND_BUDGET)
            post_friday_summary(state_after, called_away or [], new_ones,
                                fund_budget=fund_budget)
    except Exception as e:
        log.error(f"❌ Assignment detection error: {e}", exc_info=True)
        _discord_alert(f"🚨 **YRVI** Friday assignment detection failed: `{type(e).__name__}: {e}`")
    finally:
        loop.close()


# ── Monday 9:50AM — Discord pre-execution preview ─────────────

def run_discord_preview():
    now = datetime.now(PST)
    if not is_first_trading_day_of_week(now.date()):
        log.info(f"⏭️  Discord preview skipped — not the first trading day of the week ({now.strftime('%A %Y-%m-%d')})")
        return
    from discord_poster import is_enabled, post_preview
    if not is_enabled():
        return
    loop = _new_loop()
    log.info("📋 Discord preview — sizing positions...")
    try:
        from screener import get_top_targets
        from position_sizer import size_all
        state        = _load_state()
        context      = state.get("monday_context", {})
        skip_tickers = set(context.get("skip_tickers", []))
        freed        = context.get("freed_capital", 0.0)
        # wheel_check hasn't run yet — estimate from current holdings
        holdings     = state.get("wheel_holdings", [])
        reserved     = round(sum(
            h.get("shares", 0) * h.get("assigned_strike", 0.0)
            for h in holdings if h.get("shares", 0) > 0
        ), 2)
        active_count = sum(1 for h in holdings if h.get("shares", 0) > 0)
        targets      = get_top_targets(10)
        filtered     = [t for t in targets if t["ticker"] not in skip_tickers]
        budget       = TOTAL_FUND_BUDGET + freed - reserved
        target_n     = max(1, NUM_POSITIONS - active_count)
        positions    = size_all(filtered, budget=budget, num_positions=target_n)
        post_preview(positions, budget)
        log.info("✅ Discord preview posted")
    except Exception as e:
        log.error(f"❌ Discord preview error: {e}", exc_info=True)
    finally:
        loop.close()


# ── Monday 9:55AM — wheel check (runs before CSP pipeline) ────

def run_wheel_check_job():
    loop = _new_loop()
    now  = datetime.now(PST)
    if not is_first_trading_day_of_week(now.date()):
        log.info(f"⏭️  WHEEL CHECK skipped — not the first trading day of the week ({now.strftime('%A %Y-%m-%d')})")
        loop.close()
        return
    log.info("\n" + "=" * 65)
    log.info(f"🔄 WHEEL CHECK — {now.strftime('%A %Y-%m-%d %H:%M %Z')}")
    log.info("=" * 65)
    if not _ibkr_reachable():
        msg = "IB Gateway unreachable before Monday wheel check — jobs will likely fail"
        log.error(f"❌ {msg}")
        _discord_alert(f"🚨 **YRVI** {msg}. Check gateway login / VNC port 5900.")
    try:
        from wheel_manager import run_wheel_check
        freed, skip, reserved = run_wheel_check()
        log.info(f"✅ Wheel check done — freed ${freed:,.0f}  "
                 f"reserved ${reserved:,.0f}  skip {skip or 'none'}")
    except Exception as e:
        log.error(f"❌ Wheel check error: {e}", exc_info=True)
        _discord_alert(f"🚨 **YRVI** Monday wheel check failed: `{type(e).__name__}: {e}`")
    finally:
        loop.close()


# ── Monday 10AM — CSP execution pipeline ──────────────────────

def run_pipeline():
    loop = _new_loop()
    now  = datetime.now(PST)
    if not is_first_trading_day_of_week(now.date()):
        log.info(f"⏭️  CSP PIPELINE skipped — not the first trading day of the week ({now.strftime('%A %Y-%m-%d')})")
        loop.close()
        return
    log.info("\n" + "=" * 65)
    log.info(f"⏰ WEEKLY EXECUTION — {now.strftime('%A %Y-%m-%d %H:%M %Z')}")
    log.info("=" * 65)
    if not _ibkr_reachable():
        msg = "IB Gateway unreachable before Monday CSP pipeline — trades will not execute"
        log.error(f"❌ {msg}")
        _discord_alert(f"🚨 **YRVI** {msg}. Check gateway login / VNC port 5900.")
    try:
        from screener import get_top_targets
        from position_sizer import size_all
        from trader import execute_positions

        # Read context left by wheel_check (9:55AM)
        state         = _load_state()
        context       = state.get("monday_context", {})
        skip_tickers       = set(context.get("skip_tickers", []))
        freed_capital      = context.get("freed_capital", 0.0)
        reserved_capital   = context.get("reserved_capital", 0.0)
        active_wheel_count = context.get("active_wheel_count", 0)

        if skip_tickers:
            log.info(f"  🚫 Skipping tickers (wheel exits): {skip_tickers}")
        if freed_capital > 0:
            log.info(f"  💰 Freed capital added to pool: ${freed_capital:,.0f}")
        if reserved_capital > 0:
            log.info(f"  🔒 Capital reserved for {active_wheel_count} wheel holding(s): "
                     f"${reserved_capital:,.0f}")

        all_targets = get_top_targets(10)
        if not all_targets:
            log.error("❌ No targets returned — aborting"); return

        # Filter out wheel-exit tickers so they don't re-enter as CSPs this week
        filtered_targets = [t for t in all_targets if t["ticker"] not in skip_tickers]
        if len(filtered_targets) < len(all_targets):
            log.info(f"  Filtered {len(all_targets) - len(filtered_targets)} ticker(s) "
                     f"from screener results")

        settings         = get_settings()
        compound_enabled = settings.get("compound_enabled", True)
        if compound_enabled:
            # BuyingPower already reflects all open positions (manual trades, wheel stock,
            # open CSPs) so it is the true available cash. Add freed_capital as a safety net
            # in case the 9:55AM wheel stock sales haven't settled in IBKR yet.
            buying_power, net_liq = _fetch_account_summary(TOTAL_FUND_BUDGET)
            effective_budget      = buying_power + freed_capital
            log.info(f"  📊 Budget: buying_power=${buying_power:,.0f}  net_liq=${net_liq:,.0f}  "
                     f"freed=${freed_capital:,.0f}  effective=${effective_budget:,.0f}  (compounding ON)")
        else:
            effective_budget = TOTAL_FUND_BUDGET + freed_capital - reserved_capital
            log.info(f"  📊 Budget: base=${TOTAL_FUND_BUDGET:,.0f}  freed=${freed_capital:,.0f}  "
                     f"reserved=${reserved_capital:,.0f}  effective=${effective_budget:,.0f}  (compounding OFF)")
        target_fills     = max(1, NUM_POSITIONS - active_wheel_count)
        if target_fills < NUM_POSITIONS:
            log.info(f"  🔢 Targeting {target_fills} CSP(s) "
                     f"({active_wheel_count} wheel holding(s) active)")
        positions = size_all(filtered_targets, budget=effective_budget,
                             num_positions=target_fills)
        if not positions:
            log.error("❌ No positions sized — aborting"); return

        # Write executing status to shared file so API can expose it
        import json as _json
        _progress_file = "/data/run_progress.json"
        _ticker_results = []

        def _sched_progress(ticker=None, stage=None, result=None):
            if result:
                _ticker_results.append(result)
            try:
                _json.dump({
                    "executing": True,
                    "current_ticker": ticker,
                    "current_stage": stage,
                    "ticker_results": list(_ticker_results),
                }, open(_progress_file, "w"))
            except Exception:
                pass

        _sched_progress(ticker=None, stage="starting")
        results = execute_positions(positions, extra_targets=filtered_targets,
                                    target_fills=target_fills, status_callback=_sched_progress)

        # Clear progress file now that execution is done
        try:
            _json.dump({"executing": False, "current_ticker": None, "current_stage": None,
                        "ticker_results": _ticker_results}, open(_progress_file, "w"))
        except Exception:
            pass

        # ── Systemic market data failure alert ────────────────
        actionable = [r for r in results if r.get("status") not in
                      ("skipped_contract_size", "skipped_delta")]
        if actionable and all(r.get("status") == "failed_market_data" for r in actionable):
            _discord_alert(
                "⚠️ **YRVI** All candidates failed market data — no trades placed.\n"
                "Check IB Gateway → data farm connections and paper account market data subscriptions."
            )

        # ── Build weekly P&L ──────────────────────────────────
        filled          = [r for r in results if r.get("status") in ("filled", "dry_run", "partial_fill")]
        csp_premium     = sum(r.get("premium_collected", 0) for r in results)
        cc_premium      = context.get("cc_premium", 0.0)
        shares_sold_pnl = context.get("shares_sold_pnl", 0.0)
        total_realized  = round(csp_premium + cc_premium + shares_sold_pnl, 2)

        state = _load_state()   # reload — execute_positions merges but may have written it
        state["weekly_pnl"] = {
            "week_start":       now.strftime("%Y-%m-%d"),
            "csp_premium":      round(csp_premium, 2),
            "cc_premium":       round(cc_premium, 2),
            "shares_sold_pnl":  round(shares_sold_pnl, 2),
            "total_realized":   total_realized,
            "last_updated":     datetime.now().isoformat()
        }
        with open(STATE_FILE, "w") as f:
            json.dump(state, f, indent=2)

        from discord_poster import is_enabled, post_weekly_results
        if is_enabled():
            post_weekly_results(_load_state(), fund_budget=effective_budget)

        log.info(f"\n✅ Done — {len(filled)}/{target_fills} CSP fills  |  "
                 f"CSP ${csp_premium:,.0f}  CC ${cc_premium:,.0f}  "
                 f"Shares sold P&L ${shares_sold_pnl:,.0f}  "
                 f"Total realized ${total_realized:,.0f}")

    except Exception as e:
        log.error(f"❌ Pipeline error: {e}", exc_info=True)
        _discord_alert(f"🚨 **YRVI** Monday CSP pipeline failed: `{type(e).__name__}: {e}`")
    finally:
        loop.close()


# ── Tuesday–Friday 3AM — auto-update check ────────────────────

_GITHUB_VERSION_URL = (
    "https://raw.githubusercontent.com/controllinghand/"
    "you_rock_fund/main/VERSION"
)


def run_auto_update():
    settings = _load_settings()
    if not settings.get("auto_update_enabled"):
        return

    from pathlib import Path
    import requests as req

    now = datetime.now(PST)
    log.info("\n" + "=" * 65)
    log.info(f"🔄 AUTO-UPDATE CHECK — {now.strftime('%A %Y-%m-%d %H:%M %Z')}")
    log.info("=" * 65)
    try:
        version_file = Path(__file__).parent / "VERSION"
        current = version_file.read_text().strip() if version_file.exists() else "unknown"

        r = req.get(_GITHUB_VERSION_URL, params={"_": int(now.timestamp())},
                    headers={"Cache-Control": "no-cache"}, timeout=10)
        r.raise_for_status()
        latest = r.text.strip()

        def _parse(v): return [int(x) for x in v.lstrip("v").split(".")]
        if _parse(current) >= _parse(latest):
            log.info(f"✅ Already up to date ({current})")
            return

        log.info(f"⬆️  Update available: {current} → {latest} — delegating to API")

        # The api container has the /host_repo bind-mount and upgrade logic.
        # Calling it keeps all git/build logic in one place.
        res = req.post("http://api:8000/api/version/upgrade", timeout=90)
        data = res.json()
        if data.get("success"):
            log.info("🚀 Upgrade launched — containers will restart momentarily")
            _discord_alert(f"⬆️ **YRVI** Auto-updating {current} → {latest} — rebuilding now…")
        else:
            log.error(f"❌ Upgrade failed: {data.get('output', '')[:300]}")
            _discord_alert(f"❌ **YRVI** Auto-update failed: `{data.get('output', '')[:200]}`")

    except Exception as e:
        log.error(f"❌ Auto-update error: {e}", exc_info=True)
        _discord_alert(f"❌ **YRVI** Auto-update check failed: `{type(e).__name__}: {e}`")


# ── Tuesday–Thursday 9AM — daily risk monitor ─────────────────

def run_risk_monitor():
    loop = _new_loop()
    now  = datetime.now(PST)
    if is_market_holiday(now.date()):
        log.info(f"⏭️  DAILY RISK MONITOR skipped — market holiday ({now.strftime('%Y-%m-%d')})")
        loop.close()
        return
    log.info("\n" + "=" * 65)
    log.info(f"📊 DAILY RISK MONITOR — {now.strftime('%A %Y-%m-%d %H:%M %Z')}")
    log.info("=" * 65)
    try:
        from risk_manager import run_daily_monitor
        run_daily_monitor()
    except Exception as e:
        log.error(f"❌ Risk monitor error: {e}", exc_info=True)
    finally:
        loop.close()


# ── Scheduler main ─────────────────────────────────────────────

def main():
    settings = _load_settings()
    exec_h, exec_m = _parse_exec_time(settings)
    prev_h, prev_m = _offset_time(exec_h, exec_m, 10)   # Discord preview: exec − 10 min
    wheel_h, wheel_m = _offset_time(exec_h, exec_m, 5)  # Wheel check:     exec − 5 min

    def fmt(h, m):
        ampm = "AM" if h < 12 else "PM"
        h12  = h % 12 or 12
        return f"{h12}:{m:02d} {ampm} PST"

    scheduler = BlockingScheduler(timezone=PST)

    scheduler.add_job(
        run_screener_preview,
        trigger="cron", day_of_week="sat", hour=18, minute=0,
        id="saturday_preview", name="Saturday Screener Preview"
    )
    scheduler.add_job(
        run_assignment_detection,
        trigger="cron", day_of_week="fri", hour=16, minute=15,
        id="friday_assignment", name="Friday Assignment Detection"
    )
    scheduler.add_job(
        run_discord_preview,
        trigger="cron", day_of_week="mon,tue", hour=prev_h, minute=prev_m,
        id="monday_discord_preview", name="Weekly Discord Preview"
    )
    scheduler.add_job(
        run_wheel_check_job,
        trigger="cron", day_of_week="mon,tue", hour=wheel_h, minute=wheel_m,
        id="monday_wheel_check", name="Weekly Wheel Check"
    )
    scheduler.add_job(
        run_pipeline,
        trigger="cron", day_of_week="mon,tue", hour=exec_h, minute=exec_m,
        id="monday_execution", name="Weekly CSP Execution"
    )
    scheduler.add_job(
        run_risk_monitor,
        trigger="cron", day_of_week="tue,wed,thu", hour=9, minute=0,
        id="daily_risk_monitor", name="Daily Risk Monitor"
    )
    scheduler.add_job(
        run_auto_update,
        trigger="cron", day_of_week="wed,thu,fri", hour=3, minute=0,
        id="auto_update", name="Auto-Update Check"
    )
    scheduler.add_job(
        _write_heartbeat,
        trigger="interval", seconds=60,
        id="heartbeat", name="Scheduler Heartbeat"
    )

    _write_heartbeat()
    log.info("\n" + "=" * 65)
    log.info("🗓️  YOU ROCK FUND SCHEDULER — Running")
    log.info(f"   Current time : {datetime.now(PST).strftime('%A %Y-%m-%d %H:%M %Z')}")
    log.info("   • Friday     4:15 PM PST  — assignment detection (skipped on Good Friday)")
    log.info("   • Saturday   6:00 PM PST  — screener preview")
    log.info(f"   • Mon/Tue*  {fmt(prev_h, prev_m):>11}  — Discord preview (if webhook set)")
    log.info(f"   • Mon/Tue*  {fmt(wheel_h, wheel_m):>11}  — wheel check (stop loss + CCs)")
    log.info(f"   • Mon/Tue*  {fmt(exec_h, exec_m):>11}  — CSP execution  ← configured")
    log.info("   • Tue–Thu    9:00 AM PST  — daily risk monitor (skipped on holidays)")
    log.info("   • Wed–Fri    3:00 AM PST  — auto-update check (if enabled in settings)")
    log.info("   * Shifts to Tuesday when Monday is a market holiday")
    log.info("   Press Ctrl+C to stop")
    log.info("=" * 65 + "\n")

    try:
        scheduler.start()
    except KeyboardInterrupt:
        log.info("\n⛔ Scheduler stopped")
        scheduler.shutdown()


if __name__ == "__main__":
    main()
