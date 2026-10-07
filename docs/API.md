# API

Base: `http://192.168.1.2:8080/api` (same origin as the UI). Interactive schema: `/api/docs`.

Every non-GET request must carry `X-Wyzi: 1` and, if the browser sends an `Origin`, it must be an
allowed host. Requests with an unknown `Host` header are rejected with `421` (DNS-rebinding guard).

## Read

| Endpoint | Returns |
|---|---|
| `GET /api/health` | `{ok, version, helper, instances}` |
| `GET /api/state` | full snapshot: tick payload + host, storage, backups, activity, logs, settings |
| `GET /api/system/host` | hostname, OS, kernel, CPU, board, GPUs, Java runtimes, interfaces, DNS |
| `GET /api/system/metrics` | CPU/cores/frequency/temps/load, memory, disk + network rates, 90 s history |
| `GET /api/system/services` | relevant systemd units (state, memory, since) |
| `GET /api/system/updates[?refresh=true]` | `apt list --upgradable` (read-only) |
| `GET /api/storage` | volumes → physical disks, SMART, mounts, measured categories, largest dirs |
| `GET /api/playit` | sanitized Playit status (see PLAYIT.md) |
| `GET /api/instances` | all instances incl. planned/undeployed ones |
| `GET /api/instances/{id}` | one instance |
| `GET /api/instances/{id}/console?lines=` | last ≤500 console lines |
| `GET /api/instances/{id}/files?path=` | read-only directory listing inside the instance dir |
| `GET /api/instances/{id}/files/content?path=` | text preview (≤512 KB), secrets redacted |
| `GET /api/backups` | archives, running job, per-instance schedule + retention |
| `GET /api/settings` | portal settings (`safetyHeadroom`, `plannedInstances`) |
| `GET /api/logs` | portal event log ring |

## Actions

| Endpoint | Notes |
|---|---|
| `POST /api/instances/{id}/start` body `{stop_first: [ids]}` | `202`; `409 {code:"insufficient_memory", required, safe, shortfall, blockers}` when the RAM check fails |
| `POST /api/instances/{id}/stop` | `202`; graceful (RCON `stop`, world saved) |
| `POST /api/instances/{id}/restart` | `202` |
| `POST /api/instances/{id}/command` body `{command}` | Minecraft command via RCON; `stop` is routed to the service stop; control characters rejected |
| `POST /api/instances/{id}/backups` | `202`; manual backup via `wyzi-helper backup` |
| `POST /api/instances/{id}/backups/{archive}/restore` body `{confirm: "<id>"}` | `202`; instance must be stopped; confirmation must equal the id |
| `POST /api/playit/restart` | restarts the agent via `wyzi-helper playit restart` |
| `PUT /api/settings` body `{safetyHeadroom}` or `{notify: {...}}` | validated (headroom 0.5–6 GB; notify keys allow-listed) |
| `PUT /api/instances/{id}/automation` | `{autoStop:{enabled,minutes,backupFirst}, wake:{enabled}, schedule:{enabled,time,onlyIfRan,tz}}` (partial updates) |
| `PUT /api/notify/secrets` body `{topic?, token?, clearToken?}` | write-only; topic `[A-Za-z0-9_-]{8,64}`, token `tk_…` |
| `POST /api/notify/test` | sends a test push (works while disabled) |

## Auth

| Endpoint | Notes |
|---|---|
| `GET /api/auth/state` | `{configured, authenticated}` (public) |
| `POST /api/auth/login` body `{password}` | sets the session cookie; `401` wrong, `429` locked, `409` no password set |
| `POST /api/auth/logout` | ends this session |
| `POST /api/auth/logout-all` | ends all sessions |
| `POST /api/auth/password` body `{current, new}` | min 10 chars; signs out all sessions |

Any other `/api/*` request without a valid session → `401 {code: "login_required" | "setup_required"}`.

## WebSocket `/api/ws`

Server → client messages:

| `type` | payload |
|---|---|
| `tick` (every 1.5 s) | `sys`, `memory`, `servers`, `playit`, `backupJob`, `ark` |
| `console` | `{id, lines, reset?}` for subscribed instances |
| `activity` | one activity feed item |
| `log` | one portal log entry |
| `toast` | `{title, kind, desc}` |
| `backups` | list + job after a backup/restore finishes |
| `storage` | storage snapshot after a measurement |

Client → server: `{"type": "console", "ids": ["fabric"]}` (subscribe; sends a backlog with `reset: true`).

## Instance status values

`offline` · `sleeping` (offline, wake listener active) · `starting` · `running` · `stopping` · `failed` · `undeployed`

`starting` covers: request accepted → systemd activating → Java running → Minecraft loading →
`Done` seen; it becomes `running` only when RCON answers (or `Done` is seen when RCON is disabled).
`startStep` (0–5) drives the startup checklist in the UI.
