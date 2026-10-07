# WYZI Server

Local-only management portal for a home Minecraft server (Ubuntu, systemd, Playit.gg).
React + TypeScript + Vite + Tailwind + Framer Motion + Lucide frontend, FastAPI backend,
SQLite for settings, WebSockets for live data.

The portal is **LAN-only** (`http://192.168.1.2:8080`) and protected by a single admin login
(Argon2id). It is never exposed through Playit, Cloudflare or port forwarding.

## Two modes

| | Prototype mode | Server-connected (production) mode |
|---|---|---|
| Data | simulated in the browser (`src/lib/mock.ts`) | real host + instances from the FastAPI backend |
| Actions | animated fakes, nothing executes | start/stop/restart, RCON console, backups, restore |
| Start | `npm run dev` | `npm run build` → served by FastAPI on :8080 |
| When the backend is down | n/a | explicit "Server unreachable" banner, never fake data |

The mode is chosen at build time with `VITE_WYZI_MODE` (`mock` / `live`). Production builds default
to `live`; `npm run dev` defaults to `mock`.

## Frontend development

```bash
npm install
npm run dev          # prototype mode, http://localhost:5173
npm run dev:live     # live mode against a backend (proxy /api + WebSocket)
```

`dev:live` proxies to `WYZI_BACKEND` (default `http://127.0.0.1:8081`). To use the real server,
run a development backend there and tunnel it:

```bash
ssh -N -L 8081:127.0.0.1:8081 marceserver
```

Structure:

- `src/index.css` — design tokens (graphite base, slate-blue accent, green only for healthy states)
- `src/ui/` — custom primitives: Button, Status, Tooltip, Menu, Controls, Charts, Overlay, Layout
- `src/shell/` — sidebar, top bar, command palette, RAM-conflict modal, restore dialog, connection banner
- `src/pages/` — Dashboard, Servers, server detail tabs, Storage, Backups, Network, System, Logs, Settings
- `src/lib/types.ts` — shared data models (same shapes from mock and backend)
- `src/lib/store.ts` — the single app store (`useApp`) and the action facade (mock or live)
- `src/lib/live.ts` — REST snapshot + WebSocket stream + real actions
- `src/lib/mock.ts`, `mockData.ts` — the prototype simulation
- `src/lib/api.ts` — fetch wrapper (adds the `X-Wyzi` header the backend requires)

UI components only talk to the store, never to the transport.

## Backend development

```bash
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt   # Windows
python -m pytest -q
```

The backend reads Linux paths (`/proc`, `/sys`, `/etc/wyzi-server`, `/srv/minecraft`), so it runs
on the server. Every path can be overridden with an environment variable (see `backend/app/config.py`).
`WYZI_HELPER_ENABLED=0` runs it without the privileged helper (development as a normal user).

## Deployment

```bash
deploy/deploy-portal.sh            # build + upload + restart, as your normal user (no sudo)
```

One-time / when units change, on the server:

```bash
sudo bash deploy/install-root.sh
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [docs/API.md](docs/API.md) — REST + WebSocket API
- [docs/SECURITY.md](docs/SECURITY.md) — privilege model, LAN guard, what the portal can and cannot do
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — server layout, install, deploy, rollback
- [docs/INSTANCES.md](docs/INSTANCES.md) — Minecraft instance configuration, RAM safety, backups
- [docs/PLAYIT.md](docs/PLAYIT.md) — the sanitized Playit status bridge
- [docs/AUTOMATION.md](docs/AUTOMATION.md) — scheduled backups, auto-stop, wake-on-connect, ntfy notifications
