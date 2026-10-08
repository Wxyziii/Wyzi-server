"""Minimal RCON client for one command, reading host/port/password from an instance's server.properties.
   python3 rcon.py <instance dir> <command...>"""
import socket, struct, sys, pathlib

root = pathlib.Path(sys.argv[1])
props = dict(l.split('=', 1) for l in (root / 'server.properties').read_text().splitlines() if '=' in l and not l.startswith('#'))
port, password = int(props['rcon.port']), props['rcon.password']

def packet(rid, kind, body):
    data = struct.pack('<ii', rid, kind) + body.encode() + b'\x00\x00'
    return struct.pack('<i', len(data)) + data

def read(sock):
    size = struct.unpack('<i', sock.recv(4))[0]
    data = b''
    while len(data) < size:
        data += sock.recv(size - len(data))
    rid, kind = struct.unpack('<ii', data[:8])
    return rid, data[8:-2].decode(errors='replace')

with socket.create_connection(('127.0.0.1', port), timeout=10) as s:
    s.sendall(packet(1, 3, password))
    if read(s)[0] == -1:
        sys.exit('RCON authentication failed')
    s.sendall(packet(2, 2, ' '.join(sys.argv[2:])))
    print(read(s)[1])
