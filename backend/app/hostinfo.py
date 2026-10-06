"""Mostly-static host facts, read from /proc, /sys and /etc (no root needed)."""
from __future__ import annotations

import os
import platform
import socket
import time
from functools import lru_cache
from pathlib import Path

import psutil

from . import config
from .metrics import GB


def _read(path: str) -> str | None:
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def os_release() -> dict[str, str]:
    out = {}
    for line in (_read("/etc/os-release") or "").splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out[k] = v.strip('"')
    return out


@lru_cache(maxsize=1)
def cpu_model() -> str:
    for line in (_read("/proc/cpuinfo") or "").splitlines():
        if line.startswith("model name"):
            return " ".join(line.split(":", 1)[1].split())
    return platform.processor() or "Unknown CPU"


def java_runtimes() -> list[dict]:
    """Distinct JDKs under /usr/lib/jvm (symlink aliases collapsed)."""
    seen: dict[str, dict] = {}
    root = config.JVM_DIR
    if not root.is_dir():
        return []
    # shortest name first so canonical "java-21-openjdk-amd64" wins over "java-1.21.0-openjdk-amd64"
    for d in sorted(root.iterdir(), key=lambda p: (len(p.name), p.name)):
        java = d / "bin" / "java"
        if not java.exists():
            continue
        real = os.path.realpath(d)
        if real in seen:
            continue
        rel = {}
        for line in (_read(str(d / "release")) or "").splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                rel[k] = v.strip('"')
        seen[real] = {"path": str(java), "dir": d.name, "version": rel.get("JAVA_VERSION", "?"), "major": rel.get("JAVA_VERSION", "?").split(".")[0]}
    return sorted(seen.values(), key=lambda j: int(j["major"]) if j["major"].isdigit() else 0)


def java_version_for(path: str) -> str:
    d = Path(path).parent.parent
    for line in (_read(str(d / "release")) or "").splitlines():
        if line.startswith("JAVA_VERSION="):
            return "OpenJDK " + line.split("=", 1)[1].strip('"')
    return Path(path).parent.parent.name


def _default_route() -> tuple[str | None, str | None]:
    for line in (_read("/proc/net/route") or "").splitlines()[1:]:
        f = line.split()
        if len(f) > 2 and f[1] == "00000000":
            gw = socket.inet_ntoa(bytes.fromhex(f[2])[::-1])
            return f[0], gw
    return None, None


def _dns() -> list[str]:
    servers = []
    for line in (_read("/run/systemd/resolve/resolv.conf") or _read("/etc/resolv.conf") or "").splitlines():
        if line.startswith("nameserver"):
            servers.append(line.split()[1])
    return servers


def interfaces() -> list[dict]:
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    out = []
    for name, st in stats.items():
        if name == "lo" or name.startswith(("tailscale", "zt", "docker", "veth")):
            continue
        v4 = [a for a in addrs.get(name, []) if a.family == socket.AF_INET]
        kind = "wifi" if Path(f"/sys/class/net/{name}/wireless").exists() else "ethernet"
        out.append({
            "name": name,
            "kind": kind,
            "up": st.isup and bool(v4),
            "carrier": _read(f"/sys/class/net/{name}/carrier") == "1",
            "speedMbps": st.speed or None,
            "addresses": [f"{a.address}/{_prefix(a.netmask)}" for a in v4],
            "mac": next((a.address for a in addrs.get(name, []) if a.family == psutil.AF_LINK), None),
        })
    return sorted(out, key=lambda i: (not i["up"], i["name"]))


def _prefix(mask: str | None) -> int:
    if not mask:
        return 32
    return sum(bin(int(x)).count("1") for x in mask.split("."))


def board() -> str | None:
    v, n = _read("/sys/class/dmi/id/board_vendor"), _read("/sys/class/dmi/id/board_name")
    return " ".join(x for x in (v, n) if x) or None


def gpus() -> list[str]:
    out = []
    base = Path("/sys/bus/pci/devices")
    if not base.is_dir():
        return out
    names = {"0x10de": "NVIDIA", "0x8086": "Intel", "0x1002": "AMD"}
    for dev in base.iterdir():
        cls = _read(str(dev / "class")) or ""
        if not cls.startswith("0x03"):
            continue
        vendor = names.get(_read(str(dev / "vendor")) or "", "GPU")
        drv = Path(os.path.realpath(dev / "driver")).name if (dev / "driver").exists() else "no driver"
        out.append(f"{vendor} ({drv})")
    return sorted(out)


def host_info() -> dict:
    osr = os_release()
    iface, gw = _default_route()
    return {
        "hostname": socket.gethostname(),
        "os": osr.get("PRETTY_NAME", platform.system()),
        "osShort": f"{osr.get('NAME', 'Linux')} {osr.get('VERSION_ID', '')}".strip(),
        "kernel": platform.release(),
        "cpuModel": cpu_model(),
        "cpuShort": cpu_model().replace("Intel(R) Core(TM) ", "").replace(" CPU", "").split(" @")[0],
        "cores": psutil.cpu_count(logical=False) or 0,
        "threads": psutil.cpu_count() or 0,
        "cpuMaxMhz": round(psutil.cpu_freq().max) if psutil.cpu_freq() else None,
        "memTotal": psutil.virtual_memory().total / GB,
        "bootTime": psutil.boot_time(),
        "uptime": time.time() - psutil.boot_time(),
        "timezone": (_read("/etc/timezone") or time.tzname[0]),
        "board": board(),
        "gpus": gpus(),
        "java": java_runtimes(),
        "defaultIface": iface,
        "gateway": gw,
        "dns": _dns(),
        "interfaces": interfaces(),
        "portalPort": int(os.environ.get("WYZI_PORTAL_PORT", "8080")),
        "portalVersion": config.PORTAL_VERSION,
    }
