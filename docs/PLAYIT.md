# Playit status bridge

```
playitd ──(unix socket, group playit)──► wyzi-playit-status (user wyziplayit, every 30 s)
                                               │ writes sanitized JSON
                                               ▼
                                  /run/wyzi-playit/status.json (0644)
                                               │ read
                                               ▼
                                   portal backend (wyziportal) → GET /api/playit
```

- The bridge sends only the read-only IPC requests `get_status` and `get_state`
  (`{"ipc_version":2,"request_id":1,"request":{"type":"get_state"}}`).
- It resolves the tunnel's Minecraft SRV record to report the public port, and measures one TCP
  connect to the public endpoint per run (edge round-trip, not player ping).
- Output fields: `agent`, `phase`, `version`, `account_verified`, `pending_tunnels`,
  `tunnels[] {public_host, public_port, public_address, srv, local_target, disabled}`,
  `latency_ms`, `updated_at`.
- Never written: secret, secret path, agent id, login link, account details, notices.
- The portal user is not in the `playit` group and never touches the socket.

`GET /api/playit` adds the systemd service state, marks data older than 120 s as `stale`, and
reports a tunnel as `online` only when the local target port has a running instance (`idle` otherwise).

Current tunnel (verified 2026-10-06): `pgsql-lasted.tun.ply.gg` (SRV → port 26403) → `127.0.0.1:25565`.
Tunnels are managed at playit.gg. Never add tunnels for SSH (22) or the portal (8080).

Restart from the portal: `POST /api/playit/restart` → `wyzi-helper playit restart`.
