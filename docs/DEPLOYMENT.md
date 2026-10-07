# Deployment

## Server layout (portal-related)

```
/opt/wyzi-server/portal/            marcel:wyziportal 2775
├── backend/.venv/                  Python 3.12 venv (fastapi, uvicorn[standard], psutil)
├── backend/app/                    ← backend/app from this repo (previous copy: app.prev)
├── frontend/dist/                  ← npm run build output (previous copy: dist.prev)
├── data/                           wyziportal 2770: portal.db (SQLite settings), restart-request
└── VERSION                         git commit of the deployed code
/etc/systemd/system/wyzi-portal.service        (deploy/server/…)
/etc/systemd/system/wyzi-playit-status.{service,timer}
/etc/systemd/system/wyzi-smart-status.{service,timer}
/usr/local/lib/wyzi/wyzi-playit-status, wyzi-smart-status
/etc/wyzi-server/portal.env         optional overrides (e.g. WYZI_ALLOWED_HOSTS)
```

Infrastructure the portal relies on (installed during server setup, copies in `deploy/infra/`):
`wyzi-mc@.service`, `wyzi-backup@.service/.timer`, `wyzi-helper`, `wyzi-exclusive`,
`wyzi-restore`, `wyzi-ark`, `/opt/wyzi-server/bin/wyzi-{mc-launch,mc-stop,rcon,backup}`.

## Routine deploy (no root)

```bash
deploy/deploy-portal.sh [ssh-host]     # default host alias: marceserver
```

Builds the frontend in live mode, uploads `backend/app` + `frontend/dist`, installs requirements
into the venv, then touches `data/restart-request`. The backend notices it within 5 s, exits with
code 3, and systemd (`Restart=on-failure`) starts the new code.

Rollback: on the server, swap `app.prev`/`dist.prev` back and `touch /opt/wyzi-server/portal/data/restart-request`.

## Root install (first time, or when units/scripts in deploy/server change)

```bash
# copy the repo's deploy/ folder to the server, then:
sudo bash deploy/install-root.sh
```

Creates the `wyziplayit` account, installs the two status exporters and `wyzi-portal.service`,
enables the timers and the portal, and runs self-checks (health, helper allowed, other sudo
refused, portal cannot read the Playit socket dir).

## Admin password (first time, and to reset)

```bash
ssh marceserver
cd /opt/wyzi-server/portal/backend
.venv/bin/python -m app.admin set-password      # prompts twice, min 10 characters
```

Until a password exists the portal shows these instructions instead of a login form.

## Development backend on the server

```bash
# as marcel, from a copy of backend/ in ~/wyzi-dev
WYZI_HELPER_ENABLED=0 WYZI_PORTAL_DATA=~/wyzi-dev/data uvicorn app.main:app --host 127.0.0.1 --port 8081
```

Bound to localhost only; reach it with `ssh -L 8081:127.0.0.1:8081` and `npm run dev:live`.
Never run the Vite dev server as the production frontend.

## Logs

```bash
journalctl -u wyzi-portal -f
journalctl -u wyzi-playit-status -n 20
journalctl -t wyzi-helper        # every privileged action with caller and arguments
```
