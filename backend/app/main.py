"""Wyzi Server portal backend.

LAN-only by deployment (UFW allows :8080 from 192.168.1.0/24 only). In addition the
app rejects foreign Host headers (DNS rebinding) and cross-origin state-changing
requests (CSRF from a web page opened on a LAN device)."""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import auth, config, memory, storage, system
from .automation import automation, wire
from .backups import jobs, list_backups
from .events import hub
from .files import FileAccessError, list_dir, read_text
from . import modconfig
from .helper import HelperError, run_helper
from .hostinfo import host_info
from .instances import manager
from .metrics import HostCollector
from .parsing import validate_command
from .playit import playit_status
from .notify import notifier
from .settings_store import TOPIC_RE, settings
from .wake import wake

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


STARTED_AT = time.time()


def _restart_requested() -> bool:
    """deploy-portal.sh touches data/restart-request after copying new code; exiting with
    code 3 makes systemd (Restart=on-failure) start the new version. No sudo needed."""
    try:
        return (config.DATA_DIR / "restart-request").stat().st_mtime > STARTED_AT
    except OSError:
        return False


async def slow_loop() -> None:
    prev_agent = None
    while True:
        if _restart_requested():
            log.warning("restart requested by deploy; exiting with code 3")
            os._exit(3)
        try:
            listening = {i.port for i in manager.instances.values() if i.status == "running"}
            p = await playit_status(listening, wake.ports())
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


async def automation_loop() -> None:
    n = 0
    while True:
        n += 1
        try:
            await wake.reconcile()
            if n % 3 == 0:  # every ~6 s
                automation.mark_ran()
                await automation.auto_stop_tick()
                await automation.alerts_tick(memory_payload(), state["playit"])
            if n % 15 == 0:  # every ~30 s
                await automation.schedule_tick()
                settings.session_purge()
        except Exception:
            log.exception("automation loop")
        await asyncio.sleep(2)


async def checked_start(inst, stop_first: list | None = None, reason: str = "portal") -> tuple[bool, dict | str]:
    """Start with the RAM-safety check. Shared by the Start button and wake-on-connect."""
    stop_first = stop_first or []
    snap = collector.snapshot()
    check = memory.check_start(inst, list(manager.instances.values()), snap["mem"], float(settings.get("safetyHeadroom")),
                               manager.ark_gb, {o.id for o in stop_first})
    if not check["ok"]:
        hub.log("portal", "warn", f"start blocked ({reason}): {inst.id} needs {check['required']} GB, {check['safe']} GB safely available")
        return False, check
    inst.pending, inst.pending_since = "starting", time.time()  # before the task runs: wake must not re-listen
    spawn(manager.start(inst, stop_first))
    return True, check


async def _wake_starter(inst, reason: str) -> tuple[bool, str]:
    if any(i.status in ("running", "starting") and i.env.get("HEAVY") == "yes" for i in manager.instances.values() if i.id != inst.id) and inst.env.get("HEAVY") == "yes":
        return False, "Another large server is running. Ask an admin to switch servers."
    ok, info = await checked_start(inst, reason=reason)
    if not ok:
        need = info.get("required") if isinstance(info, dict) else "?"
        return False, f"Not enough free memory to start right now (needs {need} GB). Try again later."
    return True, "starting"


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
    wire()
    wake.starter = _wake_starter
    await asyncio.to_thread(manager.discover)
    state["host"] = await asyncio.to_thread(host_info)
    hub.log("portal", "info", f"portal {config.PORTAL_VERSION} started · {len(manager.instances)} instance(s)")
    hub.activity_event("Portal started", "system", f"{len(manager.instances)} instance(s) discovered")
    tasks = [asyncio.create_task(c()) for c in (sample_loop, slow_loop, measure_loop, manager.rcon_loop, automation_loop)]
    yield
    for t in tasks:
        t.cancel()
    for lst in list(wake.listeners.values()):
        await lst.close()


