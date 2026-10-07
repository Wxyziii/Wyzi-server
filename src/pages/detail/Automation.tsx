import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Info } from 'lucide-react';
import { saveAutomation } from '../../lib/live';
import { useApp, type Server } from '../../lib/store';
import type { InstanceAutomation } from '../../lib/types';
import { cx } from '../../lib/format';
import { Select, Switch } from '../../ui/Controls';
import { Badge } from '../../ui/Status';
import { Row, SettingsGroup } from './Tabs';

const DEFAULTS: InstanceAutomation = {
  autoStop: { enabled: false, minutes: 15, backupFirst: true },
  wake: { enabled: false },
  schedule: { enabled: false, time: '04:30', onlyIfRan: true, tz: 'UTC' },
};
const MINUTES = [5, 10, 15, 30, 60, 120];
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

function fmtWhen(ts: number | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const hm = d.toTimeString().slice(0, 5);
  if (d.toDateString() === today.toDateString()) return `Today ${hm}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${hm}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${hm}`;
}

/** Live-mode per-instance automation (auto-stop, wake-on-connect, scheduled backups). Saves immediately. */
export function AutomationSettings({ s }: { s: Server }) {
  const helper = useApp((st) => st.conn.helper);
  const a = s.automation ?? DEFAULTS;
  const save = (patch: Partial<{ [K in keyof InstanceAutomation]: Partial<InstanceAutomation[K]> }>) => saveAutomation(s.id, patch);
  const sched = s.backupSchedule;
  const tz = browserTz();

  return (
    <>
      <SettingsGroup title="Auto-stop" desc="Free memory when nobody is playing.">
        <Row label="Stop when empty" desc="Counts only while RCON confirms zero players; the world is saved before stopping.">
          <Switch checked={a.autoStop.enabled} onChange={(v) => save({ autoStop: { enabled: v } })} disabled={!s.rcon} />
        </Row>
        <AnimatePresence initial={false}>
          {a.autoStop.enabled && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="divide-y divide-line overflow-hidden border-t border-line">
              <Row label="Idle timeout" desc={s.autoStopAt ? `Stops at ${fmtWhen(s.autoStopAt)} unless someone joins.` : 'Starts counting when the last player leaves.'}>
                <Select
                  value={`${a.autoStop.minutes} minutes`}
                  onChange={(v) => save({ autoStop: { minutes: parseInt(v, 10) } })}
                  icon={Clock}
                  width={140}
                  options={MINUTES.map((m) => `${m} minutes`)}
                />
              </Row>
              <Row label="Back up before stopping" desc="A pre-stop backup (kept: 5) is written while the server still runs.">
                <Switch checked={a.autoStop.backupFirst} onChange={(v) => save({ autoStop: { backupFirst: v } })} />
              </Row>
            </motion.div>
          )}
        </AnimatePresence>
        {!s.rcon && (
          <div className="flex items-center gap-2 px-5 py-2.5 text-xs text-amber">
            <Info size={12} /> Needs RCON enabled in server.properties to count players.
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="Wake on connect" desc={`Port ${s.port} through the Playit tunnel.`}>
        <Row
          label="Wake when a player joins"
          desc="While stopped, the server list shows “Sleeping”; joining starts the server (same memory check as Start) and asks the player to rejoin in ~30 s."
        >
          <Switch checked={a.wake.enabled} onChange={(v) => save({ wake: { enabled: v } })} />
        </Row>
        {a.wake.enabled && (
          <div className="flex items-center gap-2 px-5 py-2.5 text-xs text-fg-3">
            <Badge tone={s.status === 'sleeping' ? 'blue' : 'neutral'} dot>
              {s.status === 'sleeping' ? 'Listening' : s.status === 'offline' ? 'Starting listener…' : 'Inactive while the server runs'}
            </Badge>
            <span>Pairs well with auto-stop.</span>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="Scheduled backup" desc="Daily, through the existing backup system (retention: scheduled backups).">
        <Row label="Back up daily" desc={a.schedule.enabled ? `Next: ${fmtWhen(sched?.next)} · last: ${fmtWhen(sched?.last)}` : 'Off'}>
          <Switch checked={a.schedule.enabled} onChange={(v) => save({ schedule: { enabled: v, tz } })} disabled={!helper} />
        </Row>
        <div className={cx('divide-y divide-line border-t border-line transition-opacity', !a.schedule.enabled && 'pointer-events-none opacity-40')}>
          <Row label="Time" desc={`In ${a.schedule.tz === tz ? 'your time zone' : a.schedule.tz} (${a.schedule.tz}).`}>
            <Select value={a.schedule.time} onChange={(v) => save({ schedule: { time: v, tz } })} options={TIMES} width={110} icon={Clock} />
          </Row>
          <Row label="Only if the server ran" desc="Skip days where the world did not change since the last scheduled backup.">
            <Switch checked={a.schedule.onlyIfRan} onChange={(v) => save({ schedule: { onlyIfRan: v } })} />
          </Row>
        </div>
      </SettingsGroup>
    </>
  );
}
