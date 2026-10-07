"""Single-admin login: Argon2id password hash + server-side sessions.

- The hash lives in data/admin.hash (0660, owner marcel or wyziportal, group wyziportal) together
  with an `epoch`; sessions created before the epoch are invalid, so setting a new password
  (CLI or UI) signs every browser out.
- Set it on the server, as marcel:   cd /opt/wyzi-server/portal/backend && .venv/bin/python -m app.admin set-password
- Sessions: 256-bit random token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 is
  stored. 7 days sliding, 30 days absolute. `Secure` is added when WYZI_COOKIE_SECURE=1 (HTTPS).
- Failed logins are rate limited per client IP and globally."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
import time

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from . import config
from .settings_store import settings

COOKIE = "wyzi_session"
SLIDING = 7 * 86400
ABSOLUTE = 30 * 86400
MIN_PASSWORD = 10
COOKIE_SECURE = os.environ.get("WYZI_COOKIE_SECURE", "0") == "1"

_ph = PasswordHasher()  # Argon2id, argon2-cffi defaults (t=3, m=64 MiB, p=4)


def hash_path():
    return config.DATA_DIR / "admin.hash"


def read_admin() -> dict | None:
    try:
        data = json.loads(hash_path().read_text())
        return data if data.get("hash", "").startswith("$argon2id$") else None
    except (OSError, ValueError):
        return None


def write_admin(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise ValueError(f"password must be at least {MIN_PASSWORD} characters")
    data = json.dumps({"hash": _ph.hash(password), "epoch": time.time()})
    p = hash_path()
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o660)
    try:
        os.write(fd, data.encode())
        try:
            os.fchmod(fd, 0o660)
        except PermissionError:
            pass  # file owned by the other account; its mode is already 0660
    finally:
        os.close(fd)


def configured() -> bool:
    return read_admin() is not None


def _verify(password: str) -> bool:
    admin = read_admin()
    if not admin:
        return False
    try:
        return _ph.verify(admin["hash"], password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# ───────── rate limiting ─────────
_fail_ip: dict[str, list[float]] = {}
_lock_ip: dict[str, float] = {}
_fail_all: list[float] = []


def locked_for(ip: str) -> float:
    now = time.time()
    global_recent = [t for t in _fail_all if now - t < 600]
    if len(global_recent) >= 20:
        return max(0.0, global_recent[-1] + 300 - now)
    return max(0.0, _lock_ip.get(ip, 0) - now)


def _record_failure(ip: str) -> None:
    now = time.time()
    fails = [t for t in _fail_ip.get(ip, []) if now - t < 3600] + [now]
    _fail_ip[ip] = fails
    _fail_all.append(now)
    del _fail_all[:-50]
    if len(fails) >= 5:
        _lock_ip[ip] = now + min(900, 60 * 2 ** (len(fails) - 5))


async def login(password: str, ip: str) -> str | None:
    if locked_for(ip) > 0:
        return None
    ok = await asyncio.to_thread(_verify, password)
    if not ok:
        _record_failure(ip)
        await asyncio.sleep(0.4)
        return None
    _fail_ip.pop(ip, None)
    _lock_ip.pop(ip, None)
    token = secrets.token_urlsafe(32)
    settings.session_add(_h(token), SLIDING, ip)
    return token


def _h(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def check(token: str | None) -> bool:
    if not token or len(token) > 100:
        return False
    admin = read_admin()
    if not admin:
        return False
    row = settings.session_get(_h(token))
    if not row:
        return False
    created, last_seen, expires = row
    now = time.time()
    if now > expires or now - created > ABSOLUTE or created < float(admin.get("epoch", 0)):
        settings.session_delete(_h(token))
        return False
    if now - last_seen > 300:  # slide the expiry at most every 5 minutes
        settings.session_touch(_h(token), min(created + ABSOLUTE, now + SLIDING))
    return True


def logout(token: str | None) -> None:
    if token:
        settings.session_delete(_h(token))


async def change_password(current: str, new: str) -> None:
    if not await asyncio.to_thread(_verify, current):
        raise PermissionError("current password is wrong")
    await asyncio.to_thread(write_admin, new)
    settings.session_delete()


def cookie_kwargs() -> dict:
    return {"key": COOKIE, "httponly": True, "samesite": "strict", "secure": COOKIE_SECURE, "path": "/", "max_age": ABSOLUTE}
