"""Wake-on-connect.

While an instance with wake enabled is offline, the portal listens on 127.0.0.1:<server-port>
(where the Playit tunnel forwards players) and speaks just enough of the Minecraft protocol:

  - server list ping  -> "Sleeping · join to wake" MOTD (+ pong)
  - login attempt     -> disconnect with "Waking up, rejoin in ~30 s" and start the server
                         (same RAM-safety check as the portal's Start button)

The listener is closed before the server is started so Minecraft can bind the port.
Hard limits: 4 KB per packet, 5 s per connection, 32 concurrent connections, one wake per
instance per 60 s. Nothing received is executed or stored except the validated player name
(for the activity log)."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time

from .events import hub
from .instances import Instance, manager
from .settings_store import settings

log = logging.getLogger("wyzi.wake")

MAX_PACKET = 4096
TIMEOUT = 5.0
MAX_CONN = 32
WAKE_COOLDOWN = 60
NAME_RE = re.compile(r"^[A-Za-z0-9_]{1,16}$")


class ProtocolError(Exception):
    pass


async def _read_varint(r: asyncio.StreamReader) -> int:
    value = 0
    for i in range(5):
        b = (await r.readexactly(1))[0]
        value |= (b & 0x7F) << (7 * i)
        if not b & 0x80:
            return value - (1 << 32) if value & (1 << 31) else value
    raise ProtocolError("varint too long")


def _varint(n: int) -> bytes:
    n &= 0xFFFFFFFF
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def _string(s: str) -> bytes:
    b = s.encode("utf-8")
    return _varint(len(b)) + b


def _packet(pid: int, payload: bytes) -> bytes:
    body = _varint(pid) + payload
    return _varint(len(body)) + body


async def _read_packet(r: asyncio.StreamReader) -> tuple[int, bytes]:
    length = await _read_varint(r)
    if not 0 < length <= MAX_PACKET:
        raise ProtocolError("bad packet length")
    data = await r.readexactly(length)
    # packet id is a varint at the start of data
    pid, i = 0, 0
    while True:
        if i >= len(data) or i >= 5:
            raise ProtocolError("bad packet id")
        b = data[i]
        pid |= (b & 0x7F) << (7 * i)
        i += 1
        if not b & 0x80:
            break
    return pid, data[i:]


def _parse_varint(buf: bytes, pos: int) -> tuple[int, int]:
    value = 0
    for i in range(5):
        if pos >= len(buf):
            raise ProtocolError("truncated")
        b = buf[pos]
        pos += 1
        value |= (b & 0x7F) << (7 * i)
        if not b & 0x80:
            return (value - (1 << 32) if value & (1 << 31) else value), pos
    raise ProtocolError("varint too long")


def _parse_string(buf: bytes, pos: int, max_len: int) -> tuple[str, int]:
    n, pos = _parse_varint(buf, pos)
    if not 0 <= n <= max_len * 4 or pos + n > len(buf):
        raise ProtocolError("bad string")
    return buf[pos:pos + n].decode("utf-8", errors="replace"), pos + n


class WakeListener:
    def __init__(self, inst: Instance, starter) -> None:
        self.inst = inst
        self.starter = starter  # async (inst, reason) -> (ok: bool, message: str)
        self.server: asyncio.base_events.Server | None = None
        self.active = 0
        self.port = inst.port

    async def open(self) -> bool:
        try:
            self.server = await asyncio.start_server(self._handle, "127.0.0.1", self.port, reuse_address=True)
        except OSError as e:
            log.warning("wake listener for %s could not bind :%s: %s", self.inst.id, self.port, e)
            return False
        log.info("wake listener for %s on 127.0.0.1:%s", self.inst.id, self.port)
        return True

    async def close(self) -> None:
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None

    async def _handle(self, r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
        if self.active >= MAX_CONN:
            w.close()
            return
        self.active += 1
        try:
            await asyncio.wait_for(self._session(r, w), TIMEOUT)
        except (ProtocolError, asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError, UnicodeError):
            pass
        finally:
            self.active -= 1
            try:
                w.close()
            except Exception:
                pass

    async def _session(self, r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
        first = await r.readexactly(1)
        if first == b"\xfe":
            return  # legacy (pre-1.7) ping: just close
        # put the byte back by parsing the length manually
        length = first[0] & 0x7F
        shift, b = 7, first[0]
        while b & 0x80:
            b = (await r.readexactly(1))[0]
            length |= (b & 0x7F) << shift
            shift += 7
            if shift > 35:
                raise ProtocolError("varint too long")
        if not 0 < length <= MAX_PACKET:
            raise ProtocolError("bad handshake length")
        data = await r.readexactly(length)
        pid, pos = _parse_varint(data, 0)
        if pid != 0:
            raise ProtocolError("expected handshake")
        proto, pos = _parse_varint(data, pos)
        _addr, pos = _parse_string(data, pos, 255)
        pos += 2  # port
        next_state, pos = _parse_varint(data, pos)

        if next_state == 1:
            await self._status(r, w, proto)
        elif next_state in (2, 3):
            await self._login(r, w)

    async def _status(self, r: asyncio.StreamReader, w: asyncio.StreamWriter, proto: int) -> None:
        pid, _ = await _read_packet(r)
        if pid != 0:
            return
        resp = {
            "version": {"name": "Sleeping", "protocol": proto},
            "players": {"max": self.inst.max_players or 20, "online": 0, "sample": []},
            "description": {"text": "", "extra": [
                {"text": f"{self.inst.name}", "color": "gray"},
                {"text": " · sleeping\n", "color": "dark_gray"},
                {"text": "Join to wake the server", "color": "aqua"},
            ]},
        }
        w.write(_packet(0, _string(json.dumps(resp))))
        await w.drain()
        try:
            pid, payload = await _read_packet(r)
            if pid == 1 and len(payload) == 8:
                w.write(_packet(1, payload))
                await w.drain()
        except asyncio.IncompleteReadError:
            pass

    async def _login(self, r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
        name = None
        try:
            pid, payload = await _read_packet(r)
            if pid == 0:
                n, _ = _parse_string(payload, 0, 16)
                name = n if NAME_RE.match(n) else None
        except (ProtocolError, asyncio.IncompleteReadError):
            pass
        ok, message = await self.starter(self.inst, f"wake: {name or 'player'} tried to join")
        if ok:
            hub.activity_event(f"{name or 'A player'} woke {self.inst.name}", "player", "Wake-on-connect")
        text = {"text": "", "extra": [
            {"text": f"{self.inst.name}\n\n", "color": "white", "bold": True},
            {"text": message, "color": "aqua" if ok else "gold"},
        ]}
        w.write(_packet(0, _string(json.dumps(text))))
        await w.drain()


class WakeManager:
    def __init__(self) -> None:
        self.listeners: dict[str, WakeListener] = {}
        self.last_wake: dict[str, float] = {}
        self.starter = None  # set by main: async (inst, reason) -> (ok, message)

    def sleeping(self, iid: str) -> bool:
        return iid in self.listeners

    def ports(self) -> set[int]:
        return {w.port for w in self.listeners.values()}

    async def _wake(self, inst: Instance, reason: str) -> tuple[bool, str]:
        now = time.time()
        if inst.status != "offline":
            return True, "The server is already starting. Rejoin in about 30 seconds."
        if now - self.last_wake.get(inst.id, 0) < WAKE_COOLDOWN:
            return True, "The server is waking up. Rejoin in about 30 seconds."
        self.last_wake[inst.id] = now
        # release the port first so Minecraft can bind it
        await self.release_port(inst.port)
        assert self.starter is not None
        ok, msg = await self.starter(inst, reason)
        if not ok:
            hub.log("portal", "warn", f"wake of {inst.id} refused: {msg}")
            return False, msg
        hub.log("portal", "info", f"{reason} → starting {inst.id}")
        return True, "Waking up — the server is starting.\nRejoin in about 30–60 seconds."

    async def release_port(self, port: int) -> None:
        """Close every wake listener on `port` (instances can share a port; only one runs at a time)."""
        for iid, lst in list(self.listeners.items()):
            if lst.port == port:
                self.listeners.pop(iid, None)
                await lst.close()

    async def reconcile(self) -> None:
        """Open/close listeners to match settings and instance state."""
        insts = list(manager.instances.values())
        # ports held by a server that is running, starting or stopping
        busy = {i.port for i in insts if i.is_active or i.pending}
        for inst in insts:
            want = settings.instance(inst.id)["wake"]["enabled"] and inst.status == "offline" and not inst.pending and inst.port not in busy
            lst = self.listeners.get(inst.id)
            if want and lst and lst.port != inst.port:
                await lst.close()
                self.listeners.pop(inst.id, None)
                lst = None
            if want and not lst:
                new = WakeListener(inst, self._wake)
                if await new.open():
                    self.listeners[inst.id] = new
            elif not want and lst:
                await lst.close()
                self.listeners.pop(inst.id, None)
        for iid in list(self.listeners):
            if iid not in manager.instances:
                await self.listeners.pop(iid).close()


wake = WakeManager()
