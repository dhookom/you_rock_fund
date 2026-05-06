# YRVI Docker Secrets

These files hold sensitive credentials mounted into containers at `/run/secrets/`.
Never commit these files — they are in `.gitignore`.

Copy each example and fill in your value:

| File | What it contains | How to get it |
|---|---|---|
| `tws_password_paper` | IBKR paper trading password | Your IBKR login password |
| `tws_password_live` | IBKR live trading password | Your IBKR login password |
| `render_secret` | Render API secret | Contact fund operator |
| `anthropic_api_key` | Anthropic API key | Contact fund operator |
| `discord_webhook_url` | Discord alerts webhook URL | Discord → Edit Channel → Integrations → Webhooks |
| `discord_webhook_weekly_plan` | Discord weekly plan webhook URL | Discord → Edit Channel → Integrations → Webhooks |
| `ibkr_password_live` | Live password (legacy launchd flow) | Your IBKR login password |

## Creating secret files

```bash
echo "your_value_here" > docker/secrets/tws_password_paper
echo "your_value_here" > docker/secrets/tws_password_live
echo "your_value_here" > docker/secrets/render_secret
echo "your_value_here" > docker/secrets/anthropic_api_key
echo "https://discord.com/api/webhooks/xxx/yyy" > docker/secrets/discord_webhook_url
echo "https://discord.com/api/webhooks/xxx/yyy" > docker/secrets/discord_webhook_weekly_plan
```

Optional files (leave empty if not used):
```bash
touch docker/secrets/discord_webhook_url
touch docker/secrets/discord_webhook_weekly_plan
touch docker/secrets/anthropic_api_key
```

## Notes
- `setup_docker.sh` creates `tws_password_paper`, `tws_password_live`, and `render_secret` automatically from macOS Keychain on first run.
- Discord and Anthropic secrets must be created manually.
- Secret files are never committed to git.
