import json
import os
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

DATA_DIR = Path("/data")
KEY_PATH = DATA_DIR / "secrets.key"
STORE_PATH = DATA_DIR / "secrets.enc"
HTML_PATH = Path(__file__).parent / "setup.html"

REQUIRED_SECRETS = [
    "tws_password_paper",
    "tws_password_live",
    "render_secret",
]
OPTIONAL_SECRETS = [
    "discord_webhook_url",
    "discord_webhook_weekly_plan",
]
ALL_SECRETS = REQUIRED_SECRETS + OPTIONAL_SECRETS

NONCE_LEN = 12


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_or_create_key() -> bytes:
    _ensure_data_dir()
    if KEY_PATH.exists():
        return KEY_PATH.read_bytes()
    key = AESGCM.generate_key(bit_length=256)
    KEY_PATH.write_bytes(key)
    os.chmod(KEY_PATH, 0o600)
    return key


def _load_secrets(key: bytes) -> dict[str, str]:
    if not STORE_PATH.exists():
        return {}
    blob = STORE_PATH.read_bytes()
    if len(blob) < NONCE_LEN + 1:
        return {}
    nonce, ciphertext = blob[:NONCE_LEN], blob[NONCE_LEN:]
    aes = AESGCM(key)
    plaintext = aes.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode("utf-8"))


def _save_secrets(key: bytes, secrets: dict[str, str]) -> None:
    _ensure_data_dir()
    aes = AESGCM(key)
    nonce = os.urandom(NONCE_LEN)
    ciphertext = aes.encrypt(nonce, json.dumps(secrets).encode("utf-8"), None)
    tmp = STORE_PATH.with_suffix(".enc.tmp")
    tmp.write_bytes(nonce + ciphertext)
    os.chmod(tmp, 0o600)
    tmp.replace(STORE_PATH)


KEY = _load_or_create_key()

app = FastAPI(title="YRVI Secrets Service")


class SecretBody(BaseModel):
    value: str


def _is_complete(secrets: dict[str, str]) -> bool:
    return all(secrets.get(name) for name in REQUIRED_SECRETS)


@app.get("/health")
def health() -> dict:
    secrets = _load_secrets(KEY)
    return {"status": "ok", "complete": _is_complete(secrets)}


@app.get("/secrets/status")
def status() -> dict:
    secrets = _load_secrets(KEY)
    detail = {}
    for name in ALL_SECRETS:
        if secrets.get(name):
            detail[name] = "set"
        else:
            detail[name] = "missing"
    return {"complete": _is_complete(secrets), "secrets": detail}


@app.get("/secret/{name}")
def get_secret(name: str) -> dict:
    if name not in ALL_SECRETS:
        raise HTTPException(status_code=404, detail="unknown secret")
    secrets = _load_secrets(KEY)
    if name not in secrets:
        raise HTTPException(status_code=404, detail="not set")
    return {"value": secrets[name]}


@app.post("/secret/{name}")
def set_secret(name: str, body: SecretBody) -> dict:
    if name not in ALL_SECRETS:
        raise HTTPException(status_code=404, detail="unknown secret")
    secrets = _load_secrets(KEY)
    secrets[name] = body.value
    _save_secrets(KEY, secrets)
    return {"status": "saved", "complete": _is_complete(secrets)}


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    if not HTML_PATH.exists():
        return HTMLResponse("<h1>setup.html missing</h1>", status_code=500)
    return HTMLResponse(HTML_PATH.read_text(encoding="utf-8"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
