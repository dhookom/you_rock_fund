## [1.22.0] — 2026-05-24
### Added
- **IB Gateway settings UI** — new Settings section with a daily auto-restart time picker (7 PM – 2 AM), a restart window slider (10–60 min), and an "Apply to Gateway" button that patches IBC `config.ini` in the running container via `docker exec`
- `POST /api/gateway/patch-restart-time` — patches `AutoRestartTime` in IBC `config.ini` inside the running gateway container
- `auto_restart_time` and `auto_restart_suppress_mins` added to `settings.json` schema and `SettingsUpdate` model; settings take effect on the next watchdog poll with no container restart
- `AUTO_RESTART_TIME` and `AUTO_RESTART_SUPPRESS_SECS` added to `x-python-env` anchor in `docker-compose.yml` so the api container inherits them alongside the gateway

### Fixed
- **Watchdog alert messages are now context-aware** — failures within the configured restart window say "likely the daily restart — a ✅ recovery message will follow" instead of "manual restart required"; failures outside the window keep the original urgent wording
- Removed "2FA or confirmation dialog" assumption from IBKR connection-failure alerts — paper accounts have no 2FA; message now says "slow to reconnect or stuck on a login dialog"
- **Recovery messages now paired with alerts** — `✅ restored` only fires if a prior `🚨` alert was sent for that episode; eliminates phantom recovery messages when the restart window suppresses the outgoing alert

## [1.18.0] — 2026-05-20
### Fixed
- Upgrade reconnect polling timeout increased from 15s to 120s — Docker image builds take 1-2 minutes before containers restart; 15s was triggering a false "Upgrade problem" error while the build was still running
- Upgrade modal phase labels updated to set clearer expectations ("Building & restarting — this takes 1–2 minutes…")

## [1.17.0] — 2026-05-20
### Fixed
- Version badge click now shows feedback in all cases: "✓ Up to date" (green) when current, "Unable to reach GitHub" (gray) if the check fails — previously silent on both

## [1.16.0] — 2026-05-20
### Added
- Clicking the version badge when already up to date briefly flashes "✓ Up to date" in green for 2 seconds — confirms the check ran

## [1.15.0] — 2026-05-20
### Added
- Version badge in status bar is now clickable — click to immediately check for updates; shows a spinner while checking and reveals the Upgrade button if a new version is found

## [1.14.0] — 2026-05-20
### Fixed
- Feedback sender lookup now uses correct secret key `tws_userid_paper` (was `tws_userid`); falls back to `tws_userid_live` then `account_paper` — eliminates "root" showing up from Docker home directory

## [1.13.0] — 2026-05-20
### Changed
- Feedback Discord post now identifies the sender: IBKR username (`tws_userid`) → live username (`tws_userid_live`) → home directory name → "Unknown"

## [1.12.0] — 2026-05-20
### Changed
- Feedback webhook ships with a hardcoded default (`#yrvi-app-feedback`) — works out of the box with no manual secret setup; overridable via `discord_feedback_webhook_url` secret

## [1.11.0] — 2026-05-20
### Added
- Help page feedback form — Bug Report / Feature Request selector + textarea posts directly to `#yrvi-app-feedback` Discord channel via `/api/feedback`; no Discord account needed, never leaves the dashboard
- `/api/feedback` endpoint reads `discord_feedback_webhook_url` secret and posts formatted message with version, mode, and timestamp
- `FeedbackRequest` Pydantic model

## [1.10.0] — 2026-05-20
### Added
- Help page (sidebar, pinned below a divider) with three sections: System Diagnostics, FAQ & Troubleshooting, Report a Bug / Feature Request
- `/api/diag` endpoint — fast read-only health check (scheduler heartbeat age, IB Gateway TCP reachability, last CSP run, last wheel check, market status today, version); no IBKR API calls
- `_next_execution()` in `api.py` now accounts for market holidays — status bar shows Tuesday when Monday is a holiday

