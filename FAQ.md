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
4. Allow a few minutes for the changes to take effect, then re-run the test

> **Important:** You cannot fix this through the IBKR mobile app or TWS — IBKR explicitly disables Market Data management for paper accounts in those interfaces ("When logging in through TWS or Mobile Apps, all Market Data and Trading functionality is disabled"). The web Client Portal on your live account is the only path.

> **Note:** If the Client Portal warns about an existing session (IB Gateway is running), use a different browser or browser profile to avoid disconnecting your Gateway session.

---

### Q: Orders never fill — stuck on "failed" or "order unfilled" even when market data works

**A:** IB Gateway is blocking API orders behind a confirmation dialog that no one is clicking. When **Bypass Order Precautions for API Orders** is not enabled, IBKR pops up a warning dialog before submitting each order. Since the system runs headlessly, nothing dismisses it and the order times out.

**The fix:**

In IB Gateway → **Configure → API → Precautions** → check **✅ Bypass Order Precautions for API Orders** → click **Apply** → **OK**

This must be set on each machine running YRVI. Without it, the scheduler will connect, get market data, size positions, submit orders — and then silently fail every fill.

---

*Have a question not covered here? Post in the You Rock Club Discord and we'll add it.*
