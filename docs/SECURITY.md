# Security model

## Exposure

- The portal listens on `0.0.0.0:8080` (works on Wi-Fi now and Ethernet later without changes).
- UFW allows `8080/tcp` and `22/tcp` **only from 192.168.1.0/24**. Nothing else is opened.
- Minecraft is public **only** through the Playit tunnel (`127.0.0.1:25565`). Never create tunnels
  for 22 or 8080.
- No Cloudflare Tunnel, no router port forwarding.

## Request guard (`backend/app/main.py`)

- **Host allow-list** (`WYZI_ALLOWED_HOSTS`, default `192.168.1.2, marceserver, localhost, 127.0.0.1`):
  other Host headers get `421`. Defeats DNS rebinding.
- **State-changing requests** need `X-Wyzi: 1` and a same-host `Origin` (if present). A web page on
  another site opened on a LAN device cannot trigger actions (CSRF).
- WebSocket upgrades check Host and Origin the same way.
- `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- There is no login yet: anyone on the LAN can use the portal. Add authentication before
  sharing the network with untrusted devices.

## Privileges

| Account | Can |
|---|---|
| `wyziportal` (runs the backend) | read instance files via ACL (`g:wyziportal:rX`), read `/etc/wyzi-server/instances/*.env`, read backups, read `/run/wyzi-playit/status.json` and `/run/wyzi-smart/status.json`, `sudo -n /usr/local/sbin/wyzi-helper` — nothing else |
| `wyzi-helper` (root, allow-listed) | `list status start stop restart enable disable logs backup backups backup-logs restore playit(status/restart/logs) ark(status)`; instance names and archive names regex-validated; every call logged |
| `wyziplayit` | runs the Playit status bridge; only extra group `playit` |
| `minecraft` | owns and runs the servers |

The portal is **not** in the `playit` group and cannot reach the Playit control socket or secret.

## Input handling

- Instance ids: `^[a-z0-9][a-z0-9-]{0,31}$` **and** must be a discovered instance.
- Archive names: strict regex **and** must exist in the instance's backup listing.
- File browser: paths are resolved with `realpath` and must stay inside the instance dir
  (`..`, absolute paths and symlink escapes rejected); read-only; ≤512 KB text previews.
- Secrets are redacted before leaving the server (`rcon.password`, `management-server-secret`,
  any `*password*`, `*secret*`, `*token*`, `*apikey*` key in properties/JSON).
- Console commands go to Minecraft over **RCON only** — never a shell. Control characters and
  newlines are rejected; length ≤256.
- Helper calls use argv lists (`asyncio.create_subprocess_exec`), never a shell.

## Never returned by the API

Playit secret/agent id/login links, RCON passwords, Wi-Fi keys, API tokens, disk serial numbers.
