#!/usr/bin/env bash
# Build the frontend and deploy backend + frontend to the server. Runs as YOU (marcel),
# needs no root: files go to /opt/wyzi-server/portal (owned marcel:wyziportal) and the
# running service restarts itself when it sees data/restart-request.
#
#   deploy/deploy-portal.sh [ssh-host]      (default: marceserver)
set -euo pipefail
HOST=${1:-marceserver}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

echo "==> building frontend (live mode)"
npm run build --silent

echo "==> packing"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/backend" "$STAGE/frontend"
cp -r backend/app backend/requirements.txt "$STAGE/backend/"
find "$STAGE/backend" -name __pycache__ -prune -exec rm -rf {} +
cp -r dist "$STAGE/frontend/dist"
git rev-parse --short HEAD > "$STAGE/VERSION" 2>/dev/null || echo unknown > "$STAGE/VERSION"

# remote half: receives the tar stream on stdin (script itself is passed as an argument)
read -r -d '' REMOTE <<'REMOTE' || true
set -euo pipefail
P=/opt/wyzi-server/portal
NEW=$(mktemp -d "$P/.deploy.XXXXXX")
trap 'rm -rf "$NEW"' EXIT
tar -C "$NEW" -xf -
# atomic-ish swap of code dirs (keep one previous copy for rollback)
for d in backend/app frontend/dist; do
  rm -rf "$P/$d.prev"
  [ -e "$P/$d" ] && mv "$P/$d" "$P/$d.prev"
  mkdir -p "$(dirname "$P/$d")"
  mv "$NEW/$d" "$P/$d"
done
cp "$NEW/backend/requirements.txt" "$P/backend/requirements.txt"
cp "$NEW/VERSION" "$P/VERSION"
chmod -R g+rX,o-w "$P/backend/app" "$P/frontend/dist"
"$P/backend/.venv/bin/pip" install -q --disable-pip-version-check -r "$P/backend/requirements.txt"
health() { curl -fsS -H 'Host: localhost' http://127.0.0.1:8080/api/health 2>/dev/null || true; }  # may fail while restarting
if systemctl is-active --quiet wyzi-portal; then
  before=$(health | sed -n 's/.*"started":\([0-9.]*\).*/\1/p')
  touch "$P/data/restart-request"
  echo "requested portal restart"
  # wait for the NEW process (different start time), not the old one still answering
  for i in $(seq 1 40); do
    sleep 1
    now=$(health | sed -n 's/.*"started":\([0-9.]*\).*/\1/p')
    [ -n "$now" ] && [ "$now" != "$before" ] && break
  done
  health && echo
  [ -n "$now" ] && [ "$now" != "$before" ] || { echo "portal did not come back with the new code" >&2; exit 1; }
else
  echo "wyzi-portal is not running (first install: run deploy/install-root.sh with sudo)"
fi
echo "deployed $(cat "$P/VERSION")"
REMOTE

echo "==> uploading to $HOST"
tar -C "$STAGE" -cf - . | ssh "$HOST" "bash -c $(printf '%q' "$REMOTE")"
