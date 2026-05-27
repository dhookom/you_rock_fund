# Windows PC Setup Guide — You Rock Club

This guide walks You Rock Club members through setting up a Windows Mini PC as a dedicated, always-on YRVI trading machine. Follow these steps in order from initial Windows setup through a verified reboot test.

---

## Recommended Hardware

| Component | Spec | Notes |
|-----------|------|-------|
| Computer | GEEKOM A5 Mini PC | AMD Ryzen 7 5825U · 16GB RAM · 512GB SSD |
| Network | Ethernet (recommended) | More reliable than WiFi |
| UPS | Battery backup ~$75 | Highly recommended — prevents power-outage reboots |

> 💡 The GEEKOM A5 ships with Windows 11 Pro pre-installed — no OS purchase needed. It handles YRVI with headroom to spare.

---

## One-Time Setup Hardware

You will need the following physical hardware to complete the initial setup. After setup is complete, you can manage the GEEKOM entirely via **Remote Desktop** from another Windows PC or Mac — none of this hardware is needed day-to-day.

| Item | Notes |
|------|-------|
| Monitor with HDMI input | The GEEKOM A5 has two HDMI ports. A cheap 1080p monitor works fine. |
| HDMI cable | Usually included with monitors, otherwise ~$10 |
| USB keyboard | Any USB keyboard |
| USB mouse | Any USB mouse |

> 💡 Once Remote Desktop is configured (Phase 2), you can disconnect all of this and control the GEEKOM remotely forever after — from any Windows PC via the built-in Remote Desktop app, or from a Mac using **Microsoft Remote Desktop** (free on the App Store).

---

## Phase 1 — Windows Initial Setup

When you first power on the GEEKOM, follow these decisions at each setup screen:

### Microsoft Account
- **Create a local account instead** — on the "Sign in with Microsoft" screen, click "Sign-in options" → "Domain join instead" (Windows 11 Pro)
- Choose a short username (e.g. `yrvi`) and a strong password
- This machine is a dedicated server and doesn't need OneDrive, Microsoft 365, or any cloud sync

### Privacy Settings
- **Turn everything off** — location, diagnostic data, inking, tailored experience, advertising ID
- None of this is needed for a trading server

### Time Zone
- Set to **Pacific Time (US & Canada)** — the YRVI scheduler uses Pacific time for its weekly job windows

### Automatic Updates
- Leave Windows Update **on** — Windows will manage updates in the background
- Avoid manually triggering large updates during market hours (Monday 9:55AM–10:30AM PST)

### BitLocker
- **Do NOT enable BitLocker drive encryption**
- BitLocker can require a PIN or recovery key after a reboot, which prevents YRVI from restarting unattended after a power outage
- IBKR credentials are stored as encrypted Docker secrets regardless of BitLocker

---

## Phase 2 — Windows System Settings

### Enable Remote Desktop
1. Start → Settings → System → Remote Desktop
2. Toggle **Remote Desktop** → On
3. Note the PC name shown (e.g. `GEEKOM-A5`) — you'll use this to connect from another machine
4. You can also connect by IP address: open Command Prompt and run `ipconfig` to find it

To connect from another Windows PC: Start → search "Remote Desktop Connection" → enter the IP or PC name.
To connect from a Mac: download **Microsoft Remote Desktop** (free, App Store) → add the PC by IP.

> 💡 Connect over your local network (Ethernet on both machines is most reliable) or via your router's VPN if accessing from outside your home.

### Enable Automatic Login
This ensures the GEEKOM logs itself in automatically after a power outage or reboot — no one needs to be present.

1. Press **Win + R**, type `netplwiz`, press Enter
2. In the User Accounts dialog, select your user account
3. **Uncheck** "Users must enter a user name and password to use this computer"
4. Click **Apply** — enter your password twice to confirm
5. Click **OK**

### Optional: Prevent Display Sleep
- Settings → System → Power → Screen and sleep
- Set all sleep timers to **Never** (the GEEKOM runs fine headless after initial setup)

---

## Phase 3 — Developer Tools

