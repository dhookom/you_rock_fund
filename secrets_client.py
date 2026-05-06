"""Shared secret reader.

Resolution order:
  1. http://secrets:8001/secret/{name}   (only when YRVI_CONTAINERIZED=1)
  2. /run/secrets/{name} file            (yrvi-restart.sh compatibility)
  3. os.environ[env_fallback]
"""
import json
import os
from typing import Optional
from urllib import request

SECRETS_BASE_URL = "http://secrets:8001"
HTTP_TIMEOUT_SECONDS = 2


def get_secret(name: str, env_fallback: Optional[str] = None) -> str:
    if os.environ.get("YRVI_CONTAINERIZED") == "1":
        try:
            url = f"{SECRETS_BASE_URL}/secret/{name}"
            with request.urlopen(url, timeout=HTTP_TIMEOUT_SECONDS) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
                value = payload.get("value", "")
                if value:
                    return value
        except Exception:
            pass

    try:
        with open(f"/run/secrets/{name}") as f:
            value = f.read().strip()
            if value:
                return value
    except Exception:
        pass

    if env_fallback:
        return os.environ.get(env_fallback, "")
    return ""
