#!/usr/bin/env python3
"""Docker healthcheck for the scheduler container heartbeat.

Exits 0 if scheduler_heartbeat.json was written within the last N seconds.
Default path is /data (persists via yrvi_data volume after entrypoint symlinks).
"""
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

PST = ZoneInfo("America/Los_Angeles")
HEARTBEAT_FILE = Path(
    os.environ.get("YRVI_SCHEDULER_HEARTBEAT", "/data/scheduler_heartbeat.json")
)
MAX_AGE_SECS = int(os.environ.get("YRVI_SCHEDULER_HEALTH_MAX_AGE_SECS", "180"))


def main() -> int:
    try:
        data = json.loads(HEARTBEAT_FILE.read_text())
        ts = datetime.fromisoformat(data["timestamp"])
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=PST)
        age = (datetime.now(PST) - ts).total_seconds()
    except Exception as exc:
        print(f"scheduler heartbeat unreadable: {exc}")
        return 1

    if age > MAX_AGE_SECS:
        print(f"scheduler heartbeat stale: {age:.0f}s > {MAX_AGE_SECS}s")
        return 1

    print(f"scheduler heartbeat ok: {age:.0f}s old")
    return 0


if __name__ == "__main__":
    sys.exit(main())
