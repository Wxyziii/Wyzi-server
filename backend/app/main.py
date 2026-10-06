"""Wyzi Server portal backend.

LAN-only by deployment (UFW allows :8080 from 192.168.1.0/24 only). In addition the
app rejects foreign Host headers (DNS rebinding) and cross-origin state-changing
requests (CSRF from a web page opened on a LAN device)."""
from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, memory, storage, system
from .backups import jobs, list_backups
from .events import hub
from .helper import HelperError, run_helper
from .hostinfo import host_info
from .instances import manager
from .metrics import HostCollector
from .parsing import validate_command
from .playit import playit_status
from .settings_store import settings

logging.basicConfig(level=os.environ.get("WYZI_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("wyzi")

ALLOWED_HOSTS = {h.strip().lower() for h in os.environ.get(
    "WYZI_ALLOWED_HOSTS", "192.168.1.2,marceserver,marceserver.local,localhost,127.0.0.1").split(",") if h.strip()}

collector = HostCollector()
state: dict = {"playit": None, "host": None, "storage": None}
_bg_tasks: set[asyncio.Task] = set()


def spawn(coro) -> None:
    """Fire-and-forget with a strong reference so the task cannot be garbage-collected."""
    t = asyncio.create_task(coro)
    _bg_tasks.add(t)
    t.add_done_callback(_bg_tasks.discard)


# ───────────────────────── background loops ─────────────────────────
async def sample_loop() -> None:
    while True:
        t = time.monotonic()
        try:
            await asyncio.to_thread(collector.sample)
            await manager.poll()
            hub.send({"type": "tick", **tick_payload()})
        except Exception:  # keep the loop alive; errors are logged
            log.exception("sample loop")
        await asyncio.sleep(max(0.2, config.SAMPLE_INTERVAL - (time.monotonic() - t)))


async def slow_loop() -> None:
    prev_agent = None
    while True:
        try:
            listening = {i.port for i in manager.instances.values() if i.status == "running"}
            p = await playit_status(listening)
            if prev_agent is not None and p["agent"] != prev_agent:
                lvl = "info" if p["agent"] == "online" else "warn"
                hub.log("playit", lvl, f"agent {prev_agent} → {p['agent']}")
                hub.activity_event(f"Playit agent {p['agent']}", "network", p.get("publicAddress"))
            prev_agent = p["agent"]
            state["playit"] = p
            state["host"] = await asyncio.to_thread(host_info)
        except Exception:
            log.exception("slow loop")
        await asyncio.sleep(5)


async def measure_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(storage.measure)
            state["storage"] = await asyncio.to_thread(storage.storage_snapshot)
            hub.send({"type": "storage", "storage": state["storage"]})
        except Exception:
            log.exception("measure loop")
        await asyncio.sleep(600)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    settings.open()
    await asyncio.to_thread(manager.discover)
    state["host"] = await asyncio.to_thread(host_info)
    hub.log("portal", "info", f"portal {config.PORTAL_VERSION} started · {len(manager.instances)} instance(s)")
    tasks = [asyncio.create_task(c()) for c in (sample_loop, slow_loop, measure_loop, manager.rcon_loop)]
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(title="Wyzi Server Portal", version=config.PORTAL_VERSION, lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.middleware("http")
async def lan_guard(request: Request, call_next):
    host = (request.headers.get("host") or "").rsplit(":", 1)[0].strip("[]").lower()
    if host not in ALLOWED_HOSTS:
        return JSONResponse({"detail": "host not allowed"}, status_code=421)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and origin.split("://", 1)[-1].rsplit(":", 1)[0].lower() not in ALLOWED_HOSTS:
            return JSONResponse({"detail": "cross-origin request rejected"}, status_code=403)
        if request.headers.get("x-wyzi") != "1":
            return JSONResponse({"detail": "missing X-Wyzi header"}, status_code=403)
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["X-Frame-Options"] = "DENY"
    return resp


# ───────────────────────── payloads ─────────────────────────
def memory_payload() -> dict:
    snap = collector.snapshot()
    m = memory.breakdown(snap["mem"], list(manager.instances.values()), float(settings.get("safetyHeadroom")), manager.ark_gb)
    m.update(swapTotal=snap["swap"]["total"], swapUsed=snap["swap"]["used"], zram=snap["zram"])
    return m


def tick_payload() -> dict:
    snap = collector.snapshot()
    return {
        "sys": {k: snap[k] for k in ("cpu", "cores", "freqMhz", "temp", "load", "disk", "net", "hist", "updatedAt")},
        "memory": memory_payload(),
        "servers": manager.snapshot(state["playit"], settings.get("plannedInstances")),
        "playit": state["playit"],
        "backupJob": jobs.snapshot(),
        "ark": {"active": manager.ark_active, "memory": round(manager.ark_gb, 2)},
        "now": time.time(),
    }


def get_instance(iid: str):
    try:
        return manager.get(iid)
    except KeyError:
        raise HTTPException(404, f"unknown instance '{iid}'")


# ───────────────────────── REST ─────────────────────────
@app.get("/api/health")
async def health():
    return {"ok": True, "version": config.PORTAL_VERSION, "helper": config.HELPER_ENABLED, "instances": len(manager.instances)}


@app.get("/api/state")
async def full_state():
    if state["storage"] is None:
        state["storage"] = await asyncio.to_thread(storage.storage_snapshot)
    return {
        **tick_payload(),
        "host": state["host"],
        "storage": state["storage"],
        "backups": jobs.all(),
        "activity": list(hub.activity),
        "logs": list(hub.logs),
        "settings": settings.all(),
        "capabilities": {"helper": config.HELPER_ENABLED},
    }


@app.get("/api/system/host")
async def get_host():
    return state["host"] or await asyncio.to_thread(host_info)


@app.get("/api/system/metrics")
async def get_metrics():
    return {**collector.snapshot(), "memory": memory_payload()}


@app.get("/api/system/services")
async def get_services():
    return await system.services()


@app.get("/api/system/updates")
async def get_updates(refresh: bool = False):
    return await system.updates(refresh)


@app.get("/api/storage")
async def get_storage():
    state["storage"] = await asyncio.to_thread(storage.storage_snapshot)
    return state["storage"]


@app.get("/api/playit")
async def get_playit():
    """Sanitized Playit status (no secrets, no control-socket access)."""
    listening = {i.port for i in manager.instances.values() if i.status == "running"}
    p = await playit_status(listening)
    return {
        "agent": p["agent"],
        "service": p["service"],
        "tunnel": p["tunnel"],
        "public_address": p["publicAddress"],
        "copy_address": p["copyAddress"],
        "public_host": p["publicHost"],
        "public_port": p["publicPort"],
        "local_target": p["localTarget"],
        "latency_ms": p["latencyMs"],
        "updated_at": p["updatedAt"],
        "stale": p["stale"],
        "version": p["version"],
        "tunnels": p["tunnels"],
    }


@app.post("/api/playit/restart")
async def restart_playit():
    try:
        await run_helper("playit", "restart", timeout=60)
    except HelperError as e:
        raise HTTPException(503, str(e))
    hub.log("playit", "info", "agent restart requested from portal")
    return {"ok": True}


@app.get("/api/instances")
async def list_instances():
    return manager.snapshot(state["playit"], settings.get("plannedInstances"))


@app.get("/api/instances/{iid}")
async def instance_detail(iid: str):
    return get_instance(iid).to_api(state["playit"])


class StartBody(BaseModel):
    stop_first: list[str] = Field(default_factory=list, max_length=8)


@app.post("/api/instances/{iid}/start", status_code=202)
async def start_instance(iid: str, body: StartBody | None = None):
    inst = get_instance(iid)
    if inst.status not in ("offline", "failed"):
        raise HTTPException(409, f"{inst.name} is {inst.status}")
    stop_first = [get_instance(s) for s in (body.stop_first if body else []) if s != iid]
    for o in stop_first:
        if o.status not in ("running", "starting"):
            raise HTTPException(409, f"{o.name} is not running")
    snap = collector.snapshot()
    check = memory.check_start(inst, list(manager.instances.values()), snap["mem"], float(settings.get("safetyHeadroom")),
                               manager.ark_gb, {o.id for o in stop_first})
    if not check["ok"]:
        hub.log("portal", "warn", f"start blocked: {iid} needs {check['required']} GB, {check['safe']} GB safely available")
        return JSONResponse(status_code=409, content={"code": "insufficient_memory", "serverId": iid, **check})
    spawn(manager.start(inst, stop_first))
    return {"ok": True, "status": "starting"}


@app.post("/api/instances/{iid}/stop", status_code=202)
async def stop_instance(iid: str):
    inst = get_instance(iid)
    if inst.status not in ("running", "starting"):
        raise HTTPException(409, f"{inst.name} is {inst.status}")

    async def _bg():
        with contextlib.suppress(HelperError):
            await manager.stop(inst)
    spawn(_bg())
    return {"ok": True, "status": "stopping"}


@app.post("/api/instances/{iid}/restart", status_code=202)
async def restart_instance(iid: str):
    inst = get_instance(iid)
    if inst.status != "running":
        raise HTTPException(409, f"{inst.name} is {inst.status}")
    spawn(manager.restart(inst))
    return {"ok": True, "status": "stopping"}


class CommandBody(BaseModel):
    command: str = Field(min_length=1, max_length=300)


@app.post("/api/instances/{iid}/command")
async def instance_command(iid: str, body: CommandBody):
    inst = get_instance(iid)
    try:
        cmd = validate_command(body.command)
    except ValueError as e:
        raise HTTPException(422, str(e))
    if cmd.split(" ", 1)[0].lower() == "stop":
        inst.console.push("cmd", "> stop", thread="console")
        return await stop_instance(iid)
    return {"ok": True, "response": await manager.command(inst, cmd)}


@app.get("/api/instances/{iid}/console")
async def instance_console(iid: str, lines: int = 400):
    return get_instance(iid).console.backlog(max(1, min(lines, 500)))


@app.get("/api/backups")
async def get_backups():
    return {"backups": jobs.all(), "job": jobs.snapshot(), "schedule": await jobs.schedule()}


@app.post("/api/instances/{iid}/backups", status_code=202)
async def create_backup(iid: str):
    inst = get_instance(iid)
    try:
        await jobs.start_manual(inst)
    except HelperError as e:
        raise HTTPException(409, str(e))
    return {"ok": True}


class RestoreBody(BaseModel):
    confirm: str = Field(description="must equal the instance id")


@app.post("/api/instances/{iid}/backups/{archive}/restore", status_code=202)
async def restore_backup(iid: str, archive: str, body: RestoreBody):
    inst = get_instance(iid)
    if body.confirm != iid:
        raise HTTPException(422, "confirmation does not match the instance id")
    if archive not in {b["id"] for b in list_backups() if b["serverId"] == iid}:
        raise HTTPException(404, "unknown archive")
    if jobs.job:
        raise HTTPException(409, "another backup or restore is running")
    if inst.status not in ("offline", "failed"):
        raise HTTPException(409, f"{inst.name} must be stopped before restoring")
    spawn(jobs.restore(inst, archive))
    return {"ok": True}


@app.get("/api/settings")
async def get_settings():
    return settings.all()


@app.put("/api/settings")
async def put_settings(values: dict):
    try:
        return settings.update(values)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/api/logs")
async def get_logs():
    return list(hub.logs)


# ───────────────────────── WebSocket ─────────────────────────
@app.websocket("/api/ws")
async def ws(websocket: WebSocket):
    host = (websocket.headers.get("host") or "").rsplit(":", 1)[0].lower()
    origin = websocket.headers.get("origin")
    if host not in ALLOWED_HOSTS or (origin and origin.split("://", 1)[-1].rsplit(":", 1)[0].lower() not in ALLOWED_HOSTS):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    client = hub.register()

    async def reader():
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "console" and isinstance(msg.get("ids"), list):
                ids = {i for i in msg["ids"][:8] if isinstance(i, str) and i in manager.instances}
                for i in ids - client.consoles:
                    await websocket.send_json({"type": "console", "id": i, "lines": manager.instances[i].console.backlog(), "reset": True})
                client.consoles = ids

    async def writer():
        while True:
            await websocket.send_text(await client.queue.get())

    try:
        await asyncio.gather(reader(), writer())
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hub.unregister(client)


# ───────────────────────── frontend (production build) ─────────────────────────
if (config.FRONTEND_DIST / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = (config.FRONTEND_DIST / path).resolve()
        if path and candidate.is_file() and config.FRONTEND_DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(config.FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-cache"})
