# Minecraft instances

The portal has no modpack-specific code. An instance appears automatically when both exist:

```
/etc/wyzi-server/instances/<id>.env      Java, heap, flags, backup settings (root-owned)
/srv/minecraft/instances/<id>/           server files (minecraft:minecraft, ACL g:wyziportal:rX)
```

It runs as `wyzi-mc@<id>.service`. Ids match `^[a-z0-9][a-z0-9-]{0,31}$`.

Instances that are expected but not deployed yet (default: `cobbleverse`) are listed in the
portal setting `plannedInstances` and shown as **Planned** with start disabled — never as running.

## Env file keys

| Key | Meaning |
|---|---|
| `JAVA` | `/usr/lib/jvm/<jdk>/bin/java` (17, 21, 25 installed) |
| `XMS`, `XMX` | heap, e.g. `4G` / `8G` |
| `JVM_FLAGS` | extra JVM flags |
| `LAUNCH_MODE` | `jar` (`SERVER_JAR=…`) or `args` (`LAUNCH_ARGS="@libraries/…/unix_args.txt"`) |
| `HEAVY=yes` | heavy modpacks are mutually exclusive |
| `DISPLAY_NAME` | optional name shown in the portal (default: title-cased id) |
| `LOADER`, `MC_VERSION` | optional overrides; otherwise detected from `libraries/` and `versions/` |
| `BACKUP_EXCLUDES`, `BACKUP_KEEP`, `BACKUP_KEEP_MANUAL` | backup settings |

`server.properties` must have `server-ip=` empty, a unique `server-port`, `enable-rcon=true`,
a unique `rcon.port` and a random `rcon.password` — RCON is how the portal detects readiness,
reads players/tick time and sends console commands.

## What the portal measures

| Field | Source |
|---|---|
| status / startStep | systemd unit state + log (`Done (`) + RCON readiness |
| players, max | RCON `list` (one persistent connection per instance) |
| MSPT / TPS | RCON `tick query` (MC 1.20.3+); TPS = min(20, 1000/MSPT) |
| CPU, memory | the server process (psutil): CPU share of all cores, RSS |
| uptime | process start time |
| world / disk size | measured every 10 min |
| console | `logs/latest.log` (tail) + portal/RCON lines |

## RAM safety

Uses `MemAvailable`, never `MemFree`.

```
footprint(server) = Xmx + max(0.5 GB, 20 % of Xmx)          # heap + JVM native overhead
safe for a new server = MemAvailable
                      + memory of ARK (stopped automatically when Minecraft starts)
                      + RSS of servers being stopped first
                      − headroom (setting, default 2.5 GB)
                      − (footprint − RSS) of servers that keep running
```

Starting a server whose footprint exceeds that is refused by the backend (`409`); the UI shows
the RAM-conflict dialog and can stop the blocking server first.

## Backups

Manual backups run `wyzi-backup <id> manual` as a transient systemd unit (via the helper).
While a server runs, saving is paused (`save-off`, `save-all flush`) and always re-enabled.
Archives: `/srv/storage/backups/minecraft/<id>/<id>-<UTC>-<label>.tar.zst` + `.sha256`.
Progress in the portal is estimated from the growing `.partial` file against the previous archive.

Restore needs the server stopped and the instance id typed as confirmation. `wyzi-restore`
verifies the checksum, **moves the current directory aside** (`.<id>.pre-restore-<time>`), extracts,
and carries over excluded paths. Nothing is deleted.

Scheduled backups, auto-stop and wake-on-connect are configured per instance in the portal —
see [AUTOMATION.md](AUTOMATION.md). The `wyzi-backup@.timer` units are not used.
