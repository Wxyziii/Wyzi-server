"""Read-only file browser for instance directories (the portal only has read access
through the wyziportal ACL). Paths are confined to the instance directory and
secrets in known config files are redacted before they leave the server."""
from __future__ import annotations

import os
import re
import stat
import time
from pathlib import Path

MAX_PREVIEW = 512 * 1024
TEXT_EXT = {".properties", ".txt", ".json", ".json5", ".toml", ".yml", ".yaml", ".cfg", ".conf", ".ini", ".log", ".md", ".snbt", ".mcmeta", ".csv", ".env", ".sh", ".js", ".zs"}
# [ \t]* (not \s*) so an empty value never lets the match run into the next line
SECRET_KEYS = re.compile(r"^([ \t]*(?:rcon\.password|management-server-secret|[\w.-]*(?:password|secret|token|apikey|api_key)[\w.-]*)[ \t]*[=:][ \t]*)\S.*$", re.I | re.M)
SECRET_JSON = re.compile(r'("(?:[\w.-]*(?:password|secret|token|apikey|api_key)[\w.-]*)"\s*:\s*)"[^"]*"', re.I)


class FileAccessError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _resolve(root: Path, rel: str) -> Path:
    rel = (rel or "").strip().strip("/")
    parts = [p for p in rel.split("/") if p]
    if any(p in (".", "..") or "\x00" in p or "\\" in p for p in parts):
        raise FileAccessError(400, "invalid path")
    base = os.path.realpath(root)
    target = os.path.realpath(os.path.join(base, *parts))
    if target != base and not target.startswith(base + os.sep):
        raise FileAccessError(403, "path escapes the instance directory")
    return Path(target)


def _modified(ts: float) -> str:
    lt, now = time.localtime(ts), time.localtime()
    if lt.tm_year == now.tm_year and lt.tm_yday == now.tm_yday:
        return time.strftime("Today, %H:%M", lt)
    return time.strftime("%b %d, %H:%M" if lt.tm_year == now.tm_year else "%b %d %Y", lt)


def _size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def list_dir(root: Path, rel: str) -> dict:
    d = _resolve(root, rel)
    if not d.is_dir():
        raise FileAccessError(404, "not a directory")
    entries = []
    try:
        with os.scandir(d) as it:
            for e in it:
                try:
                    st = e.stat(follow_symlinks=False)
                except OSError:
                    continue
                is_dir = stat.S_ISDIR(st.st_mode)
                entries.append({
                    "name": e.name,
                    "dir": is_dir,
                    "size": None if is_dir else _size(st.st_size),
                    "bytes": None if is_dir else st.st_size,
                    "modified": _modified(st.st_mtime),
                    "mtime": int(st.st_mtime),
                    "previewable": (not is_dir) and Path(e.name).suffix.lower() in TEXT_EXT and st.st_size <= MAX_PREVIEW,
                })
    except PermissionError:
        raise FileAccessError(403, "the portal cannot read this directory")
    entries.sort(key=lambda x: (not x["dir"], x["name"].lower()))
    return {"path": "/".join(p for p in (rel or "").strip("/").split("/") if p), "entries": entries[:2000]}


def redact(name: str, text: str) -> str:
    text = SECRET_KEYS.sub(lambda m: m.group(1) + "••••••", text)
    if name.endswith((".json", ".json5")):
        text = SECRET_JSON.sub(lambda m: m.group(1) + '"••••••"', text)
    return text


def read_text(root: Path, rel: str) -> dict:
    f = _resolve(root, rel)
    if not f.is_file():
        raise FileAccessError(404, "not a file")
    if f.suffix.lower() not in TEXT_EXT:
        raise FileAccessError(415, "binary or unsupported file type")
    try:
        size = f.stat().st_size
        with open(f, "rb") as fh:
            data = fh.read(MAX_PREVIEW)
    except PermissionError:
        raise FileAccessError(403, "the portal cannot read this file")
    return {"path": rel.strip("/"), "content": redact(f.name, data.decode("utf-8", errors="replace")), "truncated": size > MAX_PREVIEW, "bytes": size}
