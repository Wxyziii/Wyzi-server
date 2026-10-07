# Automation: scheduled backups, auto-stop, wake-on-connect, notifications

All of it is configured per instance in the portal (server → **Settings** tab) or in
**Settings → Notifications**, stored in `data/portal.db`, and executed by the portal process.
Privileged steps still go only through `wyzi-helper` (`backup <id> <label>`, `start`, `stop`).

## Scheduled backups

- Daily at a chosen time in the browser's time zone (stored with the schedule, e.g. `Europe/Warsaw`;
  the server itself runs in UTC).
- Uses the existing `wyzi-backup` (label `scheduled`, retention `BACKUP_KEEP`); live servers are
  saved consistently (`save-off` / `save-all flush`).
- **Only if the server ran** (default on): days on which the instance never ran are skipped.
- Missed runs (portal down at the slot) catch up once within 12 h. Enabling or changing a schedule
  starts with the *next* slot.
- If another backup/restore is running, the scheduler retries every 30 s.
- The `wyzi-backup@.timer` systemd units are not used (keep them disabled to avoid double backups).

## Auto-stop

- Per instance: on/off, idle timeout (5–120 min), optional pre-stop backup (label `pre-stop`, 5 kept).
- The idle clock only runs while RCON confirms **zero players**; if RCON is unreachable nothing is
  stopped. It starts when the last player leaves (or when the server became ready).
- Sequence: optional backup (server keeps running) → re-check players → graceful stop
  (`wyzi-helper stop`, RCON `stop`, world saved). If a player joined meanwhile, it is cancelled.

## Wake-on-connect

While an instance with wake enabled is **offline** (not failed), the portal listens on
`127.0.0.1:<server-port>` — where the Playit tunnel forwards players — and speaks a minimal subset of
the Minecraft protocol:

| Client does | Portal answers |
|---|---|
| server-list ping | version "Sleeping", MOTD "<name> · sleeping / Join to wake the server", pong |
| login attempt | disconnect: "Waking up — rejoin in about 30–60 seconds", then starts the server |
| anything else | connection closed |

- The start uses the **same RAM-safety check** as the Start button (and refuses if another
  `HEAVY=yes` server runs). If memory is short, the player is told so and nothing starts.
- The listener is closed before Minecraft starts, so the port is free.
- Limits: 4 KB per packet, 5 s per connection, 32 concurrent connections, one wake per instance per
  60 s. Only a validated player name is logged.
- Shown as status **Sleeping** (blue) in the portal and as "Wake proxy · sleeping" on the tunnel.
- Combine with auto-stop: empty → stopped → sleeping → first join wakes it.

## Notifications (ntfy)

Outbound HTTPS only; the portal stays LAN-only.

1. Install the ntfy app (Android/iOS) and subscribe to a hard-to-guess topic.
2. Settings → Notifications: **Generate** or paste the topic → Save (write-only; it is never shown or
   returned again) → **Send test** → enable.
3. Optional: an ntfy access token (`tk_…`) for a reserved topic.

| Alert | Trigger | Priority |
|---|---|---|
| Server crashed | unit failed, auto-restart after a crash, OOM kill, crash loop (`start-limit-hit`) | high / urgent |
| Start failed | the start request failed | high |
| Backup failed | manual, scheduled or pre-stop backup | high |
| Low memory | MemAvailable below the safety headroom for 60 s, or swap > 1 GB | high |
| Disk nearly full | a volume ≥ threshold (default 90 %) for 2 min | high |
| Disk health | SMART failed, pending/uncorrectable sectors, or reallocated count rising | urgent |
| Playit offline | agent offline / status stale for 2 min | high |
| Auto-stopped | optional, low | low |

Repeats of the same alert are suppressed for the cooldown (default 30 min); condition alerts send a
"Resolved" message when they clear. Tapping a notification opens the portal URL (works on the LAN).

**Blind spot:** if the whole server is down it cannot notify. Add an external heartbeat
(e.g. healthchecks.io) later if you want that covered.
