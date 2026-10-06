"""In-process event hub: WebSocket fan-out plus the activity feed and portal log ring."""
from __future__ import annotations

import asyncio
import itertools
import json
import time
from collections import deque
from dataclasses import dataclass, field

_ids = itertools.count(1)


def hhmm(ts: float | None = None) -> str:
    return time.strftime("%H:%M", time.localtime(ts or time.time()))


def clock(ts: float | None = None) -> str:
    return time.strftime("%H:%M:%S", time.localtime(ts or time.time()))


@dataclass(eq=False)  # identity hashing: clients live in a set
class Client:
    queue: asyncio.Queue
    consoles: set[str] = field(default_factory=set)


class Hub:
    def __init__(self) -> None:
        self.clients: set[Client] = set()
        self.activity: deque = deque(maxlen=40)
        self.logs: deque = deque(maxlen=800)

    def register(self) -> Client:
        c = Client(asyncio.Queue(maxsize=400))
        self.clients.add(c)
        return c

    def unregister(self, c: Client) -> None:
        self.clients.discard(c)

    def send(self, msg: dict, console_id: str | None = None) -> None:
        data = json.dumps(msg, separators=(",", ":"))
        for c in list(self.clients):
            if console_id is not None and console_id not in c.consoles:
                continue
            try:
                c.queue.put_nowait(data)
            except asyncio.QueueFull:
                pass  # slow client; it will resync from the next tick

    # ── feed helpers ──
    def activity_event(self, title: str, kind: str, detail: str | None = None) -> None:
        a = {"id": next(_ids), "time": hhmm(), "title": title, "detail": detail, "kind": kind}
        self.activity.appendleft(a)
        self.send({"type": "activity", "activity": a})

    def log(self, source: str, level: str, msg: str) -> None:
        e = {"id": next(_ids), "t": clock(), "source": source, "level": level, "msg": msg}
        self.logs.append(e)
        self.send({"type": "log", "entry": e})

    def toast(self, title: str, kind: str = "info", desc: str | None = None) -> None:
        self.send({"type": "toast", "toast": {"title": title, "kind": kind, "desc": desc}})


hub = Hub()
