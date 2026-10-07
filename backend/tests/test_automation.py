import asyncio
import datetime as dt
import json
import struct
from zoneinfo import ZoneInfo

import pytest


# ───────── schedule slots ─────────
def test_last_and_next_slot_respect_timezone():
    from app.automation import last_slot, next_slot

    now = dt.datetime(2026, 10, 7, 1, 0, tzinfo=dt.timezone.utc)  # 03:00 in Warsaw (CEST)
    waw = ZoneInfo("Europe/Warsaw")
    s = last_slot("04:30", waw, now)
    assert s.astimezone(waw).strftime("%Y-%m-%d %H:%M") == "2026-10-06 04:30"
    assert next_slot("04:30", waw, now).astimezone(waw).strftime("%Y-%m-%d %H:%M") == "2026-10-07 04:30"
    assert last_slot("00:30", waw, now).astimezone(waw).strftime("%Y-%m-%d %H:%M") == "2026-10-07 00:30"


# ───────── settings validation ─────────
def test_instance_settings_validation():
    from app.settings_store import validate_instance_settings as v

    assert v({"autoStop": {"enabled": True, "minutes": 15, "backupFirst": False}})
    assert v({"schedule": {"enabled": True, "time": "04:30", "tz": "Europe/Warsaw", "onlyIfRan": True}})
    assert v({"wake": {"enabled": True}})
    assert not v({"autoStop": {"minutes": 1}})
    assert not v({"autoStop": {"minutes": "15"}})
    assert not v({"schedule": {"time": "4:30"}})
    assert not v({"schedule": {"tz": "../../etc/passwd"}})
    assert not v({"schedule": {"tz": "Mars/Olympus"}})
    assert not v({"wake": {"enabled": True, "cmd": "x"}})
    assert not v({"other": {}})


def test_notify_settings_validation():
    from app.settings_store import _validate_notify as v

    assert v({"enabled": True, "server": "https://ntfy.sh", "events": {"crash": False}})
    assert not v({"server": "http://ntfy.sh"})  # https only
    assert not v({"server": "https://ntfy.sh/topic?x=1"})
    assert not v({"events": {"rm -rf": True}})
    assert not v({"diskPercent": 100})
    assert not v({"topic": "abc"})  # secrets are not regular settings


# ───────── auth ─────────
@pytest.fixture()
def data_dir(tmp_path, monkeypatch):
    from app import config
    from app.settings_store import settings

    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    settings.open()
    return tmp_path


def test_password_hash_login_and_epoch(data_dir):
    from app import auth

    assert not auth.configured()
    with pytest.raises(ValueError):
        auth.write_admin("short")
    auth.write_admin("correct horse battery")
    stored = json.loads((data_dir / "admin.hash").read_text())
    assert stored["hash"].startswith("$argon2id$") and "correct" not in stored["hash"]

    token = asyncio.run(auth.login("correct horse battery", "10.0.0.1"))
    assert token and auth.check(token)
    assert asyncio.run(auth.login("wrong", "10.0.0.1")) is None
    assert not auth.check("forged-token")

    # a new password (e.g. via CLI) invalidates sessions created before it
    import time

    time.sleep(0.01)
    auth.write_admin("another long password")
    assert not auth.check(token)


def test_login_rate_limit(data_dir):
    from app import auth

    auth.write_admin("correct horse battery")
    for _ in range(5):
        asyncio.run(auth.login("nope", "10.9.9.9"))
    assert auth.locked_for("10.9.9.9") > 0
    assert asyncio.run(auth.login("correct horse battery", "10.9.9.9")) is None  # locked even with the right password
    assert auth.locked_for("10.9.9.10") == 0


