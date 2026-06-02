# YRVI Setup FAQ

Common issues and fixes for You Rock Club members setting up YRVI on a Mac Mini.

---

### Q: Docker fails with "address already in use" on port 5900

**A:** macOS Screen Sharing uses port 5900, which conflicts with IB Gateway's VNC port.

Turn it off before starting YRVI:

**System Settings → General → Sharing → Screen Sharing → toggle OFF**

Then restart the stack:
```bash
docker compose --env-file .env.compose down
./setup_docker.sh --paper
```

> Use SSH for remote terminal access instead — Screen Sharing cannot run alongside YRVI.
>
> Enable SSH: **System Settings → General → Sharing → Remote Login → On**
>
> Then connect with: `ssh [your-user]@[MAC_MINI_IP]`

---

### Q: I need to check the IB Gateway screen (e.g. it's stuck on a 2FA or confirmation dialog)

**A:** The IB Gateway runs headless inside Docker but exposes a VNC session on port 5900. macOS's built-in Screen Sharing won't work for this — it refuses to connect to localhost. Use **RealVNC Viewer** (free) instead:

1. Download: https://www.realvnc.com/en/connect/download/viewer/
2. Open RealVNC Viewer and connect to: `127.0.0.1:5900`
3. Password: `ibgateway123!test` (unless you set a custom VNC Password in secrets)

You'll see the IB Gateway GUI and can dismiss whatever dialog is blocking it.

---

### Q: setup_docker.sh fails or containers won't start — I forgot to configure secrets

**A:** Since v1.4.0, account credentials are entered via the secrets container UI, not `.env.compose`. Re-run `setup_docker.sh --paper` — it will open `http://localhost:8001` in your browser. Enter at minimum:

| Field | What to enter |
|---|---|
| IBKR Paper Account ID | Your IBKR paper account ID (e.g. `DU1234567`) |
| IBKR Paper Username | Your IBKR paper username |
| IBKR Paper Trading Password | Your IBKR paper password |
| IBKR Live Trading Password | Your IBKR live password |
| Render Screener API Secret | Provided in onboarding |

Optional fields (only needed if you flip the stack to live mode or want a custom VNC password):

| Field | What to enter |
|---|---|
| IBKR Live Account ID | Your IBKR live account ID |
| IBKR Live Username | Your IBKR live username |
| VNC Password | Defaults to `ibgateway123!test` if unset |

If your browser doesn't open, paste `http://localhost:8001` into it directly. If the browser flow times out, the script falls back to terminal prompts.

---

### Q: Discord test notification fails — "webhook not configured"

**A:** The Discord webhook URL is configured through the secrets container UI — it is not set in `.env.compose` or as a file.

1. Open `http://localhost:8001` in your browser
2. Find **Discord Webhook URL** and click **Set**
3. Paste your webhook URL (get it from: **Discord → Edit Channel → Integrations → Webhooks**)
4. Restart the scheduler to pick it up:

```bash
cd ~/you_rock_fund
docker compose --env-file .env.compose restart scheduler
```

---

### Q: Docker doesn't start automatically after a reboot

**A:** Docker Desktop needs to be configured to launch at login:

**Docker Desktop → Settings (⚙️) → General → ✅ Start Docker Desktop when you log in**

Then reboot and confirm YRVI comes back up on its own.

---

### Q: The Mac Mini asks for a password on every reboot instead of auto-logging in

**A:** Automatic Login requires FileVault to be **off**. Check your status:

```bash
fdesetup status
```

If FileVault is on, turn it off:

**System Settings → Privacy & Security → FileVault → Turn Off**

This takes 30–60 minutes to decrypt. After it finishes, enable auto-login:

**System Settings → Users & Groups → Automatically log in as → [your user]**

> Note: Keeping your Apple ID is fine — FileVault is a separate toggle and can be disabled without removing your Apple ID.

---

### Q: Scheduler fails to restart with "no such file or directory: render_secret"

