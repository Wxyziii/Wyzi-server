"""Background automation: scheduled backups, auto-stop of empty servers, alert evaluation.

Everything privileged still goes through wyzi-helper (backup <id> <label>, stop <id>)."""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import psutil

from . import config
from .backups import jobs
from .events import hub
from .helper import HelperError
from .instances import Instance, manager
from .notify import notifier
from .settings_store import settings
from .wake import wake

log = logging.getLogger("wyzi.automation")

CATCH_UP_HOURS = 12


def _tz(name: str | None) -> dt.tzinfo:
    try:
        return ZoneInfo(name) if name else dt.timezone.utc
    except (ZoneInfoNotFoundError, ValueError):
        return dt.timezone.utc


def last_slot(hhmm: str, tz: dt.tzinfo, now: dt.datetime) -> dt.datetime:
    """Most recent occurrence of HH:MM (in tz) at or before `now`."""
    h, m = map(int, hhmm.split(":"))
    local = now.astimezone(tz)
    slot = local.replace(hour=h, minute=m, second=0, microsecond=0)
    if slot > local:
        slot -= dt.timedelta(days=1)
    return slot


def next_slot(hhmm: str, tz: dt.tzinfo, now: dt.datetime) -> dt.datetime:
    return last_slot(hhmm, tz, now) + dt.timedelta(days=1)


