"""The only path to root: `sudo -n /usr/local/sbin/wyzi-helper <action> [args]`.

Arguments are passed as an argv list (never through a shell) and are validated
here *and* again by the helper itself."""
from __future__ import annotations

import asyncio
import logging

from . import config

log = logging.getLogger("wyzi.helper")

ALLOWED = {
    "list", "status", "start", "stop", "restart", "enable", "disable", "logs",
    "backup", "backups", "backup-logs", "restore", "playit", "ark",
}


class HelperError(Exception):
    def __init__(self, message: str, code: int | None = None):
        super().__init__(message)
        self.code = code


async def run_helper(action: str, *args: str, timeout: float = 30.0) -> str:
    if action not in ALLOWED:
        raise HelperError(f"action '{action}' is not allowed")
    if not config.HELPER_ENABLED:
        raise HelperError("privileged helper is disabled in this environment")
    argv = ["sudo", "-n", config.HELPER, action, *args]
    log.info("helper %s %s", action, " ".join(args))
    proc = await asyncio.create_subprocess_exec(
        *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, stdin=asyncio.subprocess.DEVNULL
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise HelperError(f"helper '{action}' timed out after {timeout:.0f}s")
    if proc.returncode != 0:
        msg = (err.decode(errors="replace").strip() or out.decode(errors="replace").strip() or "helper failed").splitlines()[-1]
        raise HelperError(msg, proc.returncode)
    return out.decode(errors="replace")


async def run_cmd(argv: list[str], timeout: float = 10.0) -> str:
    """Run an unprivileged, read-only system command (systemctl show, apt list ...)."""
    proc = await asyncio.create_subprocess_exec(
        *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, stdin=asyncio.subprocess.DEVNULL
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return ""
    return out.decode(errors="replace")


async def systemctl_show(unit: str, props: list[str]) -> dict[str, str]:
    out = await run_cmd(["systemctl", "show", unit, "--no-pager", *[f"-p{p}" for p in props]])
    res: dict[str, str] = {}
    for line in out.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            res[k] = v
    return res
