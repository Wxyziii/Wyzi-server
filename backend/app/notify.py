"""ntfy push notifications (outbound HTTPS only; the portal stays LAN-only).

Topic and optional access token are write-only secrets in the settings DB.
Two kinds of alerts:
  - events:     one-shot (crash, start failure, backup failure, ...), cooldown per key
  - conditions: held for N seconds before alerting (RAM, disk, SMART, Playit), one alert per
                episode plus a "resolved" message when the condition clears"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.error
import urllib.request

from .events import hub
from .settings_store import settings

log = logging.getLogger("wyzi.notify")

PRIORITY = {"min": 1, "low": 2, "default": 3, "high": 4, "urgent": 5}


def _post(server: str, payload: dict, token: str | None) -> None:
    req = urllib.request.Request(server.rstrip("/") + "/", data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    with urllib.request.urlopen(req, timeout=10) as r:  # noqa: S310 - fixed https URL validated in settings
        r.read()


class Notifier:
    def __init__(self) -> None:
        self._last_sent: dict[str, float] = {}
        self._cond_first: dict[str, float] = {}
        self._cond_alerted: dict[str, str] = {}  # key -> title of the alert that was sent

    def _cfg(self) -> dict:
        return settings.get("notify")

    async def send(self, title: str, message: str, priority: str = "default", tags: list[str] | None = None, force: bool = False) -> str | None:
        """Returns None on success, an error message otherwise."""
        cfg = self._cfg()
        topic = settings.secret("ntfy_topic")
        if not topic:
            return "no ntfy topic configured"
        if not cfg["enabled"] and not force:
            return "notifications are disabled"
        payload = {"topic": topic, "title": title[:120], "message": message[:1000], "priority": PRIORITY.get(priority, 3), "tags": tags or []}
        if cfg.get("portalUrl"):
            payload["click"] = cfg["portalUrl"]
        try:
            await asyncio.to_thread(_post, cfg["server"], payload, settings.secret("ntfy_token"))
        except (urllib.error.URLError, OSError, ValueError) as e:
            msg = getattr(e, "reason", None) or str(e)
            log.warning("ntfy send failed: %s", msg)
            hub.log("portal", "warn", f"notification failed: {msg}")
            return str(msg)
        hub.log("portal", "info", f"notification sent: {title}")
        return None

    def _wanted(self, kind: str) -> bool:
        return bool(self._cfg()["events"].get(kind))

    def event(self, kind: str, key: str, title: str, message: str, priority: str = "high", tags: list[str] | None = None) -> None:
        """One-shot event with per-key cooldown."""
        if not self._wanted(kind):
            return
        cooldown = self._cfg()["cooldownMinutes"] * 60
        now = time.time()
        if key in self._last_sent and now - self._last_sent[key] < cooldown:
            return
        self._last_sent[key] = now
        asyncio.get_running_loop().create_task(self.send(title, message, priority, tags))

    def condition(self, kind: str, key: str, active: bool, title: str, message: str, hold: float = 0,
                  priority: str = "high", tags: list[str] | None = None, resolved: str | None = None) -> None:
        now = time.time()
        if active:
            first = self._cond_first.setdefault(key, now)
            if key not in self._cond_alerted and now - first >= hold:
                self._cond_alerted[key] = title
                self.event(kind, key, title, message, priority, tags)
        else:
            self._cond_first.pop(key, None)
            if key in self._cond_alerted:
                self._cond_alerted.pop(key)
                if self._wanted(kind) and resolved:
                    asyncio.get_running_loop().create_task(self.send(f"Resolved: {title}", resolved, "low", ["white_check_mark"]))

    def active_conditions(self) -> list[str]:
        return list(self._cond_alerted.values())


notifier = Notifier()
