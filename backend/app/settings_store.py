"""Portal settings persisted in SQLite (data/portal.db). Only settings the backend actually
enforces live here; UI preferences (compact, animations) stay in the browser."""
from __future__ import annotations

import json
import sqlite3
import threading

from . import config

DEFAULTS: dict = {
    # GB of MemAvailable that must remain after a server reaches its configured footprint.
    "safetyHeadroom": 2.5,
    # Instances shown as "not deployed" until their env file + directory exist.
    "plannedInstances": [{"id": "cobbleverse", "name": "Cobbleverse"}],
}

VALIDATORS = {
    "safetyHeadroom": lambda v: isinstance(v, (int, float)) and 0.5 <= float(v) <= 6,
}


class SettingsStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._db: sqlite3.Connection | None = None
        self._cache = dict(DEFAULTS)

    def open(self) -> None:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(config.DATA_DIR / "portal.db", check_same_thread=False)
        self._db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        self._db.commit()
        for k, v in self._db.execute("SELECT key, value FROM settings"):
            if k in DEFAULTS:
                self._cache[k] = json.loads(v)

    def get(self, key: str):
        return self._cache.get(key, DEFAULTS.get(key))

    def all(self) -> dict:
        return dict(self._cache)

    def update(self, values: dict) -> dict:
        for k, v in values.items():
            if k not in VALIDATORS or not VALIDATORS[k](v):
                raise ValueError(f"invalid setting {k}")
        with self._lock:
            for k, v in values.items():
                self._cache[k] = v
                if self._db:
                    self._db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, json.dumps(v)))
            if self._db:
                self._db.commit()
        return self.all()


settings = SettingsStore()
