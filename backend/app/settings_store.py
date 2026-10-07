"""Portal persistence in SQLite (data/portal.db).

- settings          global settings the backend enforces (returned to the UI)
- instance_settings per-instance automation: auto-stop, wake-on-connect, backup schedule
- secrets           write-only values (ntfy topic/token); never returned by the API
- state             small bookkeeping (last scheduled backup per instance, ...)
- sessions          login sessions (sha256 of the token, never the token itself)

UI-only preferences (compact, animations) stay in the browser."""
from __future__ import annotations

import copy
import json
import re
import sqlite3
import threading
import time

from . import config

DEFAULTS: dict = {
    # GB of MemAvailable that must remain after a server reaches its configured footprint.
    "safetyHeadroom": 2.5,
    # Instances shown as "not deployed" until their env file + directory exist.
    "plannedInstances": [{"id": "cobbleverse", "name": "Cobbleverse"}],
    "notify": {
        "enabled": False,
        "server": "https://ntfy.sh",
        "portalUrl": "http://192.168.1.2:8080",
        "events": {
            "crash": True,
            "startFailed": True,
            "backupFailed": True,
            "diskPressure": True,
            "ramPressure": True,
            "smart": True,
            "playitOffline": True,
            "autoStop": False,
            "wake": False,
        },
        "diskPercent": 90,
        "cooldownMinutes": 30,
    },
}

