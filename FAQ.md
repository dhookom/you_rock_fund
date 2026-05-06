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

### Q: setup_docker.sh fails or containers won't start — I forgot to configure .env.compose

**A:** You need to copy the example file and fill in your IBKR account details before running setup:

```bash
cp .env.compose.example .env.compose
nano .env.compose
```

Fill in at minimum:

| Variable | What to enter |
|---|---|
| `ACCOUNT_PAPER` | Your IBKR paper account ID (e.g. `DU1234567`) |
| `TWS_USERID_PAPER` | Your IBKR paper username |
| `ACCOUNT_LIVE` | Your IBKR live account ID |
| `TWS_USERID_LIVE` | Your IBKR live username |
| `IBKR_USERNAME_LIVE` | Same as `TWS_USERID_LIVE` |
| `VNC_SERVER_PASSWORD` | A VNC password for IB Gateway 2FA access |

Save and exit: `Ctrl+O` → `Enter` → `Ctrl+X`

---

### Q: Discord test notification fails — "webhook not configured"

**A:** The Discord webhook URL lives in a secret file, not in `.env.compose`. Create it manually:

```bash
echo "https://discord.com/api/webhooks/xxx/yyy" > ~/you_rock_fund/docker/secrets/discord_webhook_url
```

Get your webhook URL from: **Discord → Edit Channel → Integrations → Webhooks**

Then restart the scheduler to pick it up:
```bash
cd ~/you_rock_fund
docker compose --env-file .env.compose restart scheduler
```

See `docker/secrets/README.md` for the full list of secret files.

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

**A:** The `render_secret` file is missing from `docker/secrets/`. Create it:

```bash
echo "your_render_secret_here" > ~/you_rock_fund/docker/secrets/render_secret
```

Contact the fund operator for the Render API secret value if you don't have it.

---

### Q: I get "couldn't find env file" when running docker compose commands

**A:** You're running the command from the wrong directory. Always run Docker commands from the repo root:

```bash
cd ~/you_rock_fund
docker compose --env-file .env.compose <command>
```

---

### Q: Where do I find all the secret files I need to create?

**A:** See [`docker/secrets/README.md`](docker/secrets/README.md) for the complete list of secret files, what each contains, and how to get the values.

---

*Have a question not covered here? Post in the You Rock Club Discord and we'll add it.*
