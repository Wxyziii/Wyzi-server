"""Host RAM safety model, based on MemAvailable (never MemFree).

A Minecraft JVM eventually grows to roughly Xmx plus native overhead (metaspace,
thread stacks, direct buffers, GC structures). For every running instance we reserve
the part of that footprint it has not touched yet, and we always keep the configured
headroom available for the OS and page cache.

    safe = MemAvailable
         + RSS of instances that will be stopped first
         + memory of ARK slots (Minecraft start stops ARK automatically)
         - headroom
         - not-yet-used footprint of instances that keep running
"""
from __future__ import annotations


def footprint_gb(xmx: float) -> float:
    return round(xmx + max(0.5, 0.2 * xmx), 2)


def breakdown(mem: dict, instances: list, headroom: float, ark_gb: float) -> dict:
    total, available, free, cache = mem["total"], mem["available"], mem["free"], mem["cache"]
    minecraft = sum(i.rss_gb for i in instances if i.pid)
    system = max(0.0, total - free - cache - minecraft)
    growth = sum(max(0.0, footprint_gb(i.xmx) - i.rss_gb) for i in instances if i.is_active)
    safe = max(0.0, available + ark_gb - headroom - growth)
    return {
        "total": round(total, 2),
        "available": round(available, 2),
        "free": round(free, 2),
        "cache": round(cache, 2),
        "minecraft": round(minecraft, 2),
        "system": round(system, 2),
        "used": round(minecraft + system, 2),
        "headroom": headroom,
        "reservedGrowth": round(growth, 2),
        "arkReclaimable": round(ark_gb, 2),
        "safeForNew": round(safe, 1),
    }


def check_start(target, instances: list, mem: dict, headroom: float, ark_gb: float, stop_first: set[str]) -> dict:
    """Return {"ok": bool, "required", "safe", "blockers": [ids]} for starting `target`."""
    keep = [i for i in instances if i.is_active and i.id not in stop_first and i.id != target.id]
    freed = sum(i.rss_gb for i in instances if i.id in stop_first and i.pid)
    growth = sum(max(0.0, footprint_gb(i.xmx) - i.rss_gb) for i in keep)
    safe = max(0.0, mem["available"] + freed + ark_gb - headroom - growth)
    required = footprint_gb(target.xmx)
    blockers = sorted((i for i in keep), key=lambda i: -i.xmx)
    return {
        "ok": required <= safe,
        "required": required,
        "safe": round(safe, 1),
        "shortfall": round(max(0.0, required - safe), 1),
        "blockers": [i.id for i in blockers],
    }