### 1. Git for Windows
Download and install from [git-scm.com/download/win](https://git-scm.com/download/win).

During install, accept all defaults **except**:
- "Adjusting your PATH environment": select **"Git from the command line and also from 3rd-party software"**

Git for Windows includes **Git Bash**, the terminal you'll use for all YRVI commands.

### 2. GitHub CLI (gh)
Download the installer from [cli.github.com](https://cli.github.com) and run it.

Open **Git Bash** (Start → search "Git Bash") and authenticate:
```bash
gh auth login
```
Choose: **GitHub.com → HTTPS → Yes → Login with a web browser**

### 3. Docker Desktop
Download from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) and run the installer.

On first launch:
- Accept the license agreement
- Select **Use recommended settings** → Finish
- Skip the Docker account sign-in (click Skip)

#### Configure Docker Desktop to Auto-Start
Docker Desktop → Settings (⚙️) → General:
- ✅ **Start Docker Desktop when you sign in to your computer**

Click **Apply & Restart**.

#### Verify Docker Works
Open Git Bash and run:
```bash
docker run hello-world
```
Should print "Hello from Docker!"

---

## Phase 4 — Clone YRVI and Run Setup

Use **Git Bash** for all commands (not PowerShell, not Command Prompt). Clone to your Windows home directory — **not** a WSL2 path.

### Clone the Repo
```bash
cd ~
git clone https://github.com/controllinghand/you_rock_fund.git
cd you_rock_fund
```

### Configure `.env.compose`
```bash
cp .env.compose.example .env.compose
```

Leave `TRADING_MODE=paper` and `YRVI_INIT_DRY_RUN=true` — these are the safe defaults for a new setup.

### Run Paper Trading Setup
```bash
bash setup_docker.sh --paper
```

The script runs the same 6-step flow as the Mac setup:

**Step 1 — Docker check**: verifies Docker is running.

**Step 2 — Configure secrets**: starts the secrets container and opens `http://localhost:8001` in your browser automatically. Enter at minimum:
- Your **IBKR paper trading username and password**
- Your **Render screener API secret** (provided in onboarding)

Setup waits at this step until you click Save in the browser.

**Step 3 — Validate config**: verifies `.env.compose` and required secrets.

**Step 4 — Start containers**: builds and starts all 5 containers (ib_gateway, api, scheduler, web, secrets).

**Step 5 — Auto-start on login**: creates a `.bat` file and registers a Task Scheduler job (`YRVI_Docker_AutoStart`) that runs `docker compose up -d` at every login — **no manual Task Scheduler setup needed**.

> ⚠️ If Step 5 fails with a permissions error, close Git Bash, reopen it **as Administrator** (right-click → "Run as administrator"), navigate back to the repo, and rerun `bash setup_docker.sh --paper`. The Task Scheduler registration requires elevated rights.

**Step 6 — Desktop app**: skipped on Windows (macOS only). Access the dashboard at `http://localhost:3000`.

### Watch IB Gateway Log In
```bash
docker compose --env-file .env.compose logs -f ib_gateway
```
Wait for **"Login has completed"** — takes 30–90 seconds. Press Ctrl+C when you see it.

### Open the Dashboard
```
http://localhost:3000
```
You should see all status indicators green: **Gateway • Scheduler • IBKR**

---

## Phase 5 — Switch to Live Trading

Once you've validated paper trading works for a full week:

```bash
bash setup_docker.sh --live
```

> ⚠️ Only one YRVI instance can connect to an IBKR account at a time. If you have YRVI running on another machine (Mac Mini, laptop), shut it down before starting live trading on the GEEKOM. The GEEKOM should be your permanent home for live trading going forward.

---

## Phase 6 — Reboot Test

Always test a full reboot before considering setup complete:

1. Start → Power → **Restart**
2. After the GEEKOM restarts, it should boot straight to the desktop — confirms automatic login works
3. Docker Desktop should open automatically
4. YRVI containers should start within 60 seconds (via the Task Scheduler job)
5. Open the dashboard at `http://localhost:3000` — all indicators should show green

If containers haven't started yet, check Docker Desktop is fully running (engine indicator green), then from Git Bash:
```bash
cd ~/you_rock_fund
docker compose --env-file .env.compose logs -f ib_gateway
```
Wait for "Login has completed".

---

## Ongoing Operations

### Container Status
```bash
docker compose --env-file .env.compose ps
```

### View Logs
```bash
docker compose --env-file .env.compose logs -f scheduler   # trades
docker compose --env-file .env.compose logs -f ib_gateway  # gateway login
docker compose --env-file .env.compose logs -f api         # dashboard API
```

### Start / Restart Containers
```bash
cd ~/you_rock_fund
docker compose --env-file .env.compose up -d
```

### Stop Everything
```bash
docker compose --env-file .env.compose down
```

### Re-run Setup (after reboot, if needed)
```bash
cd ~/you_rock_fund && bash setup_docker.sh --paper
```
Existing secrets are detected automatically — no re-entry needed.

### Rotating a Secret (e.g. changed IBKR password)
1. Open `http://localhost:8001` in your browser (or visit **Secrets** in the dashboard)
2. Click **Update** next to the secret you want to change
3. Enter the new value and click **Save**

To apply a new IBKR password, restart the gateway after saving:
```bash
docker compose --env-file .env.compose restart ib_gateway
```

### Upgrading YRVI
The dashboard Upgrade button is macOS-only. Upgrade manually from Git Bash:
```bash
cd ~/you_rock_fund
git pull
docker compose --env-file .env.compose up -d --build
```

---

## Troubleshooting

> ❓ For general setup issues and fixes, see [FAQ.md](./FAQ.md).

| Problem | Fix |
|---------|-----|
| "Existing session detected" in gateway log | Another machine is connected to the same IBKR account. Shut it down first. |
| Containers don't start after reboot | Open Docker Desktop and wait for "Engine running", then run `bash setup_docker.sh --paper` |
| Dashboard shows Gateway red | Run `docker compose --env-file .env.compose logs -f ib_gateway` and check for errors |
| Task Scheduler job not registered | Rerun `bash setup_docker.sh --paper` from Git Bash opened as Administrator |
| `docker` not found in Git Bash | Docker Desktop isn't running. Open it and wait for the engine indicator to go green. |
| IB Gateway needs 2FA or shows a login dialog | Connect via RealVNC Viewer (see below) |

### Connecting via VNC (2FA / login dialogs)

The IB Gateway runs headless inside Docker but exposes a VNC session on port 5900. Windows does not have a built-in VNC viewer — use **RealVNC Viewer** (free):

1. Download from [realvnc.com/en/connect/download/viewer](https://www.realvnc.com/en/connect/download/viewer/)
2. Open RealVNC Viewer and connect to: `127.0.0.1:5900`
3. Password: `ibgateway123!test` (default — change it via `http://localhost:8001` if desired)

You'll see the IB Gateway GUI and can dismiss any dialog that's blocking login.

---

## Total Setup Cost

| Item | Cost |
|------|------|
| GEEKOM A5 Mini PC (Ryzen 7 5825U, 16GB/512GB) | ~$459 |
| UPS battery backup | ~$75 |
| Ethernet cable | ~$10 |
| **Total** | **~$544 one time** |

vs $3,500+/week potential income = **ROI in first week** 💰

---

*You Rock Club — YRVI Windows Setup Guide*
