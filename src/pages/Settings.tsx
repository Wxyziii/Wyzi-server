import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Bell, Info, Palette, ShieldCheck, SlidersHorizontal, Clock, type LucideIcon } from 'lucide-react';
import { toast, updateSetting, useApp } from '../lib/store';
import { cx } from '../lib/format';
import { Button } from '../ui/Button';
import { Segmented, Select, Slider, Stepper, Switch } from '../ui/Controls';
import { KV, PageHeader, Reveal } from '../ui/Layout';
import { Row, SettingsGroup } from './detail/Tabs';

type Section = 'behavior' | 'backups' | 'safety' | 'appearance' | 'notifications' | 'about';
const sections: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'behavior', label: 'Server behavior', icon: SlidersHorizontal },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'safety', label: 'Resource safety', icon: ShieldCheck },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'about', label: 'About', icon: Info },
];

const times = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

export function SettingsPage() {
  const st = useApp((s) => s.settings);
  const [sec, setSec] = useState<Section>('behavior');

  return (
    <div>
      <Reveal>
        <PageHeader title="Settings">
          <span>Applies to every server unless overridden per instance</span>
        </PageHeader>
      </Reveal>

      <div className="flex gap-8 max-lg:flex-col max-lg:gap-4">
        <Reveal i={1} className="w-[200px] shrink-0 max-lg:w-full">
          <nav className="sticky top-4 flex flex-col gap-[2px] max-lg:flex-row max-lg:overflow-x-auto">
            {sections.map((s) => {
              const active = s.id === sec;
              return (
                <button
                  key={s.id}
                  onClick={() => setSec(s.id)}
                  className={cx('relative flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors', active ? 'text-fg' : 'text-fg-3 hover:bg-white/[0.025] hover:text-fg-2')}
                >
                  {active && (
                    <motion.span
                      layoutId="settings-nav"
                      className="absolute inset-0 rounded-md bg-s-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_var(--color-line-2)]"
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                  <s.icon size={14} className={cx('relative', active ? 'text-fg' : '')} />
                  <span className="relative">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </Reveal>

        <div className="max-w-[760px] min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={sec}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6"
            >
              {sec === 'behavior' && (
                <>
                  <SettingsGroup title="Server behavior" desc="Keep the machine quiet when nobody is playing.">
                    <Row label="Auto-stop empty servers" desc="Stop a server once the last player leaves.">
                      <Switch checked={st.autoStop} onChange={(v) => updateSetting('autoStop', v)} />
                    </Row>
                    <Row label="Idle timeout" desc="How long an empty server keeps running.">
                      <Select
                        value={st.idleTimeout}
                        onChange={(v) => updateSetting('idleTimeout', v)}
                        icon={Clock}
                        width={150}
                        options={['5 minutes', '10 minutes', '15 minutes', '30 minutes', '1 hour']}
                      />
                    </Row>
                    <Row label="Wake on player connection" desc="Boot sleeping servers when a player joins through Playit.">
                      <Switch checked={st.wakeOnConnect} onChange={(v) => updateSetting('wakeOnConnect', v)} />
                    </Row>
                    <Row label="Backup before shutdown" desc="Snapshot the world each time a server stops.">
                      <Switch checked={st.backupBeforeShutdown} onChange={(v) => updateSetting('backupBeforeShutdown', v)} />
                    </Row>
                  </SettingsGroup>
                  <SettingsGroup title="Startup">
                    <Row label="Start servers on boot" desc="Restore the servers that were running before a reboot.">
                      <Switch checked={true} onChange={() => toast('Boot behavior is fixed in the prototype', 'info')} />
                    </Row>
                    <Row label="Crash recovery" desc="Restart a server automatically after an unexpected exit.">
                      <Segmented value="Once" onChange={() => toast('Saved', 'success')} options={['Off', 'Once', 'Always']} size="xs" />
                    </Row>
                  </SettingsGroup>
                </>
              )}

              {sec === 'backups' && (
                <SettingsGroup title="Backups" desc="Written to /mnt/archive/backups on the HDD.">
                  <Row label="Automatic backups" desc="Back up every server that ran in the last 24 hours.">
                    <Switch checked={st.autoBackups} onChange={(v) => updateSetting('autoBackups', v)} />
                  </Row>
                  <div className={cx('divide-y divide-line transition-opacity', !st.autoBackups && 'pointer-events-none opacity-40')}>
                    <Row label="Backup time" desc="Runs while players are least likely to be online.">
                      <Select value={st.backupTime} onChange={(v) => updateSetting('backupTime', v)} options={times} width={110} icon={Clock} />
                    </Row>
                    <Row label="Retain backups" desc="Older automatic backups are pruned. Manual backups are kept.">
                      <Stepper value={st.retainDays} onChange={(v) => updateSetting('retainDays', v)} min={1} max={90} suffix="days" />
                    </Row>
                    <Row label="Compression">
                      <Select value={st.compression} onChange={(v) => updateSetting('compression', v)} width={180} options={['zstd (fast)', 'zstd (balanced)', 'zstd (max)', 'None']} />
                    </Row>
                  </div>
                </SettingsGroup>
              )}

              {sec === 'safety' && (
                <SettingsGroup title="Resource safety" desc="Prevents the host from running out of memory.">
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Memory headroom</div>
                        <div className="text-xs text-fg-3">Kept free for the OS, page cache and JVM overhead. Servers that would eat into it are blocked.</div>
                      </div>
                      <div className="num text-[20px] font-semibold tracking-tight">
                        {st.safetyHeadroom.toFixed(1)}
                        <span className="ml-1 text-sm font-normal text-fg-3">GB</span>
                      </div>
                    </div>
                    <div className="mt-4">
                      <Slider value={st.safetyHeadroom} onChange={(v) => updateSetting('safetyHeadroom', v)} min={0.5} max={5} step={0.5} marks={[1, 2, 3, 4]} />
                      <div className="num mt-1.5 flex justify-between text-2xs text-fg-4">
                        <span>0.5 GB · risky</span>
                        <span>5 GB · conservative</span>
                      </div>
                    </div>
                  </div>
                  <Row label="Ask before stopping another server" desc="Show the memory dialog instead of refusing outright.">
                    <Switch checked={true} onChange={() => toast('Saved', 'success')} />
                  </Row>
                  <Row label="Warn on high CPU temperature" desc="Above 80°C for more than a minute.">
                    <Switch checked={st.notifyLowMem} onChange={(v) => updateSetting('notifyLowMem', v)} />
                  </Row>
                </SettingsGroup>
              )}

              {sec === 'appearance' && (
                <SettingsGroup title="Appearance">
                  <Row label="Theme" desc="Graphite is the default.">
                    <Segmented value={st.theme} onChange={(v) => { updateSetting('theme', v); if (v !== 'Graphite') toast('Only Graphite is designed so far', 'info'); }} options={['Graphite', 'Midnight', 'Light']} size="xs" />
                  </Row>
                  <Row label="Compact mode" desc="Tighter rows in lists and settings.">
                    <Switch checked={st.compact} onChange={(v) => updateSetting('compact', v)} />
                  </Row>
                  <Row label="Animations" desc="Transitions, chart reveals and status motion.">
                    <Switch checked={st.animations} onChange={(v) => updateSetting('animations', v)} />
                  </Row>
                  <Row label="Accent" desc="Used for healthy and active states.">
                    <div className="flex gap-1.5">
                      {['#7AA2D9', '#8D97B0', '#9A92C8', '#9B9FA8'].map((c, i) => (
                        <button
                          key={c}
                          onClick={() => i && toast('Accent colors are fixed in the prototype', 'info')}
                          className={cx('h-5 w-5 rounded-full transition-transform hover:scale-110', i === 0 && 'ring-2 ring-fg/80 ring-offset-2 ring-offset-s-1')}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </Row>
                </SettingsGroup>
              )}

              {sec === 'notifications' && (
                <SettingsGroup title="Notifications" desc="Shown in the portal. Push delivery comes later.">
                  <Row label="Server crashed">
                    <Switch checked={st.notifyCrash} onChange={(v) => updateSetting('notifyCrash', v)} />
                  </Row>
                  <Row label="Backup finished">
                    <Switch checked={st.notifyBackup} onChange={(v) => updateSetting('notifyBackup', v)} />
                  </Row>
                  <Row label="Low memory">
                    <Switch checked={st.notifyLowMem} onChange={(v) => updateSetting('notifyLowMem', v)} />
                  </Row>
                  <Row label="Tunnel disconnected">
                    <Switch checked={true} onChange={() => toast('Saved', 'success')} />
                  </Row>
                </SettingsGroup>
              )}

              {sec === 'about' && (
                <SettingsGroup title="About">
                  <div className="px-5 py-2">
                    <KV k="Application" v="WYZI Server" />
                    <KV k="Version" v="0.1.0 · frontend prototype" mono />
                    <KV k="Host" v="WYZI-SERVER · 192.168.1.40" mono />
                    <KV k="Data" v="Simulated in the browser — no commands are executed" />
                  </div>
                  <Row label="Reset prototype state" desc="Reload to restore the original mock data.">
                    <Button size="sm" variant="secondary" onClick={() => location.reload()}>
                      Reload
                    </Button>
                  </Row>
                </SettingsGroup>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
