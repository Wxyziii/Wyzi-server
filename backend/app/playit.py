"""Reads the sanitized Playit status written by wyzi-playit-status.service.

The portal never touches the Playit control socket or secret. The bridge file only
contains whitelisted, non-secret fields (see deploy/playit-bridge/wyzi-playit-status)."""
from __future__ import annotations

import json
import time

from . import config
from .helper import systemctl_show

STALE_AFTER = 120  # seconds without a bridge update -> data is stale


async def playit_status(local_listening: set[int], sleeping: set[int] | None = None) -> dict:
    svc = await systemctl_show("playit.service", ["ActiveState", "SubState", "ExecMainStartTimestamp", "NRestarts"])
    service = svc.get("ActiveState", "unknown")
    out: dict = {
        "service": {"active": "running", "activating": "starting", "deactivating": "stopping"}.get(service, service),
        "serviceSince": svc.get("ExecMainStartTimestamp") or None,
        "agent": "unknown",
        "tunnel": "unknown",
        "tunnels": [],
        "publicAddress": None,
        "copyAddress": None,
        "publicHost": None,
        "publicPort": None,
        "localTarget": None,
        "latencyMs": None,
        "version": None,
        "updatedAt": None,
        "stale": True,
        "bridge": "missing",
    }
    try:
        raw = json.loads(config.PLAYIT_STATUS_FILE.read_text())
    except (OSError, ValueError):
        if service != "active":
            out["agent"] = "offline"
            out["tunnel"] = "offline"
        return out

    age = time.time() - float(raw.get("updated_at", 0))
    out.update(
        bridge="ok",
        stale=age > STALE_AFTER,
        updatedAt=raw.get("updated_at"),
        version=raw.get("version"),
        latencyMs=raw.get("latency_ms"),
        agent=raw.get("agent", "unknown") if service == "active" else "offline",
    )
    tunnels = []
    for t in raw.get("tunnels", []):
        dest = t.get("local_target") or ""
        port = int(dest.rsplit(":", 1)[1]) if ":" in dest and dest.rsplit(":", 1)[1].isdigit() else None
        if t.get("disabled"):
            state = "disabled"
        elif out["agent"] != "online":
            state = "offline"
        elif port in local_listening:
            state = "online"
        elif sleeping and port in sleeping:
            state = "sleeping"  # wake-on-connect listener answers on the local target
        else:
            state = "idle"  # tunnel is up but nothing is listening on the local target
        tunnels.append({
            "publicHost": t.get("public_host"),
            "publicPort": t.get("public_port"),
            "publicAddress": t.get("public_address"),
            # SRV-backed tunnels can be joined with the bare hostname; that is what we copy.
            "copyAddress": t.get("public_host") if t.get("srv") else t.get("public_address"),
            "localTarget": dest,
            "localPort": port,
            "state": state,
        })
    out["tunnels"] = tunnels
    if tunnels:
        main = next((t for t in tunnels if t["localPort"] == 25565), tunnels[0])
        out.update(
            tunnel=main["state"],
            publicAddress=main["publicAddress"],
            copyAddress=main["copyAddress"],
            publicHost=main["publicHost"],
            publicPort=main["publicPort"],
            localTarget=main["localTarget"],
        )
    else:
        out["tunnel"] = "none"
    return out
