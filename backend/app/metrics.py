"""Lightweight host sampler: psutil + /proc + /sys, one sample every SAMPLE_INTERVAL.
Keeps short ring buffers so freshly opened pages get a full chart immediately."""
from __future__ import annotations

import os
import time
from collections import deque
from pathlib import Path

import psutil

from . import config

GB = 1024**3
MB = 1024**2

# Interfaces that are VPN/virtual and not interesting for throughput.
_SKIP_NIC_PREFIX = ("lo", "tailscale", "zt", "docker", "veth", "br-", "virbr")


def _ring(fill: float = 0.0) -> deque:
    return deque([fill] * config.HISTORY, maxlen=config.HISTORY)


def _read(path: str) -> str | None:
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def physical_disks() -> list[str]:
    out = []
    for d in sorted(os.listdir("/sys/block")):
        if d.startswith(("loop", "ram", "zram", "dm-", "sr")):
            continue
        out.append(d)
    return out


class HostCollector:
    def __init__(self) -> None:
        self.hist = {k: _ring() for k in ("cpu", "ram", "diskR", "diskW", "netIn", "netOut", "temp")}
        self.cpu = 0.0
        self.cores: list[float] = []
        self.freq_mhz = 0.0
        self.temp: float | None = None
        self.load = (0.0, 0.0, 0.0)
        self.mem = psutil.virtual_memory()
        self.swap = psutil.swap_memory()
        self.zram: dict | None = None
        self.disk_rates: dict[str, dict[str, float]] = {}
        self.net_rates: dict[str, dict[str, float]] = {}
        self._last_disk = psutil.disk_io_counters(perdisk=True) or {}
        self._last_net = psutil.net_io_counters(pernic=True) or {}
        self._last_t = time.monotonic()
        self.disks = physical_disks()
        psutil.cpu_percent(percpu=True)  # prime the counters
        self.updated_at = time.time()

    def sample(self) -> None:
        now = time.monotonic()
        dt = max(0.2, now - self._last_t)
        self._last_t = now

        self.cores = [round(c, 1) for c in psutil.cpu_percent(percpu=True)]
        self.cpu = round(sum(self.cores) / max(1, len(self.cores)), 1)
        freqs = psutil.cpu_freq(percpu=True) or []
        self.freq_mhz = round(sum(f.current for f in freqs) / len(freqs)) if freqs else 0
        self.temp = self._cpu_temp()
        self.load = tuple(round(x, 2) for x in os.getloadavg())  # type: ignore[assignment]
        self.mem = psutil.virtual_memory()
        self.swap = psutil.swap_memory()
        self.zram = self._zram()

        disk = psutil.disk_io_counters(perdisk=True) or {}
        rates = {}
        for d in self.disks:
            if d in disk and d in self._last_disk:
                rates[d] = {
                    "read": (disk[d].read_bytes - self._last_disk[d].read_bytes) / dt / MB,
                    "write": (disk[d].write_bytes - self._last_disk[d].write_bytes) / dt / MB,
                }
        self._last_disk = disk
        self.disk_rates = rates

        net = psutil.net_io_counters(pernic=True) or {}
        nrates = {}
        for n, c in net.items():
            if n.startswith(_SKIP_NIC_PREFIX) or n not in self._last_net:
                continue
            nrates[n] = {
                "rx": (c.bytes_recv - self._last_net[n].bytes_recv) / dt / MB,
                "tx": (c.bytes_sent - self._last_net[n].bytes_sent) / dt / MB,
            }
        self._last_net = net
        self.net_rates = nrates

        in_use = (self.mem.total - self.mem.available) / GB
        self.hist["cpu"].append(self.cpu)
        self.hist["ram"].append(round(in_use, 2))
        self.hist["diskR"].append(round(sum(r["read"] for r in rates.values()), 2))
        self.hist["diskW"].append(round(sum(r["write"] for r in rates.values()), 2))
        self.hist["netIn"].append(round(sum(r["rx"] for r in nrates.values()), 3))
        self.hist["netOut"].append(round(sum(r["tx"] for r in nrates.values()), 3))
        self.hist["temp"].append(self.temp or 0)
        self.updated_at = time.time()

    @staticmethod
    def _cpu_temp() -> float | None:
        try:
            temps = psutil.sensors_temperatures()
        except (AttributeError, OSError):
            return None
        for t in temps.get("coretemp", []):
            if t.label.startswith("Package"):
                return round(t.current, 1)
        for t in temps.get("coretemp", []) + temps.get("k10temp", []):
            return round(t.current, 1)
        return None

    @staticmethod
    def _zram() -> dict | None:
        mm = _read("/sys/block/zram0/mm_stat")
        size = _read("/sys/block/zram0/disksize")
        if not mm or not size:
            return None
        f = mm.split()
        return {"size": int(size) / GB, "orig": int(f[0]) / GB, "compressed": int(f[1]) / GB}

    def snapshot(self) -> dict:
        m, s = self.mem, self.swap
        return {
            "cpu": self.cpu,
            "cores": self.cores,
            "freqMhz": self.freq_mhz,
            "temp": self.temp,
            "load": list(self.load),
            "mem": {
                "total": m.total / GB,
                "available": m.available / GB,
                "free": m.free / GB,
                "cache": (getattr(m, "cached", 0) + getattr(m, "buffers", 0)) / GB,
                "shared": getattr(m, "shared", 0) / GB,
            },
            "swap": {"total": s.total / GB, "used": s.used / GB},
            "zram": self.zram,
            "disk": {d: {k: round(v, 2) for k, v in r.items()} for d, r in self.disk_rates.items()},
            "net": {n: {k: round(v, 3) for k, v in r.items()} for n, r in self.net_rates.items()},
            "hist": {k: list(v) for k, v in self.hist.items()},
            "updatedAt": self.updated_at,
        }