INSTANCE_DEFAULTS: dict = {
    "autoStop": {"enabled": False, "minutes": 15, "backupFirst": True},
    "wake": {"enabled": False},
    "schedule": {"enabled": False, "time": "04:30", "onlyIfRan": True, "tz": "UTC"},
}

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
URL_RE = re.compile(r"^https://[A-Za-z0-9.-]+(:\d{1,5})?/?$")
TOPIC_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def _deep_merge(base: dict, patch: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _validate_notify(v: dict) -> bool:
    if not isinstance(v, dict):
        return False
    if "enabled" in v and not isinstance(v["enabled"], bool):
        return False
    if "server" in v and not (isinstance(v["server"], str) and URL_RE.match(v["server"])):
        return False
    if "portalUrl" in v and not (isinstance(v["portalUrl"], str) and re.match(r"^https?://[A-Za-z0-9.:-]+/?$", v["portalUrl"])):
        return False
    if "events" in v and not (isinstance(v["events"], dict) and all(k in DEFAULTS["notify"]["events"] and isinstance(b, bool) for k, b in v["events"].items())):
        return False
    if "diskPercent" in v and not (isinstance(v["diskPercent"], int) and 50 <= v["diskPercent"] <= 99):
        return False
    if "cooldownMinutes" in v and not (isinstance(v["cooldownMinutes"], int) and 5 <= v["cooldownMinutes"] <= 1440):
        return False
    return set(v) <= set(DEFAULTS["notify"])


VALIDATORS = {
    "safetyHeadroom": lambda v: isinstance(v, (int, float)) and 0.5 <= float(v) <= 6,
    "notify": _validate_notify,
}


def _valid_tz(name) -> bool:
    if not isinstance(name, str) or not re.match(r"^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$", name):
        return False
    try:
        from zoneinfo import ZoneInfo

        ZoneInfo(name)
        return True
    except Exception:
        return False


def validate_instance_settings(v: dict) -> bool:
    if not isinstance(v, dict) or not set(v) <= set(INSTANCE_DEFAULTS):
        return False
    a = v.get("autoStop", {})
    if not isinstance(a, dict) or not set(a) <= {"enabled", "minutes", "backupFirst"}:
        return False
    if "enabled" in a and not isinstance(a["enabled"], bool):
        return False
    if "minutes" in a and not (isinstance(a["minutes"], int) and 2 <= a["minutes"] <= 720):
        return False
    if "backupFirst" in a and not isinstance(a["backupFirst"], bool):
        return False
    w = v.get("wake", {})
    if not isinstance(w, dict) or not set(w) <= {"enabled"} or ("enabled" in w and not isinstance(w["enabled"], bool)):
        return False
    sc = v.get("schedule", {})
    if not isinstance(sc, dict) or not set(sc) <= {"enabled", "time", "onlyIfRan", "tz"}:
        return False
    if "tz" in sc and not _valid_tz(sc["tz"]):
        return False
    if "enabled" in sc and not isinstance(sc["enabled"], bool):
        return False
    if "time" in sc and not (isinstance(sc["time"], str) and TIME_RE.match(sc["time"])):
        return False
    if "onlyIfRan" in sc and not isinstance(sc["onlyIfRan"], bool):
        return False
    return True


class SettingsStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._db: sqlite3.Connection | None = None
        self._cache = copy.deepcopy(DEFAULTS)
        self._instances: dict[str, dict] = {}

    # ───────── lifecycle ─────────
    def open(self) -> None:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(config.DATA_DIR / "portal.db", check_same_thread=False)
        for ddl in (
            "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS instance_settings (id TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, created REAL NOT NULL, last_seen REAL NOT NULL, expires REAL NOT NULL, ip TEXT)",
        ):
            self._db.execute(ddl)
        self._db.commit()
        for k, v in self._db.execute("SELECT key, value FROM settings"):
            if k in DEFAULTS:
                val = json.loads(v)
                self._cache[k] = _deep_merge(DEFAULTS[k], val) if isinstance(DEFAULTS[k], dict) else val
        for k, v in self._db.execute("SELECT id, value FROM instance_settings"):
            self._instances[k] = json.loads(v)

    def _exec(self, sql: str, args: tuple = ()) -> list:
        with self._lock:
            assert self._db is not None
            rows = self._db.execute(sql, args).fetchall()
            self._db.commit()
            return rows

    # ───────── global settings ─────────
    def get(self, key: str):
        return copy.deepcopy(self._cache.get(key, DEFAULTS.get(key)))

    def all(self) -> dict:
        out = copy.deepcopy(self._cache)
        out["notify"]["configured"] = bool(self.secret("ntfy_topic"))
        out["notify"]["hasToken"] = bool(self.secret("ntfy_token"))
        return out

    def update(self, values: dict) -> dict:
        for k, v in values.items():
            if k not in VALIDATORS or not VALIDATORS[k](v):
                raise ValueError(f"invalid setting {k}")
        for k, v in values.items():
            self._cache[k] = _deep_merge(self._cache[k], v) if isinstance(v, dict) else v
            self._exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, json.dumps(self._cache[k])))
        return self.all()

    # ───────── per-instance automation ─────────
    def instance(self, iid: str) -> dict:
        return _deep_merge(INSTANCE_DEFAULTS, self._instances.get(iid, {}))

    def update_instance(self, iid: str, patch: dict) -> dict:
        if not validate_instance_settings(patch):
            raise ValueError("invalid instance settings")
        merged = _deep_merge(self.instance(iid), patch)
        self._instances[iid] = merged
        self._exec("INSERT OR REPLACE INTO instance_settings (id, value) VALUES (?, ?)", (iid, json.dumps(merged)))
        return merged

    # ───────── write-only secrets ─────────
    def secret(self, key: str) -> str | None:
        rows = self._exec("SELECT value FROM secrets WHERE key = ?", (key,))
        return rows[0][0] if rows else None

    def set_secret(self, key: str, value: str | None) -> None:
        if value:
            self._exec("INSERT OR REPLACE INTO secrets (key, value) VALUES (?, ?)", (key, value))
        else:
            self._exec("DELETE FROM secrets WHERE key = ?", (key,))

    # ───────── small state ─────────
    def state(self, key: str, default=None):
        rows = self._exec("SELECT value FROM state WHERE key = ?", (key,))
        return json.loads(rows[0][0]) if rows else default

    def set_state(self, key: str, value) -> None:
        self._exec("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)", (key, json.dumps(value)))

    # ───────── sessions ─────────
    def session_add(self, token_hash: str, ttl: float, ip: str | None) -> None:
        now = time.time()
        self._exec("INSERT INTO sessions (token_hash, created, last_seen, expires, ip) VALUES (?, ?, ?, ?, ?)", (token_hash, now, now, now + ttl, ip))

    def session_get(self, token_hash: str) -> tuple | None:
        rows = self._exec("SELECT created, last_seen, expires FROM sessions WHERE token_hash = ?", (token_hash,))
        return rows[0] if rows else None

    def session_touch(self, token_hash: str, expires: float) -> None:
        self._exec("UPDATE sessions SET last_seen = ?, expires = ? WHERE token_hash = ?", (time.time(), expires, token_hash))

    def session_delete(self, token_hash: str | None = None) -> None:
        if token_hash is None:
            self._exec("DELETE FROM sessions")
        else:
            self._exec("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    def session_purge(self) -> None:
        self._exec("DELETE FROM sessions WHERE expires < ?", (time.time(),))


settings = SettingsStore()
