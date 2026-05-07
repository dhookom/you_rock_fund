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
