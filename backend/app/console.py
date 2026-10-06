"""Per-instance console buffer fed by tailing logs/latest.log (readable through the
wyziportal ACL) plus synthetic 'sys' lines from the portal itself."""
from __future__ import annotations

import itertools
import os
import time
from collections import deque
from pathlib import Path

from .events import clock, hub
from .parsing import parse_log_line

_ids = itertools.count(1)
BUFFER = 500


class Console:
    def __init__(self, instance_id: str, log_path: Path) -> None:
        self.id = instance_id
        self.path = log_path
        self.lines: deque = deque(maxlen=BUFFER)
        self._ino: int | None = None
        self._pos = 0
        self._partial = ""
        self._skip_partial_line = False
        self._loading = False  # True while reading the pre-existing tail (no callbacks)
        self.on_line = None  # callback(parsed line dict)

    def push(self, level: str, text: str, thread: str = "wyzi-portal", t: str | None = None) -> dict:
        line = {"id": next(_ids), "t": t or clock(), "thread": thread, "level": level, "text": text}
        self.lines.append(line)
        hub.send({"type": "console", "id": self.id, "lines": [line]}, console_id=self.id)
        return line

    def backlog(self, n: int = 400) -> list[dict]:
        return list(self.lines)[-n:]

    def poll(self) -> None:
        """Read any new bytes from latest.log; handles rotation (new inode) and truncation."""
        try:
            st = os.stat(self.path)
        except OSError:
            return
        if self._ino != st.st_ino or st.st_size < self._pos:
            first = self._ino is None
            self._ino = st.st_ino
            self._pos = max(0, st.st_size - 64 * 1024) if first else 0
            self._partial = ""
            self._loading = first
            self._skip_partial_line = bool(first and self._pos)
        if st.st_size == self._pos:
            return
        try:
            with open(self.path, "rb") as f:
                f.seek(self._pos)
                data = f.read(512 * 1024)
                self._pos = f.tell()
        except OSError:
            return
        text = self._partial + data.decode("utf-8", errors="replace")
        parts = text.split("\n")
        self._partial = parts.pop()
        if self._skip_partial_line:
            parts = parts[1:]
            self._skip_partial_line = False
        new = []
        for raw in parts:
            if not raw.strip():
                continue
            parsed = parse_log_line(raw)
            if parsed is None:
                # continuation (stack traces etc.) inherits the previous level
                prev = new[-1] if new else (self.lines[-1] if self.lines else None)
                parsed = {"t": prev["t"] if prev else time.strftime("%H:%M:%S"), "thread": prev["thread"] if prev else "?", "level": prev["level"] if prev and prev["level"] in ("warn", "error") else "info", "text": raw.rstrip("\r")}
            parsed["id"] = next(_ids)
            self.lines.append(parsed)
            new.append(parsed)
            if self.on_line and not self._loading:
                self.on_line(parsed)
        self._loading = False
        if new:
            hub.send({"type": "console", "id": self.id, "lines": new[-200:]}, console_id=self.id)
