#!/usr/bin/env bash
# One-time (and on unit changes) root installation for the Wyzi portal.
# Run ON THE SERVER from a checkout/bundle of this repo:   sudo bash deploy/install-root.sh
#
# Installs (nothing else is changed):
#   /usr/local/lib/wyzi/wyzi-playit-status   sanitized Playit status (user wyziplayit + playit group, read-only IPC)
#   /usr/local/lib/wyzi/wyzi-smart-status    sanitized SMART export (root, no serials)
#   wyzi-playit-status.{service,timer}, wyzi-smart-status.{service,timer}, wyzi-portal.service
# Then enables the two timers and the portal and verifies them.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
SRC=$(cd "$(dirname "$0")/server" && pwd)

echo "==> accounts"
# status bridge account: no login, no home, only extra group is playit (socket access)
getent passwd wyziplayit >/dev/null || useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin wyziplayit
usermod -G playit wyziplayit
id wyziplayit
# remove the private runtime dir left by the earlier DynamicUser version
if [ -L /run/wyzi-playit ]; then rm -f /run/wyzi-playit; rm -rf /run/private/wyzi-playit; fi

echo "==> scripts"
install -d -m 0755 -o root -g root /usr/local/lib/wyzi
for f in wyzi-playit-status wyzi-smart-status; do
  install -m 0755 -o root -g root "$SRC/usr/local/lib/wyzi/$f" "/usr/local/lib/wyzi/$f"
  sed -i 's/\r$//' "/usr/local/lib/wyzi/$f"
done

echo "==> units"
for u in wyzi-playit-status.service wyzi-playit-status.timer wyzi-smart-status.service wyzi-smart-status.timer wyzi-portal.service; do
  install -m 0644 -o root -g root "$SRC/etc/systemd/system/$u" "/etc/systemd/system/$u"
  install -m 0644 -o root -g root "$SRC/etc/systemd/system/$u" "/opt/wyzi-server/systemd/$u"
  sed -i 's/\r$//' "/etc/systemd/system/$u"
done
systemd-analyze verify /etc/systemd/system/wyzi-playit-status.service /etc/systemd/system/wyzi-smart-status.service /etc/systemd/system/wyzi-portal.service
systemctl daemon-reload

echo "==> status exporters"
systemctl enable --now wyzi-playit-status.timer wyzi-smart-status.timer
systemctl start wyzi-playit-status.service wyzi-smart-status.service

echo "==> portal"
[ -f /opt/wyzi-server/portal/backend/app/main.py ] || { echo "portal code missing: run deploy/deploy-portal.sh first" >&2; exit 1; }
systemctl enable wyzi-portal.service
systemctl restart wyzi-portal.service

echo "==> verification"
sleep 5
systemctl is-active wyzi-portal.service wyzi-playit-status.timer wyzi-smart-status.timer playit.service
ls -l /run/wyzi-playit/status.json /run/wyzi-smart/status.json
echo -n "portal health: "; curl -fsS -H 'Host: 192.168.1.2' http://127.0.0.1:8080/api/health; echo
echo -n "portal can read sanitized playit status: "; runuser -u wyziportal -- test -r /run/wyzi-playit/status.json && echo yes || echo NO-PROBLEM
echo -n "portal can read playit socket dir (must be 'no'): "; runuser -u wyziportal -- test -r /run/playit && echo YES-PROBLEM || echo no
echo -n "portal helper allowed: "; runuser -u wyziportal -- sudo -n /usr/local/sbin/wyzi-helper list | head -1
echo -n "portal arbitrary sudo (must fail): "; runuser -u wyziportal -- sudo -n /usr/bin/id >/dev/null 2>&1 && echo YES-PROBLEM || echo refused
echo "done."