**A:** The Render API secret is missing from the secrets container. Open `http://localhost:8001`, find **Render Screener API Secret**, and click **Set**. Contact the fund operator for the value if you don't have it.

If the secrets container itself is not running, restart the stack first:
```bash
cd ~/you_rock_fund
docker compose --env-file .env.compose up -d
```

---

### Q: I get "couldn't find env file" when running docker compose commands

**A:** You're running the command from the wrong directory. Always run Docker commands from the repo root:

```bash
cd ~/you_rock_fund
docker compose --env-file .env.compose <command>
```

---

### Q: Where do I configure my credentials?

**A:** All credentials are managed through the secrets container web UI at `http://localhost:8001`. Run `setup_docker.sh --paper` and it will open automatically. The required fields are: IBKR Paper Account ID, IBKR Paper Username, IBKR Paper Trading Password, and Render Screener API Secret.

---

### Q: All trades show "Failed Market Data" / "market likely closed" even though the market is open

**A:** The IB Gateway connection is working but your paper account doesn't have options market data subscriptions enabled. The IBKR paper account inherits market data subscriptions from your live account — if options data isn't subscribed on the live account, the paper account won't see it either.

**How to confirm:** Run a manual test with `docker exec yrvi-scheduler-1 python trader.py`. If the log shows `Market data type: DELAYED (type 3)` and every ticker returns `⏰ No market data — market likely closed` during market hours, this is your issue.

**The fix — complete market data setup on your live account:**

1. Open a browser and log into the IBKR **Client Portal** on your **live account** (not paper)
2. Click the **person icon (top right) → Settings → Trading Platform → Market Data Subscriptions**
3. On that page, complete all three items by clicking the ⚙️ gear icon on each:
   - **Market Data API Acknowledgement** — sign the Terms and Conditions (required to enable API market data)
   - **Market Data Subscriber Status** — set yourself as **Non-Professional** (personal account, not redistributing data commercially — keeps fees at $0)
   - **Non-Commercial Form** — confirm personal/non-commercial use
4. Allow overnight for the acknowledgement to fully propagate — changes made today will be active by the next morning
5. Re-run the test the **following morning between 10–10:30 AM ET** — the market needs to have been open at least 15–30 minutes for delayed quotes to be populated

> **You do not need a separate OPRA subscription.** IBKR's free delayed market data (type 3) is sufficient for YRVI to execute. The API Acknowledgement is the key unlock — once signed and propagated, delayed options bid/ask will flow through automatically.

> **Important:** You cannot fix this through the IBKR mobile app or TWS — IBKR explicitly disables Market Data management for paper accounts in those interfaces ("When logging in through TWS or Mobile Apps, all Market Data and Trading functionality is disabled"). The web Client Portal on your live account is the only path.

> **Note:** If the Client Portal warns about an existing session (IB Gateway is running), use a different browser or browser profile to avoid disconnecting your Gateway session.

---

### Q: All trades show error 10197 "No market data during competing live session"

**A:** Your live IB Gateway (or TWS) is open somewhere — on another machine, the IBKR desktop app, or a second terminal. When a live account session is active, IBKR gives it market data priority and blocks the paper account's quotes entirely. Every ticker returns 10197 and 0 fills result.

**How to confirm:** Run System Diagnostics from the Help page. If SPY Price shows "No price data" and Options Data shows "no bid/ask", this is the cause — not a subscription issue.

**The fix:**

1. Close the live IB Gateway or TWS app on every device
2. Restart the paper IB Gateway from the Help page (or wait ~30 seconds for it to detect the session is clear)
3. Re-run the pipeline using the **Run Now** button on the This Week page

> **Note:** You can't run paper and live gateways simultaneously on the same IBKR account — the live session always wins. If you need both running at the same time, you would need separate IBKR accounts.

---

### Q: Orders never fill — stuck on "failed" or "order unfilled" even when market data works

