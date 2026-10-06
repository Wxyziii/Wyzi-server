"""Read-only system views: relevant systemd units and pending package updates."""
from __future__ import annotations

import time

from .helper import run_cmd
from .instances import manager

FIXED_UNITS = [
    ("wyzi-portal.service", "Wyzi portal backend (FastAPI)"),
    ("playit.service", "Playit.gg tunnel agent"),
    ("wyzi-playit-status.timer", "Sanitized Playit status bridge"),
    ("wyzi-smart-status.timer", "Disk SMART status export"),
    ("ssh.service", "OpenSSH server (LAN only)"),
    ("ufw.service", "Firewall"),
    ("unattended-upgrades.service", "Automatic security updates"),
    ("systemd-timesyncd.service", "Time synchronisation"),
    ("ark-cluster-manager.service", "ARK cluster manager (manual start)"),
    ("ark-server@home.service", "ARK server · home slot (manual start)"),
]

_updates: dict = {"items": [], "checkedAt": None}


async def services() -> list[dict]:
    units = list(FIXED_UNITS)
    for inst in manager.instances.values():
        units.insert(1, (inst.service, f"Minecraft · {inst.name}"))
        units.append((f"wyzi-backup@{inst.id}.timer", f"Scheduled backup · {inst.name}"))
    names = [u for u, _ in units]
    out = await run_cmd(["systemctl", "show", *names, "--no-pager", "-pId", "-pActiveState", "-pSubState", "-pMemoryCurrent", "-pActiveEnterTimestamp", "-pLoadState", "-pUnitFileState"])
    props: dict[str, dict] = {}
    cur: dict[str, str] = {}
    for line in out.splitlines() + [""]:
        if not line.strip():
            if cur.get("Id"):
                props[cur["Id"]] = cur
            cur = {}
            continue
        k, _, v = line.partition("=")
        cur[k] = v
    res = []
    for name, desc in units:
        p = props.get(name, {})
        if p.get("LoadState") == "not-found":
            continue
        mem = p.get("MemoryCurrent", "")
        res.append({
            "name": name,
            "desc": desc,
            "state": p.get("ActiveState", "unknown"),
            "sub": p.get("SubState", ""),
            "enabled": p.get("UnitFileState", ""),
            "memBytes": int(mem) if mem.isdigit() else None,
            "since": p.get("ActiveEnterTimestamp") or None,
        })
    return res


async def updates(refresh: bool = False) -> dict:
    """`apt list --upgradable` reads the package lists refreshed daily by apt-daily;
    it needs no root. Installing updates is left to unattended-upgrades / SSH."""
    if refresh or not _updates["checkedAt"] or time.time() - _updates["checkedAt"] > 1800:
        out = await run_cmd(["apt", "list", "--upgradable"], timeout=60)
        items = []
        for line in out.splitlines():
            if "[upgradable from:" not in line:
                continue
            name_part, rest = line.split(" ", 1)
            pkg, _, suites = name_part.partition("/")
            to = rest.split(" ")[0]
            frm = rest.split("[upgradable from:", 1)[1].strip(" ]")
            items.append({"pkg": pkg, "from": frm, "to": to, "sec": "-security" in suites})
        _updates.update(items=items, checkedAt=time.time())
    return dict(_updates)