## [1.9.0] — 2026-05-20
### Added
- `market_calendar.py` — NYSE holiday calendar computed dynamically from rules (no external dependencies); covers all 10 federal/NYSE holidays including Saturday/Sunday observation shifts
- Scheduler now skips all Monday trading jobs (wheel check, CSP pipeline, Discord preview) on market holidays and automatically shifts execution to Tuesday — handles Memorial Day, Labor Day, MLK Day, Presidents' Day, etc.
- Friday assignment detection skips on Good Friday; daily risk monitor skips on any market holiday (e.g. Thanksgiving Thursday)
- Startup log updated to reflect Mon/Tue firing window with holiday-shift note

## [1.6.0] — 2026-05-17
### Added
- Wheel holdings with active stock positions now appear as covered call (CC) entries in the weekly plan — screener switches from CSP to CC for held tickers, using `call_20d_strike` / `call_20d_premium` from the Render API
- Render API (`/api/targets/csp`) now returns `call_20d_strike`, `call_20d_premium`, `call_20d_premium_pct`, `call_20d_delta`, `call_20d_iv` for every ticker (data was in `iv_summary` but not selected)
- `get_top_targets()` accepts `always_include` set — held tickers are guaranteed in the screener results even if they score below the top-N cutoff
- This Week page shows INTC-style CC rows with $0 capital, contracts fixed by shares held, and CC strike/premium
### Fixed
- Weekly plan position sizer now sizes the top (remainder) position first, iterating past ineligible tickers like SNDK (too expensive per contract), so the best viable target (e.g. BE) gets the max allocation instead of a normal-sized slot
- CC positions no longer consume CSP slot count — `num_positions` for CSP sizing is no longer reduced by active wheel holding count; budget deduction already handles the capital constraint
- `discord_poster.py` webhook URLs now read via `secrets_client.get_secret()` instead of `/run/secrets/` file mounts, which no longer exist after the compose cleanup in v1.5.0
- `docker-compose.yml` file-based Docker secret declarations removed — all secrets served by the `yrvi-secrets` HTTP service; eliminates bind-mount errors on hosts without local secret files
- `held_map` definition moved before `get_top_targets()` call in `api.py` (was referenced before assignment, causing `NameError` on This Week screener runs)
- Stale `targets` variable reference in `api.py` screener return renamed to `all_targets`

## [1.5.0] — 2026-05-15
### Added
- feat: enrich IBKR Holdings table with execution metadata (delta, buffer %, premium/contract, total premium)
- feat: capture trade_log.json at fill time for CSPs and CCs
- feat: backfill current positions from state.json where recoverable
- feat: /api/positions enriched with trade_log join

