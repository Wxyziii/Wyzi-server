"""Pure parsers (no I/O beyond reading the given text). Unit-tested in tests/test_parsing.py."""
from __future__ import annotations

import re
import shlex

SIZE_RE = re.compile(r"^(\d+)([MG])$")


def parse_env(text: str) -> dict[str, str]:
    """Parse a systemd EnvironmentFile (KEY=VALUE, optional single/double quotes).
    Never executes anything. Later keys win, like systemd."""
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[key] = value
    return out


def parse_properties(text: str) -> dict[str, str]:
    """Parse Minecraft server.properties (key=value, '#' comments)."""
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", "!")) or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def size_to_gb(value: str | None) -> float | None:
    """'6G' -> 6.0, '4096M' -> 4.0"""
    if not value:
        return None
    m = SIZE_RE.match(value.strip())
    if not m:
        return None
    n = int(m.group(1))
    return float(n) if m.group(2) == "G" else round(n / 1024, 2)


LOG_RE = re.compile(r"^\[(\d{2}:\d{2}:\d{2})\] \[([^\]/]+)/([A-Z]+)\]: ?(.*)$")
CHAT_RE = re.compile(r"^(?:\[Not Secure\] )?<[^>]{1,32}> ")


def parse_log_line(line: str) -> dict | None:
    """Minecraft log line -> {t, thread, level, text} with the frontend's level vocabulary."""
    m = LOG_RE.match(line.rstrip("\r\n"))
    if not m:
        return None
    t, thread, lvl, text = m.groups()
    level = {"WARN": "warn", "ERROR": "error", "FATAL": "error"}.get(lvl, "info")
    if level == "info" and CHAT_RE.match(text):
        level = "chat"
    return {"t": t, "thread": thread, "level": level, "text": text}


LIST_RE = re.compile(r"There are (\d+) of a max(?: of)? (\d+) players online:?\s*(.*)$", re.S)


def parse_list(resp: str) -> tuple[int, int, list[str]] | None:
    m = LIST_RE.search(resp.strip())
    if not m:
        return None
    names = [n.strip() for n in m.group(3).split(",") if n.strip()]
    return int(m.group(1)), int(m.group(2)), names


MSPT_RE = re.compile(r"Average time per tick:\s*([\d.]+)\s*ms", re.I)


def parse_tick_query(resp: str) -> float | None:
    """Vanilla 1.20.3+ `/tick query` -> average milliseconds per tick."""
    m = MSPT_RE.search(resp)
    return float(m.group(1)) if m else None


# Minecraft console commands: printable, single line, bounded. RCON only reaches the
# Minecraft command dispatcher, never a shell, but we still reject control characters.
COMMAND_MAX = 256


def validate_command(raw: str) -> str:
    cmd = raw.strip()
    if cmd.startswith("/"):
        cmd = cmd[1:]
    if not cmd:
        raise ValueError("empty command")
    if len(cmd) > COMMAND_MAX:
        raise ValueError(f"command longer than {COMMAND_MAX} characters")
    if any(ord(c) < 32 or ord(c) == 127 for c in cmd):
        raise ValueError("control characters are not allowed")
    return cmd


def split_flags(value: str) -> list[str]:
    try:
        return shlex.split(value)
    except ValueError:
        return value.split()