class Automation:
    def __init__(self) -> None:
        self.empty_since: dict[str, float] = {}
        self.auto_stopping: set[str] = set()
        self.scheduled_running: set[str] = set()

    # ───────── annotations for the instance API ─────────
    def annotate(self, d: dict, inst: Instance) -> None:
        cfg = settings.instance(inst.id)
        d["automation"] = cfg
        a = cfg["autoStop"]
        es = self.empty_since.get(inst.id)
        d["autoStopAt"] = (es + a["minutes"] * 60) if (a["enabled"] and es and d["status"] == "running") else None
        d["autoStopping"] = inst.id in self.auto_stopping
        d["wakeOnConnect"] = cfg["wake"]["enabled"]
        d["autoStop"] = a["enabled"]
        if wake.sleeping(inst.id) and d["status"] == "offline":
            d["status"] = "sleeping"
        sc = cfg["schedule"]
        d["backupSchedule"] = {
            **sc,
            "next": next_slot(sc["time"], _tz(sc.get("tz")), dt.datetime.now(dt.timezone.utc)).timestamp() if sc["enabled"] else None,
            "last": settings.state(f"sched_last:{inst.id}"),
        }

    # ───────── auto-stop ─────────
    async def auto_stop_tick(self) -> None:
        now = time.time()
        for inst in list(manager.instances.values()):
            cfg = settings.instance(inst.id)["autoStop"]
            if inst.id in self.auto_stopping:
                continue
            if not cfg["enabled"] or inst.status != "running":
                self.empty_since.pop(inst.id, None)
                continue
            if not inst.rcon_ok:
                continue  # player count unknown: never stop on a guess
            if inst.players:
                self.empty_since.pop(inst.id, None)
                continue
            start = self.empty_since.setdefault(inst.id, max(now, inst.ready_at or now))
            if now - start >= cfg["minutes"] * 60:
                self.auto_stopping.add(inst.id)
                asyncio.create_task(self._auto_stop(inst, cfg))

    async def _auto_stop(self, inst: Instance, cfg: dict) -> None:
        try:
            inst.console.push("sys", f"Auto-stop: no players for {cfg['minutes']} min")
            hub.log("portal", "info", f"auto-stop {inst.id}: empty for {cfg['minutes']} min")
            if cfg["backupFirst"]:
                for _ in range(120):  # wait up to 10 min for another job
                    if not jobs.job:
                        break
                    await asyncio.sleep(5)
                try:
                    done = await jobs.start(inst, "pre-stop")
                    await done
                except HelperError as e:
                    inst.console.push("error", f"Pre-stop backup failed: {e} — stopping anyway")
            if inst.players or inst.status != "running":
                inst.console.push("sys", "Auto-stop cancelled: a player joined")
                return
            await manager.stop(inst, quiet=True)
            hub.activity_event(f"{inst.name} auto-stopped", "stop", f"No players for {cfg['minutes']} min")
            notifier.event("autoStop", f"autostop:{inst.id}", f"{inst.name} stopped (idle)", f"No players for {cfg['minutes']} minutes.", "low", ["zzz"])
        except HelperError as e:
            hub.log("portal", "error", f"auto-stop {inst.id} failed: {e}")
        finally:
            self.auto_stopping.discard(inst.id)
            self.empty_since.pop(inst.id, None)

    # ───────── scheduled backups ─────────
    def mark_ran(self) -> None:
        for inst in manager.instances.values():
            if inst.status in ("running", "starting") and not settings.state(f"ran:{inst.id}", False):
                settings.set_state(f"ran:{inst.id}", True)

    async def schedule_tick(self) -> None:
        now = dt.datetime.now(dt.timezone.utc)
        for inst in list(manager.instances.values()):
            sc = settings.instance(inst.id)["schedule"]
            if not sc["enabled"] or inst.id in self.scheduled_running:
                continue
            slot = last_slot(sc["time"], _tz(sc.get("tz")), now)
            last = settings.state(f"sched_last:{inst.id}") or 0
            if slot.timestamp() <= last:
                continue
            if (now - slot).total_seconds() > CATCH_UP_HOURS * 3600:
                settings.set_state(f"sched_last:{inst.id}", slot.timestamp())  # too late; wait for the next slot
                continue
            if sc["onlyIfRan"] and not settings.state(f"ran:{inst.id}", True):
                settings.set_state(f"sched_last:{inst.id}", slot.timestamp())
                hub.log("backup", "info", f"scheduled backup of {inst.id} skipped: server did not run since the last one")
                continue
            if jobs.job or inst.status in ("starting", "stopping"):
                continue  # try again on the next tick
            self.scheduled_running.add(inst.id)
            asyncio.create_task(self._scheduled(inst, slot.timestamp()))

    def reset_schedule(self, iid: str) -> None:
        sc = settings.instance(iid)["schedule"]
        slot = last_slot(sc["time"], _tz(sc.get("tz")), dt.datetime.now(dt.timezone.utc))
        settings.set_state(f"sched_last:{iid}", max(slot.timestamp(), settings.state(f"sched_last:{iid}") or 0))

    async def _scheduled(self, inst: Instance, slot_ts: float) -> None:
        try:
            settings.set_state(f"sched_last:{inst.id}", slot_ts)
            ran_now = inst.status in ("running", "starting")
            done = await jobs.start(inst, "scheduled")
            if await done:
                settings.set_state(f"ran:{inst.id}", ran_now)
        except HelperError as e:
            hub.log("backup", "error", f"scheduled backup of {inst.id} could not start: {e}")
        finally:
            self.scheduled_running.discard(inst.id)

    # ───────── alerts ─────────
    async def alerts_tick(self, mem: dict, playit: dict | None) -> None:
        cfg = settings.get("notify")
        headroom = float(settings.get("safetyHeadroom"))
        low_ram = mem["available"] < headroom
        notifier.condition(
            "ramPressure", "ram", low_ram or mem.get("swapUsed", 0) > 1.0,
            "Low memory on the server",
            f"MemAvailable {mem['available']:.1f} GB (reserve {headroom:.1f} GB), swap used {mem.get('swapUsed', 0):.1f} GB.",
            hold=60, priority="high", tags=["warning"],
            resolved=f"Memory back to normal: {mem['available']:.1f} GB available.",
        )
        for vol in config.VOLUMES:
            try:
                pct = psutil.disk_usage(vol["mount"]).percent
            except OSError:
                continue
            notifier.condition(
                "diskPressure", f"disk:{vol['id']}", pct >= cfg["diskPercent"],
                f"Disk {vol['mount']} is {pct:.0f}% full",
                f"{vol['role']} — threshold {cfg['diskPercent']}%.",
                hold=120, priority="high", tags=["floppy_disk"],
                resolved=f"{vol['mount']} is at {pct:.0f}%.",
            )
        try:
            smart = json.loads(config.SMART_STATUS_FILE.read_text()).get("disks", {})
        except (OSError, ValueError):
            smart = {}
        for name, d in smart.items():
            if "error" in d:
                continue
            base_key = f"smart_base:{name}"
            base = settings.state(base_key)
            realloc = d.get("reallocated") or 0
            if base is None:
                settings.set_state(base_key, realloc)
                base = realloc
            bad = d.get("passed") is False or (d.get("pending") or 0) > 0 or (d.get("offline_uncorrectable") or 0) > 0 or realloc > base
            notifier.condition(
                "smart", f"smart:{name}", bad,
                f"Disk health warning: {d.get('model') or name}",
                f"SMART {'FAILED' if d.get('passed') is False else 'passed'} · reallocated {realloc} (was {base}) · pending {d.get('pending')} · uncorrectable {d.get('offline_uncorrectable')}. Check backups.",
                priority="urgent", tags=["rotating_light"],
                resolved=f"{d.get('model') or name}: SMART values back to baseline.",
            )
        if playit is not None:
            down = playit.get("service") != "running" or playit.get("agent") != "online" or playit.get("stale")
            notifier.condition(
                "playitOffline", "playit", down,
                "Playit tunnel offline",
                f"Agent: {playit.get('agent')}, service: {playit.get('service')}{' (status stale)' if playit.get('stale') else ''}. Players cannot connect from outside.",
                hold=120, priority="high", tags=["electric_plug"],
                resolved="Playit tunnel is back online.",
            )

    # ───────── wiring ─────────
    def on_instance_event(self, kind: str, inst: Instance, detail: str) -> None:
        if kind == "crash":
            oom = "oom" in detail
            loop = "start-limit" in detail
            title = f"{inst.name} {'was killed: out of memory' if oom else 'crash-looped and was stopped' if loop else 'crashed'}"
            notifier.event("crash", f"crash:{inst.id}", title, f"systemd result: {detail}. Open the portal for the console log.", "urgent" if (oom or loop) else "high", ["boom"])
        elif kind == "startFailed":
            notifier.event("startFailed", f"start:{inst.id}", f"{inst.name} failed to start", detail, "high", ["x"])

    def on_backup_failure(self, inst: Instance, label: str, error: str) -> None:
        notifier.event("backupFailed", f"backup:{inst.id}:{label}", f"{label.title()} backup of {inst.name} failed", error, "high", ["floppy_disk", "x"])


automation = Automation()


def wire() -> None:
    manager.listeners.append(automation.on_instance_event)
    manager.annotate = automation.annotate
    jobs.on_failure.append(automation.on_backup_failure)
