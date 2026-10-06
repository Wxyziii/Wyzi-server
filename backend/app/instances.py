"""Generic Minecraft instance model.

An instance exists when BOTH are present:
    /etc/wyzi-server/instances/<id>.env      (Java, heap, flags, backup settings)
    /srv/minecraft/instances/<id>/           (server files)
and it is managed by systemd as wyzi-mc@<id>.service. Nothing here is specific to
any modpack; Fabric, NeoForge, Forge and vanilla are detected from the files."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import deque
from pathlib import Path

import psutil

from . import config, memory
from .console import Console
from .events import hhmm, hub
from .helper import HelperError, run_cmd, run_helper
from .hostinfo import java_version_for
from .parsing import parse_env, parse_list, parse_properties, parse_tick_query, size_to_gb, validate_command
from .rcon import RconError, RconSession

log = logging.getLogger("wyzi.instances")

STARTUP_STEPS = 6  # matches the frontend checklist
# server.properties keys that are safe to show (never rcon.password / management secrets)
PUBLIC_PROPS = ("difficulty", "gamemode", "max-players", "view-distance", "simulation-distance", "white-list",
                "enforce-whitelist", "pvp", "online-mode", "motd", "level-name", "server-port", "enable-rcon", "rcon.port")
UNIT_PROPS = ["Id", "ActiveState", "SubState", "MainPID", "Result", "NRestarts", "UnitFileState", "InactiveEnterTimestamp"]


def _ring() -> deque:
    return deque([0.0] * config.HISTORY, maxlen=config.HISTORY)


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _friendly_time(ts: float | None) -> str:
    if not ts:
        return "Never"
    lt, now = time.localtime(ts), time.localtime()
    if lt.tm_yday == now.tm_yday and lt.tm_year == now.tm_year:
        return f"Today, {time.strftime('%H:%M', lt)}"
    if now.tm_yday - lt.tm_yday == 1 and lt.tm_year == now.tm_year:
        return f"Yesterday, {time.strftime('%H:%M', lt)}"
    return time.strftime("%b %d", lt)


def _parse_systemd_ts(v: str) -> float | None:
    if not v or v == "n/a":
        return None
    for fmt in ("%a %Y-%m-%d %H:%M:%S %Z", "%a %Y-%m-%d %H:%M:%S"):
        try:
            return time.mktime(time.strptime(v, fmt))
        except ValueError:
            continue
    return None


class Instance:
    def __init__(self, iid: str) -> None:
        self.id = iid
        self.dir = config.INSTANCES_DIR / iid
        self.env_path = config.INSTANCE_ENV_DIR / f"{iid}.env"
        self.service = f"wyzi-mc@{iid}.service"
        self.env: dict[str, str] = {}
        self.props: dict[str, str] = {}
        self.loader = "Unknown"
        self.mc = "?"
        self.mods = 0
        self.ops: set[str] = set()
        self.whitelist: list[str] = []
        self.java = "?"
        self.xmx = 0.0
        self.xms = 0.0
        # runtime
        self.unit: dict[str, str] = {}
        self.pid = 0
        self.proc: psutil.Process | None = None
        self.rss_gb = 0.0
        self.cpu = 0.0
        self.started_at: float | None = None
        self.pending: str | None = None  # 'starting' | 'stopping' while a helper call is in flight
        self.pending_since = 0.0
        self.start_step = 0
        self.done_seen = False
        self.rcon_ok = False
        self.ready = False
        self.ready_at: float | None = None
        self.tick_supported = True
        self.players: dict[str, str] = {}  # name -> joined HH:MM
        self.max_players = 0
        self.mspt = 0.0
        self.tps = 0.0
        self.last_online: float | None = None
        self.last_error: str | None = None
        self.disk_gb: float | None = None
        self.world_gb: float | None = None
        self.hist = {k: _ring() for k in ("tps", "mspt", "cpu", "ram", "players")}
        self.rcon = RconSession()
        self.console = Console(iid, self.dir / "logs" / "latest.log")
        self.console.on_line = self._on_log_line
        self.reload_config()

    # ───────────── config / static info ─────────────
    def reload_config(self) -> None:
        self.env = parse_env(_read(self.env_path))
        self.props = parse_properties(_read(self.dir / "server.properties"))
        self.xmx = size_to_gb(self.env.get("XMX")) or 0.0
        self.xms = size_to_gb(self.env.get("XMS")) or self.xmx
        self.max_players = int(self.props.get("max-players", "0") or 0)
        java = self.env.get("JAVA", "")
        self.java = java_version_for(java) if java else "?"
        self.loader, self.mc = self._detect_loader()
        mods = self.dir / "mods"
        self.mods = sum(1 for p in mods.iterdir() if p.suffix == ".jar") if mods.is_dir() else 0
        try:
            self.ops = {o.get("name", "") for o in json.loads(_read(self.dir / "ops.json") or "[]")}
        except ValueError:
            self.ops = set()
        try:
            self.whitelist = sorted(o.get("name", "") for o in json.loads(_read(self.dir / "whitelist.json") or "[]"))
        except ValueError:
            self.whitelist = []

    def _detect_loader(self) -> tuple[str, str]:
        if self.env.get("LOADER") and self.env.get("MC_VERSION"):
            return self.env["LOADER"], self.env["MC_VERSION"]
        libs = self.dir / "libraries"
        versions = sorted(p.name for p in (self.dir / "versions").iterdir()) if (self.dir / "versions").is_dir() else []
        mc = versions[-1] if versions else "?"

        def latest(p: Path) -> str | None:
            return sorted(x.name for x in p.iterdir())[-1] if p.is_dir() and any(p.iterdir()) else None

        if (v := latest(libs / "net/fabricmc/fabric-loader")):
            return f"Fabric {v}", mc
        if (v := latest(libs / "org/quiltmc/quilt-loader")):
            return f"Quilt {v}", mc
        if (v := latest(libs / "net/neoforged/neoforge")):
            return f"NeoForge {v}", mc
        if (v := latest(libs / "net/minecraftforge/forge")):
            mcv, _, fv = v.partition("-")
            return f"Forge {fv or v}", mcv or mc
        return ("Vanilla", mc) if mc != "?" else ("Unknown", "?")

    @property
    def name(self) -> str:
        return self.env.get("DISPLAY_NAME") or self.id.replace("-", " ").title()

    @property
    def port(self) -> int:
        try:
            return int(self.props.get("server-port", "25565"))
        except ValueError:
            return 25565

    @property
    def rcon_target(self) -> tuple[str, int, str] | None:
        if self.props.get("enable-rcon", "false").lower() != "true" or not self.props.get("rcon.password"):
            return None
        return (self.props.get("server-ip") or "127.0.0.1", int(self.props.get("rcon.port", "25575")), self.props["rcon.password"])

    @property
    def active_state(self) -> str:
        return self.unit.get("ActiveState", "inactive")

    @property
    def is_active(self) -> bool:
        return self.active_state in ("active", "activating", "reloading", "deactivating") or self.pending == "starting"

    @property
    def status(self) -> str:
        a = self.active_state
        if self.pending == "stopping" or a == "deactivating":
            return "stopping"
        if a == "failed" and self.pending != "starting":
            return "failed"
        if a in ("active", "reloading"):
            return "running" if self.ready else "starting"
        if a == "activating" or self.pending == "starting":
            return "starting"
        return "offline"

    # ───────────── log-driven state ─────────────
    def _on_log_line(self, line: dict) -> None:
        text = line["text"]
        if "Done (" in text and "For help" in text:
            self.done_seen = True
        elif "Starting minecraft server" in text or "Loading Minecraft" in text:
            self.start_step = max(self.start_step, 3)
        if line["level"] in ("warn", "error") and self.status in ("running", "starting"):
            hub.log(self.id, line["level"], text[:400])
        if text.endswith(" joined the game"):
            name = text[: -len(" joined the game")].split(" ")[-1]
            self.players[name] = hhmm()
            hub.activity_event(f"{name} joined {self.name}", "player")
        elif text.endswith(" left the game"):
            name = text[: -len(" left the game")].split(" ")[-1]
            self.players.pop(name, None)

    # ───────────── API shape (matches the frontend Server type) ─────────────
    def to_api(self, playit: dict | None = None) -> dict:
        status = self.status
        live = status == "running"
        tunnel = None
        if playit:
            tunnel = next((t for t in playit.get("tunnels", []) if t.get("localPort") == self.port), None)
        return {
            "id": self.id,
            "name": self.name,
            "desc": self.env.get("INSTANCE_DESC", ""),
            "deployed": True,
            "loader": self.loader,
            "mc": self.mc,
            "mods": self.mods,
            "port": self.port,
            "tunnelPort": (tunnel or {}).get("publicPort") or 0,
            "publicAddress": (tunnel or {}).get("copyAddress"),
            "ramAlloc": self.xmx,
            "ramMin": self.xms,
            "footprint": memory.footprint_gb(self.xmx),
            "ramUsed": round(self.rss_gb, 2),
            "status": status,
            "startStep": self._step(),
            "players": [
                {"name": n, "joined": j, "ping": None, "dimension": None, "op": n in self.ops} for n, j in sorted(self.players.items())
            ] if live else [],
            "maxPlayers": self.max_players,
            "tps": round(self.tps, 2) if live else 0,
            "mspt": round(self.mspt) if live else 0,
            "tickSupported": self.tick_supported,
            "cpu": round(self.cpu) if self.pid else 0,
            "uptime": (time.time() - self.started_at) if self.started_at and self.pid else 0,
            "wakeOnConnect": False,
            "autoStop": False,
            "worldSize": f"{self.world_gb:.1f} GB" if self.world_gb is not None else "—",
            "diskSize": round(self.disk_gb, 1) if self.disk_gb is not None else 0,
            "java": self.java,
            "javaPath": self.env.get("JAVA", ""),
            "jvmFlags": self.env.get("JVM_FLAGS", ""),
            "heavy": self.env.get("HEAVY", "no") == "yes",
            "lastOnline": "Now" if self.pid else _friendly_time(self.last_online or self._log_mtime()),
            "enabled": self.unit.get("UnitFileState") == "enabled",
            "unitResult": self.unit.get("Result"),
            "restarts": int(self.unit.get("NRestarts", "0") or 0),
            "lastError": self.last_error,
            "path": str(self.dir),
            "service": self.service,
            "rcon": self.rcon_target is not None,
            "backup": {
                "keep": int(self.env.get("BACKUP_KEEP", "14") or 14),
                "keepManual": int(self.env.get("BACKUP_KEEP_MANUAL", "20") or 20),
                "excludes": self.env.get("BACKUP_EXCLUDES", ""),
            },
            "whitelist": self.whitelist,
            "properties": {k: self.props[k] for k in PUBLIC_PROPS if k in self.props},
            "hist": {k: [round(x, 2) for x in v] for k, v in self.hist.items()},
        }

    def _log_mtime(self) -> float | None:
        try:
            return (self.dir / "logs" / "latest.log").stat().st_mtime
        except OSError:
            return None

    def _step(self) -> int:
        if self.status == "running":
            return STARTUP_STEPS - 1
        if self.status != "starting":
            return 0
        a = self.active_state
        if a in ("active", "reloading"):
            if self.done_seen:
                return 4
            return max(2, self.start_step)
        if a == "activating":
            return 1
        return 0


class InstanceManager:
    def __init__(self) -> None:
        self.instances: dict[str, Instance] = {}
        self.cpu_count = psutil.cpu_count() or 1
        self.ark_gb = 0.0
        self.ark_active: list[str] = []
        self._polls = 0

    # ───────────── discovery ─────────────
    def discover(self) -> None:
        found = set()
        if config.INSTANCE_ENV_DIR.is_dir():
            for env in config.INSTANCE_ENV_DIR.glob("*.env"):
                iid = env.stem
                if config.INSTANCE_ID_RE.match(iid) and (config.INSTANCES_DIR / iid).is_dir():
                    found.add(iid)
        for iid in found - self.instances.keys():
            self.instances[iid] = Instance(iid)
            log.info("discovered instance %s", iid)
        for iid in set(self.instances) - found:
            if not self.instances[iid].pid:
                self.instances.pop(iid).rcon.close()
        for inst in self.instances.values():
            inst.reload_config()

    def get(self, iid: str) -> Instance:
        if not config.INSTANCE_ID_RE.match(iid or "") or iid not in self.instances:
            raise KeyError(iid)
        return self.instances[iid]

    def planned(self, planned_cfg: list[dict]) -> list[dict]:
        out = []
        for p in planned_cfg:
            iid = p.get("id", "")
            if iid in self.instances or not config.INSTANCE_ID_RE.match(iid):
                continue
            out.append({"id": iid, "name": p.get("name") or iid.title(), "deployed": False, "status": "undeployed",
                        "path": str(config.INSTANCES_DIR / iid), "service": f"wyzi-mc@{iid}.service"})
        return out

    # ───────────── polling ─────────────
    async def poll(self) -> None:
        self._polls += 1
        if self._polls % 20 == 0:
            await asyncio.to_thread(self.discover)
        if not self.instances:
            return
        units = await self._show_units([i.service for i in self.instances.values()])
        for inst in self.instances.values():
            prev_state, prev_status = inst.active_state, inst.status
            inst.unit = units.get(inst.service, {})
            self._update_process(inst)
            self._transitions(inst, prev_state, prev_status)
            inst.console.poll()
            self._record(inst)
        await self._poll_ark()

    async def _show_units(self, names: list[str]) -> dict[str, dict]:
        out = await run_cmd(["systemctl", "show", *names, "--no-pager", *[f"-p{p}" for p in UNIT_PROPS]])
        res: dict[str, dict] = {}
        cur: dict[str, str] = {}
        for line in out.splitlines() + [""]:
            if not line.strip():
                if cur.get("Id"):
                    res[cur["Id"]] = cur
                cur = {}
                continue
            k, _, v = line.partition("=")
            cur[k] = v
        return res

    async def _poll_ark(self) -> None:
        out = await run_cmd(["systemctl", "list-units", "--no-legend", "--plain", "--state=active,activating", "ark-server@*.service"])
        names = [ln.split()[0] for ln in out.splitlines() if ln.strip()]
        self.ark_active = names
        total = 0.0
        for n in names:
            v = (await run_cmd(["systemctl", "show", n, "-pMemoryCurrent", "--value"])).strip()
            total += int(v) / 1024**3 if v.isdigit() else 0
        self.ark_gb = total

    def _update_process(self, inst: Instance) -> None:
        pid = int(inst.unit.get("MainPID", "0") or 0)
        if pid != inst.pid:
            inst.pid = pid
            inst.proc = None
            if pid:
                try:
                    inst.proc = psutil.Process(pid)
                    inst.proc.cpu_percent(None)
                    inst.started_at = inst.proc.create_time()
                except psutil.Error:
                    inst.proc = None
            else:
                inst.started_at = None
        if inst.proc:
            try:
                inst.rss_gb = inst.proc.memory_info().rss / 1024**3
                inst.cpu = inst.proc.cpu_percent(None) / self.cpu_count
            except psutil.Error:
                inst.proc, inst.rss_gb, inst.cpu = None, 0.0, 0.0
        else:
            inst.rss_gb, inst.cpu = 0.0, 0.0

    def _transitions(self, inst: Instance, prev_state: str, prev_status: str) -> None:
        a = inst.active_state
        # pending markers clear once systemd reflects the request
        if inst.pending == "starting" and (a in ("active", "activating", "failed") and time.time() - inst.pending_since > 1):
            inst.pending = None
        if inst.pending == "stopping" and a in ("inactive", "failed"):
            inst.pending = None
        if prev_state in ("inactive", "failed") and a in ("activating", "active"):
            inst.done_seen = inst.ready = inst.rcon_ok = False
            inst.start_step = 1
            inst.console.push("sys", f"systemd: {inst.service} started (pid {inst.unit.get('MainPID')})")
        if a not in ("active", "reloading", "activating", "deactivating") and prev_state in ("active", "reloading", "activating", "deactivating"):
            inst.ready = inst.done_seen = inst.rcon_ok = False
            inst.players.clear()
            inst.last_online = time.time()
            inst.rcon.close()
            if a == "failed":
                res = inst.unit.get("Result", "failed")
                inst.last_error = f"Process exited ({res})"
                inst.console.push("error", f"systemd: {inst.service} failed ({res})")
                hub.activity_event(f"{inst.name} failed", "warn", f"systemd result: {res}")
                hub.log("system", "error", f"{inst.service} failed: {res}")
                hub.toast(f"{inst.name} stopped unexpectedly", "error", f"systemd result: {res}")
            else:
                inst.console.push("sys", f"systemd: {inst.service} stopped")
                hub.activity_event(f"{inst.name} stopped", "stop", f"Freed {inst.xmx:g} GB")
                hub.log("system", "info", f"Stopped {inst.service}")
        if inst.status == "running" and prev_status != "running":
            inst.ready_at = time.time()
            took = (inst.ready_at - inst.started_at) if inst.started_at else None
            detail = f"Ready in {took:.1f}s" if took else None
            hub.activity_event(f"{inst.name} started", "start", detail)
            hub.log("system", "info", f"{inst.service} ready{f' after {took:.1f}s' if took else ''}")
            hub.toast(f"{inst.name} is running", "success", f"Listening on port {inst.port}")
            inst.console.push("sys", f"Ready · accepting players on port {inst.port}")

    def _record(self, inst: Instance) -> None:
        if inst.status in ("running", "starting", "stopping"):
            live = inst.status == "running"
            inst.hist["tps"].append(inst.tps if live else 0)
            inst.hist["mspt"].append(inst.mspt if live else 0)
            inst.hist["cpu"].append(inst.cpu)
            inst.hist["ram"].append(inst.rss_gb)
            inst.hist["players"].append(len(inst.players) if live else 0)

    async def rcon_loop(self) -> None:
        while True:
            for inst in list(self.instances.values()):
                if inst.active_state not in ("active", "reloading"):
                    continue
                target = inst.rcon_target
                if target is None:
                    inst.ready = inst.done_seen
                    continue
                if not inst.ready and not inst.done_seen and inst.pid and inst.started_at and time.time() - inst.started_at < 5:
                    continue
                try:
                    resp = await asyncio.to_thread(inst.rcon.command, *target, "list")
                    parsed = parse_list(resp)
                    if parsed:
                        _, inst.max_players, names = parsed
                        now = hhmm()
                        inst.players = {n: inst.players.get(n, now) for n in names}
                    inst.rcon_ok = True
                    inst.ready = True
                    if inst.tick_supported:
                        tq = await asyncio.to_thread(inst.rcon.command, *target, "tick query")
                        mspt = parse_tick_query(tq)
                        if mspt is None:
                            if "Unknown" in tq or "incomplete" in tq:
                                inst.tick_supported = False
                        else:
                            inst.mspt = mspt
                            inst.tps = min(20.0, 1000.0 / mspt) if mspt > 0 else 20.0
                except RconError:
                    inst.rcon_ok = False
            await asyncio.sleep(config.RCON_INTERVAL)

    # ───────────── actions ─────────────
    def snapshot(self, playit: dict | None, planned_cfg: list[dict]) -> list[dict]:
        return [i.to_api(playit) for i in sorted(self.instances.values(), key=lambda x: x.name)] + self.planned(planned_cfg)

    async def start(self, inst: Instance, stop_first: list[Instance]) -> None:
        inst.pending, inst.pending_since, inst.start_step = "starting", time.time(), 0
        inst.last_error = None
        hub.log("portal", "info", f"start requested: {inst.id} (Xmx {inst.xmx:g} GB)")
        inst.console.push("sys", f"Start requested · {inst.java} · -Xms{inst.xms:g}G -Xmx{inst.xmx:g}G")
        try:
            for other in stop_first:
                inst.console.push("sys", f"Stopping {other.name} first to free memory")
                await self.stop(other, quiet=True)
            await run_helper("start", inst.id, timeout=420)
        except HelperError as e:
            inst.pending = None
            inst.last_error = str(e)
            inst.console.push("error", f"Start failed: {e}")
            hub.log("portal", "error", f"start {inst.id} failed: {e}")
            hub.toast(f"Could not start {inst.name}", "error", str(e))

    async def stop(self, inst: Instance, quiet: bool = False) -> None:
        inst.pending, inst.pending_since = "stopping", time.time()
        hub.log("portal", "info", f"stop requested: {inst.id}")
        inst.console.push("sys", "Stop requested · saving world before shutdown")
        try:
            await run_helper("stop", inst.id, timeout=330)
        except HelperError as e:
            inst.pending = None
            inst.console.push("error", f"Stop failed: {e}")
            hub.log("portal", "error", f"stop {inst.id} failed: {e}")
            if not quiet:
                hub.toast(f"Could not stop {inst.name}", "error", str(e))
            raise

    async def restart(self, inst: Instance) -> None:
        try:
            await self.stop(inst, quiet=True)
        except HelperError:
            return
        await self.start(inst, [])

    async def command(self, inst: Instance, raw: str) -> str:
        cmd = validate_command(raw)
        inst.console.push("cmd", f"> {cmd}", thread="console")
        if inst.status != "running":
            inst.console.push("error", "Server is not running. Command was not delivered.", thread="wyzi-portal")
            return ""
        target = inst.rcon_target
        if target is None:
            inst.console.push("error", "RCON is disabled for this instance; commands cannot be delivered.")
            return ""
        try:
            resp = await asyncio.to_thread(inst.rcon.command, *target, cmd)
        except RconError as e:
            inst.console.push("error", f"RCON error: {e}")
            return ""
        for line in (resp or "").splitlines() or ([] if not resp else [resp]):
            inst.console.push("info", line, thread="rcon")
        return resp


manager = InstanceManager()