**A:** IB Gateway is blocking API orders behind a confirmation dialog that no one is clicking. When **Bypass Order Precautions for API Orders** is not enabled, IBKR pops up a warning dialog before submitting each order. Since the system runs headlessly, nothing dismisses it and the order times out.

**The fix:**

- **Docker setup (v1.7.0+):** Handled automatically via `ibc_config.ini` — no action needed.
- **Legacy/manual setup:** In IB Gateway → **Configure → API → Precautions** → check **✅ Bypass Order Precautions for API Orders** → click **Apply** → **OK**

Without this, the scheduler will connect, get market data, size positions, submit orders — and then silently fail every fill.

---

---

### Q: How do I export a Flex XML from IBKR to use with the History Reconciler?

**A:** Use the IBKR Client Portal to run a Flex Query and download the XML. This covers trades placed manually or outside YRVI that need to be added to your premium history.

1. Log into the **IBKR Client Portal** at [https://www.interactivebrokers.com/sso/Login](https://www.interactivebrokers.com/sso/Login) using your **live account** credentials
2. Navigate to **Performance & Reports → Flex Queries**
3. Click **Activity Flex Query** → then the **+** button to create a new query (or edit an existing one)
4. Configure the query:
   - **Query Name:** Give it a name like `YRVI Reconciler`
   - **Sections:** Click **Trades** — then click **Select All** to include all fields, make sure the **Executions** sub-type is checked, then click **Save**
   - **Period:** Choose *Last 365 Calendar Days* (or a custom date range), then click **Continue**
   - **Format:** XML
   - **Date Format:** `yyyyMMdd`
5. Click **Create** to save the query
6. Click **Run** (▶ button next to your query)
6. When the download dialog appears, save the `.xml` file

Then in YRVI:
- Go to **Settings → History Reconciler**
- Select **Paste / Upload XML**
- Click the file picker (or paste the XML content directly)
- Click **Preview** to review the weeks found, then **Commit** to save

> **Note:** Only option *sells* are counted (CSPs and covered calls). Stock share sales are not included in the premium total.

---

### Q: How do I set up automatic reconciliation via the IBKR Flex Web Service?

**A:** This lets YRVI fetch your trade history directly from IBKR on demand — no manual export needed. It requires a one-time setup of a Flex Token and Query ID in your Secrets page.

**Step 1 — Create the Flex Query and get the Query ID**

Follow steps 1–4 from the previous FAQ entry to create an Activity Flex Query with the **Executions** sub-type, XML format. To find your **Query ID**, click the **ℹ️ icon** to the left of your query name on the Flex Queries page — it shows the Query ID in the details popup (e.g. `1529200`).

**Step 2 — Get your Flex Web Service Token**

1. In the IBKR Client Portal, go to **Performance & Reports → Flex Queries**
2. Click **Select Account(s)** at the top and make sure **all your accounts are selected** — the Flex Web Service Configuration panel only appears when multiple accounts are selected
3. Scroll down — you should now see a **Flex Web Service Configuration** panel in the bottom right
4. Click the **gear icon (⚙)** on that panel
5. Make sure **Flex Web Service Status** is checked (enabled)
3. Copy the **Current Token** shown on the page — it's a long alphanumeric string
4. If no token exists yet, click **Generate Token** to create one

**Step 3 — Enter the secrets in YRVI**

1. Go to **Settings → Secrets** (or the Secrets page in the sidebar)
2. Find **IBKR Flex Token** and click **Set** — paste your token
3. Find **IBKR Flex Query ID** and click **Set** — paste the numeric query ID

**Step 4 — Use the Reconciler**

1. Go to **Settings → History Reconciler**
2. Select **Fetch from IBKR**
3. Optionally set a date range, then click **Preview**
4. Review the weeks found and click **Commit**

> **Token security:** Treat your Flex Token like a password — it grants read-only access to your account history. It is stored encrypted in the YRVI secrets container.

---

*Have a question not covered here? Post in the You Rock Club Discord and we'll add it.*
