"""Volumes, physical disks and measured usage categories.

Only categories that can be measured reliably by the unprivileged portal are shown
(Minecraft instance dirs via ACL, backup archives); everything else is reported as
the remainder ("other data") instead of being guessed."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import psutil

from . import config
from .backups import backup_dir_size
from .instances import manager

GB = 1024**3
_cache: dict = {"measured": {}, "measuredAt": None}


def _read(path: Path | str) -> str | None:
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def du_bytes(path: Path) -> int:
    """Allocated bytes below path (like `du -s`), skipping what we cannot read."""
    total = 0
    stack = [str(path)]
    while stack:
        p = stack.pop()
        try:
            with os.scandir(p) as it:
                for e in it:
                    try:
                        st = e.stat(follow_symlinks=False)
                    except OSError:
                        continue
                    total += st.st_blocks * 512
                    if e.is_dir(follow_symlinks=False):
                        stack.append(e.path)
        except OSError:
            continue
    return total


def _parent_disk(dev: str) -> str | None:
    """/dev/mapper/vg-lv or /dev/sda1 -> physical disk name (sdb, sda)."""
    real = os.path.basename(os.path.realpath(dev))
    if real.startswith("dm-"):
        slaves = os.listdir(f"/sys/block/{real}/slaves") if os.path.isdir(f"/sys/block/{real}/slaves") else []
        if not slaves:
            return None
        real = slaves[0]
    sys_path = os.path.realpath(f"/sys/class/block/{real}")
    parent = os.path.basename(os.path.dirname(sys_path))
    return parent if os.path.isdir(f"/sys/block/{parent}") else real


def smart_status() -> dict:
    try:
        return json.loads(config.SMART_STATUS_FILE.read_text())
    except (OSError, ValueError):
        return {}


def disks() -> list[dict]:
    smart = smart_status()
    out = []
    for d in sorted(os.listdir("/sys/block")):
        if d.startswith(("loop", "ram", "zram", "dm-", "sr")):
            continue
        rot = _read(f"/sys/block/{d}/queue/rotational") == "1"
        size = int(_read(f"/sys/block/{d}/size") or 0) * 512
        s = (smart.get("disks") or {}).get(d, {})
        rpm = s.get("rotation_rate")
        out.append({
            "name": d,
            "model": _read(f"/sys/block/{d}/device/model") or "Unknown",
            "sizeBytes": size,
            "kind": "HDD" if rot else "SSD",
            "rpm": rpm if isinstance(rpm, int) and rpm > 0 else None,
            "smart": {
                "available": bool(s),
                "passed": s.get("passed"),
                "temp": s.get("temperature"),
                "powerOnHours": s.get("power_on_hours"),
                "reallocated": s.get("reallocated"),
                "pending": s.get("pending"),
                "uncorrectable": s.get("offline_uncorrectable"),
                "updatedAt": smart.get("updated_at"),
            },
        })
    return out


def mounts() -> list[dict]:
    wanted = ("/", "/boot", "/boot/efi", "/mnt/storage", "/srv/storage")
    out = []
    for p in psutil.disk_partitions(all=True):
        if p.mountpoint in wanted and not any(m["mount"] == p.mountpoint for m in out):
            out.append({"mount": p.mountpoint, "device": p.device, "fs": p.fstype, "opts": p.opts.split(",")[0]})
    for line in (_read("/proc/swaps") or "").splitlines()[1:]:
        f = line.split()
        if len(f) >= 3:
            out.append({"mount": "swap", "device": f[0], "fs": f[1], "opts": f"{int(f[2]) / 1024**2:.1f} GB"})
    return out


def measure() -> None:
    """Slow path (directory walks); run in a thread every few minutes."""
    measured: dict = {"instances": {}, "backups": {}}
    for inst in list(manager.instances.values()):
        total = du_bytes(inst.dir)
        world = du_bytes(inst.dir / (inst.props.get("level-name") or "world"))
        inst.disk_gb, inst.world_gb = total / GB, world / GB
        measured["instances"][inst.id] = total
    if config.BACKUP_DIR.is_dir():
        for d in config.BACKUP_DIR.iterdir():
            if d.is_dir() and config.INSTANCE_ID_RE.match(d.name):
                measured["backups"][d.name] = backup_dir_size(d.name)
    measured["minecraftRoot"] = du_bytes(config.MINECRAFT_ROOT)
    _cache.update(measured=measured, measuredAt=time.time())


def storage_snapshot() -> dict:
    m = _cache["measured"]
    dk = {d["name"]: d for d in disks()}
    volumes = []
    for v in config.VOLUMES:
        try:
            u = psutil.disk_usage(v["mount"])
        except OSError:
            continue
        dev = next((p.device for p in psutil.disk_partitions(all=False) if p.mountpoint == v["mount"]), None)
        disk = dk.get(_parent_disk(dev)) if dev else None
        cats: list[dict] = []
        if v["id"] == "system":
            mc = m.get("minecraftRoot", 0)
            cats.append({"label": "Minecraft instances", "bytes": mc, "detail": f"/srv/minecraft · {len(m.get('instances', {}))} instance(s)"})
            cats.append({"label": "OS, apps & other data", "bytes": max(0, u.used - mc), "detail": "Ubuntu, Java, ARK, HomeOps, home dirs (not itemised)"})
        else:
            bk = sum(m.get("backups", {}).values())
            cats.append({"label": "Minecraft backups", "bytes": bk, "detail": "/srv/storage/backups/minecraft"})
            cats.append({"label": "Other data", "bytes": max(0, u.used - bk), "detail": "Redux data, HomeOps workspace, archives (not itemised)"})
        volumes.append({
            **v,
            "device": dev,
            "disk": disk,
            "total": u.total,
            "used": u.used,
            "free": u.free,
            "percent": u.percent,
            "categories": cats,
        })
    largest = [{"path": str(config.INSTANCES_DIR / k), "bytes": b, "volume": "system"} for k, b in m.get("instances", {}).items()]
    largest += [{"path": str(config.BACKUP_DIR / k), "bytes": b, "volume": "bulk"} for k, b in m.get("backups", {}).items()]
    return {
        "volumes": volumes,
        "disks": list(dk.values()),
        "mounts": mounts(),
        "largest": sorted(largest, key=lambda x: -x["bytes"]),
        "measuredAt": _cache["measuredAt"],
        "smartAvailable": bool(smart_status()),
    }