# ───────── notification conditions ─────────
def test_condition_hold_alert_once_and_resolve(monkeypatch):
    from app import notify

    sent = []
    n = notify.Notifier()
    monkeypatch.setattr(n, "_cfg", lambda: {"enabled": True, "events": {"ramPressure": True}, "cooldownMinutes": 30})

    async def fake_send(title, message, priority="default", tags=None, force=False):
        sent.append(title)

    monkeypatch.setattr(n, "send", fake_send)
    clock = [1000.0]
    monkeypatch.setattr(notify.time, "time", lambda: clock[0])

    async def run():
        n.condition("ramPressure", "ram", True, "Low memory", "m", hold=60)
        clock[0] += 30
        n.condition("ramPressure", "ram", True, "Low memory", "m", hold=60)
        clock[0] += 40
        n.condition("ramPressure", "ram", True, "Low memory", "m", hold=60)
        n.condition("ramPressure", "ram", True, "Low memory", "m", hold=60)
        n.condition("ramPressure", "ram", False, "Low memory", "m", hold=60, resolved="ok")
        await asyncio.sleep(0)

    asyncio.run(run())
    assert sent == ["Low memory", "Resolved: Low memory"]


# ───────── wake-on-connect protocol ─────────
def _varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def _pkt(pid, payload):
    body = _varint(pid) + payload
    return _varint(len(body)) + body


def _handshake(proto, state, port):
    host = b"localhost"
    return _pkt(0, _varint(proto) + _varint(len(host)) + host + struct.pack(">H", port) + _varint(state))


async def _read_pkt(r):
    from app.wake import _read_packet

    return await _read_packet(r)


class FakeInst:
    id = "test"
    name = "Test"
    max_players = 10
    status = "offline"
    pending = None

    def __init__(self, port):
        self.port = port


def test_wake_status_and_login():
    from app.wake import WakeListener, _parse_string

    calls = []

    async def starter(inst, reason):
        calls.append(reason)
        return True, "Waking up"

    async def run():
        inst = FakeInst(0)
        lst = WakeListener(inst, starter)
        lst.port = 0
        server = await asyncio.start_server(lst._handle, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]

        # server list ping
        r, w = await asyncio.open_connection("127.0.0.1", port)
        w.write(_handshake(767, 1, port) + _pkt(0, b""))
        await w.drain()
        pid, payload = await _read_pkt(r)
        status = json.loads(_parse_string(payload, 0, 32767)[0])
        assert pid == 0 and status["version"]["name"] == "Sleeping" and status["version"]["protocol"] == 767
        w.write(_pkt(1, struct.pack(">q", 42)))
        await w.drain()
        pid, payload = await _read_pkt(r)
        assert pid == 1 and struct.unpack(">q", payload)[0] == 42
        w.close()

        # login attempt -> disconnect message + wake
        r, w = await asyncio.open_connection("127.0.0.1", port)
        name = b"Wyzi"
        w.write(_handshake(767, 2, port) + _pkt(0, _varint(len(name)) + name + b"\x00" * 16))
        await w.drain()
        pid, payload = await _read_pkt(r)
        msg = json.loads(_parse_string(payload, 0, 32767)[0])
        assert pid == 0 and "Waking up" in json.dumps(msg)
        w.close()

        # garbage is rejected without waking
        r, w = await asyncio.open_connection("127.0.0.1", port)
        w.write(b"\xff\xff\xff\xff\xff\xff")
        await w.drain()
        assert await r.read() == b""
        server.close()
        await server.wait_closed()

    asyncio.run(run())
    assert calls == ["wake: Wyzi tried to join"]


def test_release_port_closes_every_listener_on_that_port():
    """Instances sharing a port: starting one must free the port held by another's wake listener."""
    from app.wake import WakeManager

    class Lst:
        def __init__(self, port):
            self.port, self.closed = port, False

        async def close(self):
            self.closed = True

    async def run():
        wm = WakeManager()
        a, b, c = Lst(25565), Lst(25565), Lst(25570)
        wm.listeners = {"fabric": a, "cobbleverse": b, "other": c}
        await wm.release_port(25565)
        assert a.closed and b.closed and not c.closed
        assert list(wm.listeners) == ["other"]

    asyncio.run(run())