PUBLIC_API = {"/api/health", "/api/auth/state", "/api/auth/login", "/api/auth/logout"}

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
    path = request.url.path
    if path.startswith("/api/") and path not in PUBLIC_API and not auth.check(request.cookies.get(auth.COOKIE)):
        code = "login_required" if auth.configured() else "setup_required"
        return JSONResponse({"detail": "authentication required", "code": code}, status_code=401)
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
        "sys": {k: snap[k] for k in ("cpu", "cores", "freqMhz", "temp", "load", "disk", "net", "netTotals", "sensors", "fans", "hist", "updatedAt")},
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
    return {"ok": True, "version": config.PORTAL_VERSION, "helper": config.HELPER_ENABLED, "instances": len(manager.instances), "started": STARTED_AT}


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
    p = await playit_status(listening, wake.ports())
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
    inst = get_instance(iid)
    d = inst.to_api(state["playit"])
    automation.annotate(d, inst)
    return d


@app.put("/api/instances/{iid}/automation")
async def put_automation(iid: str, values: dict):
    inst = get_instance(iid)
    try:
        cfg = settings.update_instance(inst.id, values)
    except ValueError as e:
        raise HTTPException(422, str(e))
    hub.log("portal", "info", f"automation settings changed for {iid}")
    if values.get("wake", {}).get("enabled"):
        # a joining player can only wake one server per port: hand wake-on-connect over to this one
        for other in manager.instances.values():
            if other.id != inst.id and other.port == inst.port and settings.instance(other.id)["wake"]["enabled"]:
                settings.update_instance(other.id, {"wake": {"enabled": False}})
                hub.log("portal", "info", f"wake-on-connect moved from {other.id} to {iid} (shared port {inst.port})")
    automation.empty_since.pop(inst.id, None)
    if "schedule" in values:
        # a newly enabled/changed schedule starts with the NEXT slot (catch-up is only for missed runs)
        automation.reset_schedule(inst.id)
    await wake.reconcile()
    return cfg


class StartBody(BaseModel):
    stop_first: list[str] = Field(default_factory=list, max_length=8)


@app.post("/api/instances/{iid}/start", status_code=202)
async def start_instance(iid: str, body: StartBody | None = None):
    inst = get_instance(iid)
    if inst.status not in ("offline", "failed") or inst.pending:
        raise HTTPException(409, f"{inst.name} is {inst.status}")
    stop_first = [get_instance(s) for s in (body.stop_first if body else []) if s != iid]
    for o in stop_first:
        if o.status not in ("running", "starting"):
            raise HTTPException(409, f"{o.name} is not running")
    await wake.release_port(inst.port)  # any sleeping instance on this port lets go so Minecraft can bind it
    ok, check = await checked_start(inst, stop_first)
    if not ok:
        return JSONResponse(status_code=409, content={"code": "insufficient_memory", "serverId": iid, **check})
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


@app.get("/api/instances/{iid}/files")
async def instance_files(iid: str, path: str = ""):
    inst = get_instance(iid)
    try:
        return await asyncio.to_thread(list_dir, inst.dir, path)
    except FileAccessError as e:
        raise HTTPException(e.status, str(e))


@app.get("/api/instances/{iid}/files/content")
async def instance_file_content(iid: str, path: str):
    inst = get_instance(iid)
    try:
        return await asyncio.to_thread(read_text, inst.dir, path)
    except FileAccessError as e:
        raise HTTPException(e.status, str(e))


@app.get("/api/instances/{iid}/modconfig")
async def modconfig_list(iid: str):
    return modconfig.list_files(get_instance(iid))


@app.get("/api/instances/{iid}/modconfig/{name}")
async def modconfig_read(iid: str, name: str):
    try:
        return await asyncio.to_thread(modconfig.read_file, get_instance(iid), name)
    except modconfig.ModConfigError as e:
        raise HTTPException(e.status, str(e))


