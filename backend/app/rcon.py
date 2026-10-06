"""Minimal synchronous Source-RCON client (Minecraft). Call from a worker thread.

RconSession keeps ONE connection open per instance: vanilla logs a
"Thread RCON Client ... started" line for every new connection, so polling with
fresh connections would flood the console."""
from __future__ import annotations

import itertools
import socket
import struct
import threading


class RconError(Exception):
    pass


def _packet(req_id: int, ptype: int, body: str) -> bytes:
    payload = struct.pack("<ii", req_id, ptype) + body.encode("utf-8") + b"\x00\x00"
    return struct.pack("<i", len(payload)) + payload


def _recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise RconError("connection closed")
        buf += chunk
    return buf


def _recv(sock: socket.socket) -> tuple[int, int, str]:
    (length,) = struct.unpack("<i", _recv_exact(sock, 4))
    if not 10 <= length <= 1 << 20:
        raise RconError("bad packet length")
    data = _recv_exact(sock, length)
    req_id, ptype = struct.unpack("<ii", data[:8])
    return req_id, ptype, data[8:-2].decode("utf-8", errors="replace")


class RconSession:
    def __init__(self) -> None:
        self._sock: socket.socket | None = None
        self._lock = threading.Lock()
        self._ids = itertools.count(10)
        self._target: tuple[str, int, str] | None = None

    def close(self) -> None:
        with self._lock:
            self._close()

    def _close(self) -> None:
        if self._sock:
            try:
                self._sock.close()
            except OSError:
                pass
        self._sock = None

    def _connect(self, host: str, port: int, password: str, timeout: float) -> None:
        s = socket.create_connection((host, port), timeout=timeout)
        s.settimeout(timeout)
        s.sendall(_packet(1, 3, password))
        req_id, _, _ = _recv(s)
        if req_id == -1:
            s.close()
            raise RconError("authentication failed")
        self._sock = s
        self._target = (host, port, password)

    def command(self, host: str, port: int, password: str, command: str, timeout: float = 5.0) -> str:
        with self._lock:
            if self._target != (host, port, password):
                self._close()
            for attempt in (1, 2):
                try:
                    if self._sock is None:
                        self._connect(host, port, password, timeout)
                    rid = next(self._ids)
                    assert self._sock is not None
                    self._sock.sendall(_packet(rid, 2, command))
                    if command.strip().lower() == "stop":
                        self._close()
                        return ""
                    _, _, body = _recv(self._sock)
                    return body
                except (OSError, RconError) as e:
                    self._close()
                    if attempt == 2 or isinstance(e, RconError) and "authentication" in str(e):
                        raise RconError(str(e)) from e
            return ""
