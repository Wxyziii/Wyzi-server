#!/usr/bin/env bash
# Root half of the Cobbleverse migration. The server files must already be in
# /srv/minecraft/instances/cobbleverse (copied as marcel, group minecraft).
#   sudo bash ~/wyzi-deploy/deploy/install-cobbleverse.sh
#
# Does only this:
#   /etc/wyzi-server/instances/cobbleverse.env      (from deploy/infra)
#   ownership minecraft:minecraft + group rw on the instance dir (setgid dirs)
#   ACL: wyziportal read-only on the instance (like fabric), read/write on config/wyzi-poke-portal only
# It does not start or enable anything; start the server from the portal.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
SRC=$(cd "$(dirname "$0")/infra" && pwd)
DIR=/srv/minecraft/instances/cobbleverse
CFG=$DIR/config/wyzi-poke-portal
[ -f "$DIR/fabric-server-launch.jar" ] || { echo "$DIR is not populated" >&2; exit 1; }

echo "==> env file"
sed 's/\r$//' "$SRC/etc/wyzi-server/instances/cobbleverse.env" > /tmp/cobbleverse.env.new
install -m 0644 -o root -g root /tmp/cobbleverse.env.new /etc/wyzi-server/instances/cobbleverse.env
rm -f /tmp/cobbleverse.env.new

echo "==> ownership and modes"
chown -R minecraft:minecraft "$DIR"
chmod -R u+rwX,g+rwX,o-rwx "$DIR"
find "$DIR" -type d -exec chmod g+s {} +

echo "==> ACLs"
setfacl -R -m g:wyziportal:rX -m d:g:wyziportal:rX "$DIR"
install -d -m 2770 -o minecraft -g minecraft "$CFG"
setfacl -R -m g:wyziportal:rwX -m d:g:wyziportal:rwX "$CFG"

echo "==> verify"
ls -l /etc/wyzi-server/instances/
getfacl -p "$CFG" | grep -E 'wyziportal|^# owner'
sudo -u wyziportal test -r "$DIR/server.properties" && echo "portal can read server.properties"
sudo -u wyziportal test -w "$CFG" && echo "portal can write the gameplay config"
echo "done - start Cobbleverse from the portal"