## [1.4.5] — 2026-05-11
### Added
- Shutdown button on Settings page with confirmation dialog
- `POST /api/shutdown` stops all YRVI containers (scheduler, web, ib_gateway, secrets, api last)
### Fixed
- Restart Scheduler now works in Docker mode (docker.sock mount)
- `POST /api/restart-scheduler` no longer returns HTTP 501 — runs `docker restart yrvi-scheduler-1`
### Changed
- `Dockerfile.api` installs static Docker CLI from download.docker.com (arch-aware, ~70MB)
- `docker-compose.yml` api service mounts `/var/run/docker.sock:ro` (note: read-only flag doesn't restrict Docker API commands)

## [1.4.4] — 2026-05-11
### Added
- Timezone dropdown on Settings page (6 US timezones)
- POST /api/settings/timezone validates the IANA name and persists to settings.json
- Scheduler reads timezone from settings.json at startup (falls back to TIME_ZONE env, then America/Los_Angeles)
- Closes #3

## [1.4.3] — 2026-05-11
### Changed
- tws_password_live moved to optional — paper-only members no longer blocked at setup

## [1.4.2] — 2026-05-11
### Fixed
- Secrets page now dynamically renders all secrets from API (was hardcoded to 5, now shows all 10)
- New Account Info section showing IBKR account ID and username fields

## [1.4.1] — 2026-05-11
### Fixed
- IB Gateway: stop retrying login on failure to prevent IBKR account lockout (`LoginFailed=terminate` patched into IBC config at startup, searches common paths and logs which one was patched)
- IB Gateway: credential preflight check before IBC starts — exits cleanly with a Discord alert if `tws_userid_*` or `tws_password_*` is missing from the secrets container
- IB Gateway: lockout dialog detection — case-insensitive match on "locked out", "excessive number of failed login attempts", "PASSWORD NOTICE", "Login failed"; sends Discord alert and halts container on any match
- IB Gateway entrypoint wraps the gateway in a monitored runner (instead of `exec`) so log lines can be observed; the gateway's own exit code is still propagated
- Note: docker-compose.yml `restart: "no"` (set in v1.3.x) retained — most defensive against lockout

## [1.4.0] — 2026-05-11
### Added
- Account credentials managed via secrets container UI at `http://localhost:8001` — IBKR account ID, IBKR username, and VNC password no longer require `.env.compose` edits
- New secret keys: `account_paper`, `tws_userid_paper` (required); `account_live`, `tws_userid_live`, `vnc_server_password` (optional)
- `setup.html`: new "Account Info" section above the existing passwords section, with helpful labels and hint text for each field
- `setup_docker.sh` CLI fallback now prompts for the 5 new secrets when the browser flow times out
- IB Gateway `entrypoint.sh` fetches `TWS_USERID`, `TWS_PASSWORD`, and `VNC_SERVER_PASSWORD` from the secrets container at startup; VNC falls back to `ibgateway123!test` when unset
### Changed
- `config.py`: `ACCOUNT` is now resolved via `secrets_client.get_secret` keyed by `TRADING_MODE` (paper vs live), with `ACCOUNT` env var as a fallback
- `api.py` `_live_ready()` checks live credentials via secrets container instead of env vars
- `docker-compose.yml`: removed the `:?` hard-fail injections for `ACCOUNT_PAPER` / `TWS_USERID_PAPER` and the `ACCOUNT_LIVE` / `IBKR_USERNAME_LIVE` env passthroughs for api/scheduler
- `docker/preflight.sh`: validates required secrets via the secrets-container `/secrets/status` endpoint and cross-checks that `account_paper` ≠ `tws_userid_paper`
### Removed
- `.env.compose` no longer carries `ACCOUNT_PAPER`, `TWS_USERID_PAPER`, `ACCOUNT_LIVE`, `TWS_USERID_LIVE`, `VNC_SERVER_PASSWORD`, `IBKR_USERNAME_LIVE`, `IBKR_PASSWORD_LIVE_FILE`
- Closes #1

## [1.3.1] — 2026-05-06
### Fixed
- README fully updated for v1.3.0 secrets container architecture
- Removed all stale macOS Keychain references from setup, security, and script-flow sections (11 references updated)
- docker/preflight.sh orphan secrets_dir variable removed

## [1.3.0] — 2026-05-06
### Added
- secrets container: AES-256-GCM encrypted secrets store (docker/secrets_service/)
- secrets_client.py: 3-tier secret resolution (secrets container → /run/secrets/ file → env var)
- SecretsPage in dashboard: manage all credentials via UI with status indicators and inline editing
- setup_docker.sh: browser-first secrets entry with CLI fallback, removes macOS Keychain dependency
- yrvi-restart.sh: verifies secrets container instead of re-injecting from Keychain
### Changed
- docker-compose.yml: added secrets service, updated depends_on for api/scheduler/ib_gateway
- api.py: /api/secrets/* proxy endpoints, secrets read via secrets_client
- scheduler.py: discord webhook read via secrets_client
### Removed
- macOS Keychain dependency — stack now works on Mac, Windows, and Linux
- --keep-secrets flag from setup_docker.sh and yrvi-restart.sh
- Plaintext secret file injection on restart

## [1.2.6] - May 2026
### Added
- Discord weekly results: footnotes explaining skip reasons appear at the bottom of the trades field when applicable — "Spread too wide" (liquidity check) and "Contract too large" ($70K max per position) only included if that skip occurred that week
- `trader.py` now records `skipped_contract_size` in execution results when a fallback candidate's single contract would exceed the $70,000 max position size
### Fixed
- "Failed Market Data" badge on This Week page — verified already resolved; `ThisWeek.jsx` was rewritten to a table/screener view and no longer makes live IBKR market data requests

## [1.2.5] - May 2026
### Added
- Performance page: "Total Realized" stat card showing combined option premium + forced-sale P&L
- Performance table: separate "Premium" and "Sales P&L" columns; footer shows net effect of forced sales
- Bar chart tooltip shows sales P&L alongside premium when a forced liquidation occurred that week
### Changed
- `ytd_tracker.json` now stores `premium_collected`, `shares_sold_pnl`, and `total_realized` per week (backwards-compatible: old entries with `realized` are normalized on read)
- YTD `total_premium`, weekly `yield_pct`, and annual goal progress track option premium only — forced liquidations no longer inflate these numbers
- Sidebar version label removed — status bar version pill is the single source of truth
### Fixed
- `yrvi-build.sh`: re-queries container ID after `docker compose up --build` so health polling in Step 4 inspects the live container instead of the pre-rebuild (stale) ID

## [1.2.1] - May 2026
### Added
- Discord `🚨🚨🚨 EMERGENCY SHARE SALE` alert fires immediately on every wheel share sale (dropped screener, earnings this week, no viable CC), with ticker, shares, fill price, proceeds, reason, and realized P&L
- `_find_cc_strike()` fetches live IBKR market price before building the strike candidate list; scan floor = max(assigned_strike, current_price × 0.95) to avoid scanning deep-ITM calls when a stock has run up
- `detect_assignments()` falls back to IBKR `avgCost` when `assigned_strike` is missing from state, eliminating 0.00 placeholders
- Same avgCost fallback applied in `run_wheel_check()` Step 0 for untracked stocks detected at Monday open

## [1.2.0] - May 2026
### Added
- scripts/yrvi-restart.sh: re-injects Keychain secrets before docker restart, fixing individual container restarts
- Watchdog auto-restarts ib_gateway after 30 min down outside market hours (never during 9:30–4:00 PM ET)
- auto_restart_gateway setting with dashboard toggle (default true)
### Changed
- Watchdog alerts distinguish auto-restart attempted vs manual intervention required
### Notes
- Drops beta label — first full stable release with live trading resilience features

## [0.1.0-beta] - April 2026
### Added
- Complete wheel strategy automation
- IBC auto-login
- React dashboard with dark/light mode
- Discord integration
- Live IBKR portfolio view
- Settings management
- Paper/Live trading toggle

## [1.1.0-beta] - April 2026
### Added
- macOS Keychain secrets management (replaces manual docker/secrets/ file creation)
- setup_docker.sh --paper / --live mode flags (required, replaces bare invocation)
- Password double-entry confirmation with character count on first run
- Ephemeral secret files — written at launch, deleted after containers start
- Secret rotation via Keychain Access.app (delete entry, re-run script)
- README: Hardware Requirements table, Security section, You Rock Club onboarding note
### Changed
- Steps 5 & 6 idempotent — login item and Desktop app skip if already installed
- Hardware tier policy: Mac Mini required for live trading, Windows scoped to paper only
- Versioning policy documented in README Version History

## [1.0.0-beta] - April 2026
### Added
- Docker containerization (replaces launchd)
- Cross-platform: Mac Intel/ARM + Windows
- Secrets management via macOS Keychain (ephemeral docker/secrets/ files)
- Auto-start via Docker login plist
- nginx serving React dashboard
- Socket-based health checks
- Scheduler heartbeat monitoring
### Changed
- setup_docker.sh replaces setup_ibc.sh
- startup.sh now checks Docker containers