@app.put("/api/instances/{iid}/modconfig/{name}")
async def modconfig_write(iid: str, name: str, request: Request):
    inst = get_instance(iid)
    body = await request.body()
    if len(body) > modconfig.MAX_BYTES:
        raise HTTPException(413, "config file too large")
    try:
        value = json.loads(body)
    except ValueError as e:
        raise HTTPException(422, f"not valid JSON: {e}")
    try:
        await asyncio.to_thread(modconfig.write_file, inst, name, value)
    except modconfig.ModConfigError as e:
        raise HTTPException(e.status, str(e))
    hub.log("portal", "info", f"gameplay config {name} of {iid} saved")
    result = await modconfig.live_reload(inst)
    hub.activity_event(f"{inst.name}: {modconfig.FILES[name]['label']} updated", "system", result["message"])
    return {"ok": True, **result, "files": modconfig.list_files(inst)["files"]}


@app.post("/api/instances/{iid}/modconfig/reload")
async def modconfig_reload(iid: str):
    inst = get_instance(iid)
    return {**await modconfig.live_reload(inst), "files": modconfig.list_files(inst)["files"]}


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


class NotifySecrets(BaseModel):
    topic: str | None = Field(default=None, max_length=64)
    token: str | None = Field(default=None, max_length=200)
    clearToken: bool = False


@app.put("/api/notify/secrets")
async def put_notify_secrets(body: NotifySecrets):
    """Write-only: the topic/token are never returned by any endpoint."""
    if body.topic is not None:
        if body.topic and not TOPIC_RE.match(body.topic):
            raise HTTPException(422, "topic must be 8-64 characters of letters, digits, - and _")
        settings.set_secret("ntfy_topic", body.topic or None)
    if body.clearToken:
        settings.set_secret("ntfy_token", None)
    elif body.token:
        if not body.token.startswith("tk_"):
            raise HTTPException(422, "ntfy access tokens start with tk_")
        settings.set_secret("ntfy_token", body.token)
    return settings.all()["notify"]


@app.post("/api/notify/test")
async def notify_test():
    err = await notifier.send("Wyzi test notification", "Notifications from the Wyzi portal are working.", "default", ["white_check_mark"], force=True)
    if err:
        raise HTTPException(502, f"ntfy: {err}")
    return {"ok": True}


@app.get("/api/auth/state")
async def auth_state(request: Request):
    return {"configured": auth.configured(), "authenticated": auth.check(request.cookies.get(auth.COOKIE))}


class LoginBody(BaseModel):
    password: str = Field(min_length=1, max_length=256)


@app.post("/api/auth/login")
async def auth_login(body: LoginBody, request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    if not auth.configured():
        raise HTTPException(409, "no admin password set — run app.admin set-password on the server")
    wait = auth.locked_for(ip)
    if wait > 0:
        raise HTTPException(429, f"too many attempts — try again in {int(wait) + 1} s")
    token = await auth.login(body.password, ip)
    if not token:
        hub.log("portal", "warn", f"failed login from {ip}")
        raise HTTPException(401, "wrong password")
    hub.log("portal", "info", f"login from {ip}")
    response.set_cookie(value=token, **auth.cookie_kwargs())
    return {"ok": True}


@app.post("/api/auth/logout")
async def auth_logout(request: Request, response: Response):
    auth.logout(request.cookies.get(auth.COOKIE))
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


class PasswordBody(BaseModel):
    current: str = Field(min_length=1, max_length=256)
    new: str = Field(min_length=auth.MIN_PASSWORD, max_length=256)


@app.post("/api/auth/password")
async def auth_password(body: PasswordBody, response: Response):
    try:
        await auth.change_password(body.current, body.new)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    response.delete_cookie(auth.COOKIE, path="/")
    hub.log("portal", "info", "admin password changed; all sessions signed out")
    return {"ok": True}


@app.post("/api/auth/logout-all")
async def auth_logout_all(response: Response):
    settings.session_delete()
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


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
    if not auth.check(websocket.cookies.get(auth.COOKIE)):
        await websocket.accept()  # accept first so the browser receives the 4401 close code
        await websocket.close(code=4401)
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

    async def session_watch():
        # sign-out, password change or expiry must also end sockets that are already open
        token = websocket.cookies.get(auth.COOKIE)
        while True:
            await asyncio.sleep(30)
            if not auth.check(token):
                await websocket.close(code=4401)
                return

    tasks = [asyncio.create_task(c()) for c in (reader, writer, session_watch)]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        for t in tasks:
            t.cancel()
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
