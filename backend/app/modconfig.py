"""Gameplay configuration of the POKÉ PORTAL mod (quests, achievements, prices, starter, boosts).

The mod owns validation and keeps its last valid settings when a file is rejected; this module
only offers a narrow, allow-listed editor:

  <instance>/config/wyzi-poke-portal/<file>   (portal group has rw via a directory ACL)

Write flow: shape check here → previous version copied to <file>.portal-prev → atomic replace →
if the server runs: RCON `poke reload` → per-file result lines ([wyzi-reload] name = ok|error: …).
No other path can be read or written; file names are a fixed allow-list."""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import tempfile
import time
from pathlib import Path

from .instances import Instance
from .rcon import RconError

FILES: dict[str, dict] = {
    "quests.json": {"label": "Quests", "kind": "object", "required": ["enabled", "dailyCount", "dailyBonus", "definitions"]},
    "achievements.json": {"label": "Achievements", "kind": "object", "required": ["enabled", "definitions"]},
    "portal.json": {"label": "Services & general", "kind": "object", "required": ["servicePrices"]},
    "starter.json": {"label": "Starter", "kind": "object", "required": ["enabled", "kit"]},
    "spawn_boosts.json": {"label": "Spawn boosts", "kind": "object", "required": ["species", "shiny", "variant"]},
    "legendary_shop.json": {"label": "Legendary shop", "kind": "array", "required": []},
    "selling.json": {"label": "Selling", "kind": "object", "required": ["pokemon", "items"]},
    "gym_tiers.json": {"label": "Gym difficulty tiers", "kind": "object", "required": ["tiers"]},
}
MAX_BYTES = 512 * 1024
RELOAD_LINE = re.compile(r"^\[wyzi-reload\] (\S+) = (.*)$")


class ModConfigError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def config_dir(inst: Instance) -> Path:
    return inst.dir / "config" / "wyzi-poke-portal"


def available(inst: Instance) -> bool:
    return config_dir(inst).is_dir()


def _path(inst: Instance, name: str) -> Path:
    if name not in FILES:
        raise ModConfigError(404, "unknown config file")
    return config_dir(inst) / name


def mod_status(inst: Instance) -> dict:
    try:
        return json.loads((config_dir(inst) / "_status.json").read_text())
    except (OSError, ValueError):
        return {}


def list_files(inst: Instance) -> dict:
    status = mod_status(inst).get("files", {})
    out = []
    for name, meta in FILES.items():
        p = config_dir(inst) / name
        try:
            st = p.stat()
            exists, size, mtime = True, st.st_size, st.st_mtime
        except OSError:
            exists, size, mtime = False, 0, None
        out.append({"name": name, "label": meta["label"], "exists": exists, "size": size, "modified": mtime,
                    "writable": exists and os.access(p, os.W_OK) and os.access(config_dir(inst), os.W_OK),
                    "status": status.get(name)})
    return {"available": available(inst), "files": out, "statusUpdatedAt": mod_status(inst).get("updatedAt")}


def read_file(inst: Instance, name: str):
    p = _path(inst, name)
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ModConfigError(404, "file does not exist yet (start the server once)")
    except PermissionError:
        raise ModConfigError(403, "the portal cannot read this file")
    except ValueError as e:
        raise ModConfigError(422, f"file is not valid JSON: {e}")


def check_shape(name: str, value) -> None:
    meta = FILES[name]
    if meta["kind"] == "object" and not isinstance(value, dict):
        raise ModConfigError(422, f"{name} must be a JSON object")
    if meta["kind"] == "array" and not isinstance(value, list):
        raise ModConfigError(422, f"{name} must be a JSON array")
    if isinstance(value, dict):
        missing = [k for k in meta["required"] if k not in value]
        if missing:
            raise ModConfigError(422, f"{name} is missing: {', '.join(missing)}")
    if name in ("quests.json", "achievements.json"):
        defs = value.get("definitions")
        if not isinstance(defs, list) or len(defs) > 256:
            raise ModConfigError(422, "definitions must be a list of at most 256 entries")
        ids = set()
        for d in defs:
            if not isinstance(d, dict) or not re.fullmatch(r"[a-z0-9_]{1,48}", str(d.get("id", ""))):
                raise ModConfigError(422, "every definition needs an id of lowercase letters, digits and _")
            if d["id"] in ids:
                raise ModConfigError(422, f"duplicate id {d['id']}")
            ids.add(d["id"])
            if not re.fullmatch(r"[0-9]{1,24}", str(d.get("reward", ""))):
                raise ModConfigError(422, f"{d['id']}: reward must be a whole number")


def write_file(inst: Instance, name: str, value) -> None:
    target = _path(inst, name)  # allow-list first
    check_shape(name, value)
    data = (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if len(data) > MAX_BYTES:
        raise ModConfigError(413, "config file too large")
    d = config_dir(inst)
    if not d.is_dir():
        raise ModConfigError(409, "config folder does not exist yet (start the server once)")
    try:
        if target.exists():
            shutil.copyfile(target, d / f"{name}.portal-prev")
        fd, tmp = tempfile.mkstemp(dir=d, prefix=f".{name}.")
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o660)
        os.replace(tmp, target)
    except PermissionError:
        raise ModConfigError(403, "the portal has no write access to the config folder (see docs/AUTOMATION.md)")


async def live_reload(inst: Instance) -> dict:
    """Ask the running server to reload; returns {applied, results{file: status}, message}."""
    if inst.status != "running":
        return {"applied": False, "results": {}, "message": "Saved. The server is not running; it will load these settings when it starts."}
    target = inst.rcon_target
    if target is None:
        return {"applied": False, "results": {}, "message": "Saved, but RCON is disabled so the server cannot be reloaded live."}
    try:
        resp = await asyncio.to_thread(inst.rcon.command, *target, "poke reload")
    except RconError as e:
        return {"applied": False, "results": {}, "message": f"Saved, but live reload failed: {e}"}
    results = {}
    for line in resp.splitlines():
        m = RELOAD_LINE.match(line.strip())
        if m:
            results[m.group(1)] = m.group(2)
    ok = results.get("result") == "ok"
    results.pop("result", None)
    inst.console.push("sys", f"Gameplay config reloaded from the portal ({'ok' if ok else 'with errors'})")
    return {"applied": True, "ok": ok, "results": results, "message": "Applied live." if ok else "Some files were rejected; their previous settings stay active.", "at": time.time()}
