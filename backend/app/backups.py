"""Backups on the bulk HDD, produced by /opt/wyzi-server/bin/wyzi-backup.

The portal never writes archives itself: manual backups and restores go through
wyzi-helper (backup → transient systemd unit running as minecraft; restore → the
non-destructive wyzi-restore, which moves the current instance aside)."""
from __future__ import annotations

import asyncio
import os
import re
import time

from . import config
from .events import hub
from .helper import HelperError, run_cmd, run_helper
from .instances import Instance, manager

LABEL_TYPE = {"scheduled": "Automatic", "manual": "Manual", "pre-restore": "Pre-restore", "pre-stop": "Pre-stop"}
BACKUP_STEPS = 7  # frontend checklist length


def _archive_re(iid: str) -> re.Pattern:
    return re.compile(config.ARCHIVE_RE_TMPL.format(id=re.escape(iid)))


def _when(ts: float) -> str:
    lt, now = time.localtime(ts), time.localtime()
    if lt.tm_year == now.tm_year and lt.tm_yday == now.tm_yday:
        return f"Today, {time.strftime('%H:%M', lt)}"
    if lt.tm_year == now.tm_year and now.tm_yday - lt.tm_yday == 1:
        return f"Yesterday, {time.strftime('%H:%M', lt)}"
    days = int((time.time() - ts) // 86400)
    return f"{days} days ago" if days < 7 else time.strftime("%b %d", lt)


def list_backups() -> list[dict]:
    out = []
    root = config.BACKUP_DIR
    if not root.is_dir():
        return out
    for d in root.iterdir():
        iid = d.name
        if not d.is_dir() or not config.INSTANCE_ID_RE.match(iid):
            continue
        rx = _archive_re(iid)
        try:
            entries = list(os.scandir(d))
        except OSError:
            continue
        names = {e.name for e in entries}
        for e in entries:
            m = rx.match(e.name)
            if not m:
                continue
            ts = time.mktime(time.strptime(m.group(1), "%Y%m%dT%H%M%SZ")) - time.timezone
            st = e.stat()
            out.append({
                "id": e.name,
                "serverId": iid,
                "when": _when(ts),
                "date": time.strftime("%Y-%m-%d %H:%M", time.localtime(ts)),
                "ts": ts,
                "size": round(st.st_size / 1024**3, 2),
                "bytes": st.st_size,
                "type": LABEL_TYPE.get(m.group(2), m.group(2).title()),
                "label": m.group(2),
                "status": "success",
                "checksum": "present" if f"{e.name}.sha256" in names else "missing",
                "duration": "—",
            })
    return sorted(out, key=lambda b: -b["ts"])


class BackupJobs:
    def __init__(self) -> None:
        self.job: dict | None = None
        self.failed: list[dict] = []
        self.durations: dict[str, str] = {}
        self._task: asyncio.Task | None = None
        self.on_failure: list = []  # callbacks(inst, label, error) — used by notifications

    def snapshot(self) -> dict | None:
        return self.job

    async def start(self, inst: Instance, label: str = "manual") -> asyncio.Future:
        """Start a backup through wyzi-helper. Returns a future resolving to True/False
        (archive written or not) so callers such as auto-stop and the scheduler can wait."""
        if label not in ("manual", "scheduled", "pre-stop"):
            raise HelperError("invalid backup label")
        if self.job:
            raise HelperError("another backup or restore is already running")
        before = {b["id"] for b in list_backups() if b["serverId"] == inst.id}
        prior = [b for b in list_backups() if b["serverId"] == inst.id]
        expected = prior[0]["bytes"] if prior else max(1, int((inst.disk_gb or 0.5) * 0.4 * 1024**3))
        kind = LABEL_TYPE.get(label, label.title())
        self.job = {"serverId": inst.id, "kind": "backup", "type": kind, "label": label, "progress": 0.0, "step": 0, "startedAt": time.time()}
        hub.log("backup", "info", f"job {inst.id} {label} started")
        if inst.status == "running":
            inst.console.push("sys", "Backup started · world saving paused while the archive is written")
        try:
            await run_helper("backup", inst.id, label, timeout=30)
        except HelperError as e:
            self.job = None
            hub.log("backup", "error", f"job {inst.id} could not start: {e}")
            self._notify_failure(inst, label, str(e))
            raise
        done: asyncio.Future = asyncio.get_running_loop().create_future()
        self._task = asyncio.create_task(self._watch(inst, before, expected, label, done))  # referenced via self._task
        return done

    async def start_manual(self, inst: Instance) -> None:
        await self.start(inst, "manual")

    def _notify_failure(self, inst: Instance, label: str, error: str) -> None:
        for cb in self.on_failure:
            try:
                cb(inst, label, error)
            except Exception:  # notifications must never break the job runner
                pass

    async def _watch(self, inst: Instance, before: set[str], expected: int, label: str, done: asyncio.Future) -> None:
        d = config.BACKUP_DIR / inst.id
        t0 = self.job["startedAt"] if self.job else time.time()
        seen_unit = False
        ok = False
        try:
            while True:
                await asyncio.sleep(1.0)
                partial = next(iter(d.glob(".*.partial")), None) if d.is_dir() else None
                new = [b for b in list_backups() if b["serverId"] == inst.id and b["id"] not in before]
                # unit name: wyzi-backup-<label>-<id>-<UTC>
                units = await run_cmd(["systemctl", "list-units", "--all", "--no-legend", "--plain", f"wyzi-backup-*-{inst.id}-2*"])
                running = any(" active " in f" {ln} " or "activating" in ln for ln in units.splitlines())
                seen_unit = seen_unit or running
                job = self.job
                if job is None:
                    return
                elapsed = time.time() - t0
                if partial is not None:
                    size = partial.stat().st_size if partial.exists() else 0
                    job["progress"] = min(0.95, 0.05 + 0.9 * size / max(1, expected))
                    job["step"] = 3 if job["progress"] < 0.6 else 4
                elif new and new[0]["checksum"] == "present":
                    job.update(progress=1.0, step=6)
                    dur = time.time() - t0
                    self.durations[new[0]["id"]] = f"{int(dur // 60)}m {int(dur % 60):02d}s"
                    what = {"scheduled": "Scheduled backup", "pre-stop": "Pre-stop backup"}.get(label, "Backup")
                    hub.activity_event(f"{what} completed", "backup", f"{inst.name} · {new[0]['size']} GB")
                    hub.log("backup", "info", f"job {inst.id} {label} finished size={new[0]['size']}GiB sha256=ok")
                    if label == "manual":
                        hub.toast("Backup completed", "success", f"{inst.name} · {new[0]['size']} GB written to /srv/storage")
                    if inst.status == "running":
                        inst.console.push("sys", "Backup finished · world saving resumed")
                    ok = True
                    return
                elif new:
                    job.update(progress=0.97, step=5)
                else:
                    job["step"] = 0 if elapsed < 1.5 else 1
                if not running and (seen_unit or elapsed > 10) and not new:
                    raise HelperError(await self._last_error(inst))
                if elapsed > 3600:
                    raise HelperError("backup did not finish within an hour")
        except HelperError as e:
            self.failed.insert(0, {"id": f"failed-{int(t0)}", "serverId": inst.id, "when": _when(t0), "date": time.strftime("%Y-%m-%d %H:%M", time.localtime(t0)),
                                   "ts": t0, "size": 0, "type": LABEL_TYPE.get(label, label.title()), "status": "failed", "duration": "—", "note": str(e), "checksum": "missing"})
            hub.activity_event("Backup failed", "warn", f"{inst.name} · {e}")
            hub.log("backup", "error", f"job {inst.id} {label} failed: {e}")
            hub.toast("Backup failed", "error", str(e))
            self._notify_failure(inst, label, str(e))
        finally:
            await asyncio.sleep(0.6)
            self.job = None
            if not done.done():
                done.set_result(ok)
            hub.send({"type": "backups", "backups": self.all(), "job": None})

    async def _last_error(self, inst: Instance) -> str:
        try:
            out = await run_helper("backup-logs", inst.id, "30")
        except HelperError:
            return "backup unit exited without producing an archive"
        errs = [ln for ln in out.splitlines() if "wyzi-backup:" in ln and ("refus" in ln or "fail" in ln or "not " in ln)]
        return errs[-1].split("wyzi-backup:", 1)[1].strip() if errs else "backup unit exited without producing an archive"

    async def restore(self, inst: Instance, archive: str) -> None:
        if self.job:
            raise HelperError("another backup or restore is already running")
        if inst.status != "offline" and inst.status != "failed":
            raise HelperError(f"{inst.name} must be stopped before restoring")
        if not _archive_re(inst.id).match(archive) or not (config.BACKUP_DIR / inst.id / archive).is_file():
            raise HelperError("unknown archive")
        self.job = {"serverId": inst.id, "kind": "restore", "type": "Restore", "archive": archive, "progress": 0.1, "step": 2, "startedAt": time.time()}
        hub.log("backup", "info", f"restore {inst.id} from {archive} started")
        inst.console.push("sys", f"Restore started from {archive} · current files are moved aside, not deleted")
        try:
            out = await run_helper("restore", inst.id, archive, timeout=3600)
            kept = next((ln.split("kept at:", 1)[1].strip() for ln in out.splitlines() if "kept at:" in ln), None)
            hub.activity_event(f"{inst.name} restored", "backup", archive)
            hub.log("backup", "info", f"restore {inst.id} finished; previous state kept at {kept}")
            hub.toast(f"{inst.name} restored", "success", f"Previous files kept at {kept}" if kept else archive)
            inst.console.push("sys", f"Restore complete. Previous files kept at {kept}")
            await asyncio.to_thread(inst.reload_config)
        except HelperError as e:
            hub.log("backup", "error", f"restore {inst.id} failed: {e}")
            hub.toast("Restore failed", "error", str(e))
            inst.console.push("error", f"Restore failed: {e}")
        finally:
            self.job = None
            hub.send({"type": "backups", "backups": self.all(), "job": None})

    def all(self) -> list[dict]:
        items = list_backups()
        for b in items:
            b["duration"] = self.durations.get(b["id"], "—")
        return sorted(items + self.failed[:20], key=lambda b: -b["ts"])

    async def schedule(self) -> dict:
        """Per-instance timer state and retention (read-only; changing it needs root)."""
        res = {}
        for inst in manager.instances.values():
            out = await run_cmd(["systemctl", "show", f"wyzi-backup@{inst.id}.timer", "--no-pager",
                                 "-pUnitFileState", "-pActiveState", "-pNextElapseUSecRealtime", "-pLastTriggerUSec"])
            props = dict(ln.split("=", 1) for ln in out.splitlines() if "=" in ln)
            res[inst.id] = {
                "enabled": props.get("UnitFileState") == "enabled",
                "active": props.get("ActiveState") == "active",
                "next": props.get("NextElapseUSecRealtime") or None,
                "last": props.get("LastTriggerUSec") or None,
                "keep": int(inst.env.get("BACKUP_KEEP", "14") or 14),
                "keepManual": int(inst.env.get("BACKUP_KEEP_MANUAL", "20") or 20),
            }
        return res


jobs = BackupJobs()


def backup_dir_size(iid: str) -> int:
    d = config.BACKUP_DIR / iid
    try:
        return sum(e.stat().st_size for e in os.scandir(d) if e.is_file())
    except OSError:
        return 0
