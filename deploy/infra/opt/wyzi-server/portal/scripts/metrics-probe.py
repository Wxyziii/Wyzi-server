#!/usr/bin/env python3
"""Verify every metric source the portal needs is readable. Run with the portal venv:
    /opt/wyzi-server/portal/backend/.venv/bin/python /opt/wyzi-server/portal/scripts/metrics-probe.py
"""
import json
import subprocess
import time
from pathlib import Path

import psutil


def read(p):
    try:
        return Path(p).read_text().strip()
    except OSError as e:
        return f"<{e.__class__.__name__}>"


def main():
    out = {}
    out["cpu_percent_per_core"] = psutil.cpu_percent(interval=1, percpu=True)
    out["cpu_freq_mhz_per_core"] = [round(f.current) for f in psutil.cpu_freq(percpu=True)]
    out["cpu_governor"] = read("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor")
    out["cpu_epp"] = read("/sys/devices/system/cpu/cpu0/cpufreq/energy_performance_preference")
    out["turbo_disabled"] = read("/sys/devices/system/cpu/intel_pstate/no_turbo")
    temps = psutil.sensors_temperatures()
    out["cpu_package_c"] = next((t.current for t in temps.get("coretemp", []) if t.label.startswith("Package")), None)
    out["loadavg"] = psutil.getloadavg()
    vm, sw = psutil.virtual_memory(), psutil.swap_memory()
    out["mem_total_mib"], out["mem_available_mib"] = vm.total >> 20, vm.available >> 20
    out["swap_total_mib"], out["swap_used_mib"] = sw.total >> 20, sw.used >> 20
    out["zram"] = read("/sys/block/zram0/mm_stat")
    out["filesystems"] = {
        m: {"total_gib": round(psutil.disk_usage(m).total / 2**30, 1), "used_pct": psutil.disk_usage(m).percent}
        for m in ("/", "/srv/minecraft", "/srv/storage", "/mnt/storage")
    }
    d1, n1 = psutil.disk_io_counters(perdisk=True), psutil.net_io_counters(pernic=True)
    time.sleep(1)
    d2, n2 = psutil.disk_io_counters(perdisk=True), psutil.net_io_counters(pernic=True)
    out["disk_io_bytes_per_s"] = {
        d: {"read": d2[d].read_bytes - d1[d].read_bytes, "write": d2[d].write_bytes - d1[d].write_bytes}
        for d in ("sda", "sdb") if d in d2
    }
    out["net_bytes_per_s"] = {
        n: {"rx": n2[n].bytes_recv - n1[n].bytes_recv, "tx": n2[n].bytes_sent - n1[n].bytes_sent}
        for n in n2 if n != "lo"
    }
    out["uptime_s"] = int(time.time() - psutil.boot_time())
    mc = subprocess.run(
        ["systemctl", "show", "-p", "MainPID", "--value", "wyzi-mc@fabric.service"], capture_output=True, text=True
    ).stdout.strip()
    out["minecraft_fabric_pid"] = int(mc or 0)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
