import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Bell, Info, Palette, ShieldCheck, SlidersHorizontal, Clock, UserRound, type LucideIcon } from 'lucide-react';
import { AccountLive, BehaviorSummary, NotificationsLive } from './SettingsLive';
import { toast, updateSetting, useApp } from '../lib/store';
import { IS_LIVE } from '../lib/mode';
import { Badge } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';
import { cx } from '../lib/format';
import { Button } from '../ui/Button';
import { Segmented, Select, Slider, Stepper, Switch } from '../ui/Controls';
import { KV, PageHeader, Reveal } from '../ui/Layout';
import { Row, SettingsGroup } from './detail/Tabs';

type Section = 'behavior' | 'backups' | 'safety' | 'appearance' | 'notifications' | 'account' | 'about';
const sections: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'behavior', label: 'Server behavior', icon: SlidersHorizontal },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'safety', label: 'Resource safety', icon: ShieldCheck },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  ...(IS_LIVE ? [{ id: 'account' as Section, label: 'Account', icon: UserRound }] : []),
  { id: 'about', label: 'About', icon: Info },
];

const times = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

/** Live mode: a control that the backend does not implement yet is shown as such, never as a working toggle. */
function Live({ children, label = 'Not available yet', tip }: { children: React.ReactNode; label?: string; tip?: string }) {
  if (!IS_LIVE) return <>{children}</>;
  const b = <Badge tone="neutral">{label}</Badge>;
  return tip ? <Tooltip content={tip}>{b}</Tooltip> : b;
}

export function SettingsPage() {
  const st = useApp((s) => s.settings);
  const host = useApp((s) => s.host);
  const servers = useApp((s) => s.servers);
  const schedule = useApp((s) => s.backupSchedule);
  const conn = useApp((s) => s.conn);
  const lanIp = host?.interfaces.find((i) => i.name === host.defaultIface)?.addresses[0]?.split('/')[0];
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
              {sec === 'behavior' && IS_LIVE && <BehaviorSummary />}
              {sec === 'behavior' && !IS_LIVE && (
                <>
                  <SettingsGroup title="Server behavior" desc="Keep the machine quiet when nobody is playing.">
                    <Row label="Auto-stop empty servers" desc="Stop a server once the last player leaves.">
                      <Live>
                        <Switch checked={st.autoStop} onChange={(v) => updateSetting('autoStop', v)} />
                      </Live>
                    </Row>
                    <Row label="Idle timeout" desc="How long an empty server keeps running.">
                      <Live>
                        <Select
                          value={st.idleTimeout}
                          onChange={(v) => updateSetting('idleTimeout', v)}
                          icon={Clock}
                          width={150}
                          options={['5 minutes', '10 minutes', '15 minutes', '30 minutes', '1 hour']}
                        />
                      </Live>
                    </Row>
                    <Row label="Wake on player connection" desc="Boot sleeping servers when a player joins through Playit.">
                      <Live>
                        <Switch checked={st.wakeOnConnect} onChange={(v) => updateSetting('wakeOnConnect', v)} />
                      </Live>
                    </Row>
                    <Row label="Backup before shutdown" desc="Snapshot the world each time a server stops.">
                      <Live>
                        <Switch checked={st.backupBeforeShutdown} onChange={(v) => updateSetting('backupBeforeShutdown', v)} />
                      </Live>
                    </Row>
                  </SettingsGroup>
                  <SettingsGroup title="Startup">
                    <Row label="Start servers on boot" desc={IS_LIVE ? 'Per instance: systemctl enable wyzi-mc@<id> (admin).' : 'Restore the servers that were running before a reboot.'}>
                      {IS_LIVE ? (
                        <Badge tone="neutral">{servers.filter((x) => x.enabled).map((x) => x.name).join(', ') || 'None enabled'}</Badge>
                      ) : (
                        <Switch checked={true} onChange={() => toast('Boot behavior is fixed in the prototype', 'info')} />
                      )}
                    </Row>
                    <Row label="Crash recovery" desc="Restart a server automatically after an unexpected exit.">
                      {IS_LIVE ? (
                        <Tooltip content="wyzi-mc@.service: Restart=on-failure, 30 s delay, at most 3 starts per hour, then the unit stays failed">
                          <Badge tone="neutral">systemd · max 3 / hour</Badge>
                        </Tooltip>
                      ) : (
                        <Segmented value="Once" onChange={() => toast('Saved', 'success')} options={['Off', 'Once', 'Always']} size="xs" />
                      )}
                    </Row>
                  </SettingsGroup>
                </>
              )}

              {sec === 'backups' && (
                <SettingsGroup title="Backups" desc="Written to /srv/storage/backups/minecraft on the bulk HDD.">
                  {IS_LIVE && (
                    <div className="px-5 py-3 text-xs text-fg-3">
                      Schedules and pre-stop backups are set per instance (server → Settings). Retention comes from each instance's env file.
                      <div className="mt-2 space-y-1">
                        {servers.filter((x) => x.automation).map((x) => (
                          <div key={x.id} className="flex items-center gap-2">
                            <span className="w-28 font-mono text-fg-2">{x.id}</span>
                            <Badge tone={x.automation!.schedule.enabled ? 'mint' : 'neutral'}>{x.automation!.schedule.enabled ? `Daily ${x.automation!.schedule.time}` : 'Not scheduled'}</Badge>
                            <span className="num">keep {x.backup?.keep ?? 14} scheduled · {x.backup?.keepManual ?? 20} manual · 5 pre-stop</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <Row label="Automatic backups" desc="Back up every server that ran in the last 24 hours.">
                    <Live label="Per instance">
                      <Switch checked={st.autoBackups} onChange={(v) => updateSetting('autoBackups', v)} />
                    </Live>
                  </Row>
                  <div className={cx('divide-y divide-line transition-opacity', (!st.autoBackups || IS_LIVE) && 'pointer-events-none opacity-40')}>
                    <Row label="Backup time" desc="Runs while players are least likely to be online.">
                      <Select value={st.backupTime} onChange={(v) => updateSetting('backupTime', v)} options={times} width={110} icon={Clock} />
                    </Row>
                    <Row label="Retain backups" desc="Older automatic backups are pruned. Manual backups are kept.">
                      <Stepper value={st.retainDays} onChange={(v) => updateSetting('retainDays', v)} min={1} max={90} suffix="days" />
                    </Row>
                    <Row label="Compression" desc={IS_LIVE ? 'zstd level 6, 2 threads (wyzi-backup).' : undefined}>
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
                        <div className="text-xs text-fg-3">
                          Amount of MemAvailable kept free for the OS and page cache after a server reaches its full heap + JVM overhead. Servers that would eat into it are blocked
                          {IS_LIVE ? ' by the backend.' : '.'}
                        </div>
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
                    {IS_LIVE ? <Badge tone="neutral">Always</Badge> : <Switch checked={true} onChange={() => toast('Saved', 'success')} />}
                  </Row>
                  <Row label="Warn on high CPU temperature" desc="Above 80°C for more than a minute.">
                    <Live>
                      <Switch checked={st.notifyLowMem} onChange={(v) => updateSetting('notifyLowMem', v)} />
                    </Live>
                  </Row>
                </SettingsGroup>
              )}

              {sec === 'appearance' && (
                <SettingsGroup title="Appearance">
                  <Row label="Theme" desc="Graphite is the default.">
                    {IS_LIVE ? (
                      <Badge tone="neutral">Graphite</Badge>
                    ) : (
                      <Segmented value={st.theme} onChange={(v) => { updateSetting('theme', v); if (v !== 'Graphite') toast('Only Graphite is designed so far', 'info'); }} options={['Graphite', 'Midnight', 'Light']} size="xs" />
                    )}
                  </Row>
                  <Row label="Compact mode" desc="Tighter rows in lists and settings. Saved in this browser.">
                    <Switch checked={st.compact} onChange={(v) => updateSetting('compact', v)} />
                  </Row>
                  <Row label="Animations" desc="Transitions, chart reveals and status motion. Saved in this browser.">
                    <Switch checked={st.animations} onChange={(v) => updateSetting('animations', v)} />
                  </Row>
                  <Row label="Accent" desc="Interactive accent. Healthy states always use green.">
                    {IS_LIVE ? <Badge tone="blue">Slate blue</Badge> : <div className="flex gap-1.5">
                      {['#7AA2D9', '#8D97B0', '#9A92C8', '#9B9FA8'].map((c, i) => (
                        <button
                          key={c}
                          onClick={() => i && toast('Accent colors are fixed in the prototype', 'info')}
                          className={cx('h-5 w-5 rounded-full transition-transform hover:scale-110', i === 0 && 'ring-2 ring-fg/80 ring-offset-2 ring-offset-s-1')}
                          style={{ background: c }}
                        />
                      ))}
                    </div>}
                  </Row>
                </SettingsGroup>
              )}

              {sec === 'notifications' && IS_LIVE && <NotificationsLive />}
              {sec === 'account' && <AccountLive />}
              {sec === 'notifications' && !IS_LIVE && (
                <SettingsGroup title="Notifications" desc={IS_LIVE ? 'In-portal toasts for open browser tabs. Push delivery is not built yet.' : 'Shown in the portal. Push delivery comes later.'}>
                  <Row label="Server crashed">
                    {IS_LIVE ? <Badge tone="neutral">Always shown</Badge> : <Switch checked={st.notifyCrash} onChange={(v) => updateSetting('notifyCrash', v)} />}
                  </Row>
                  <Row label="Backup finished">
                    {IS_LIVE ? <Badge tone="neutral">Always shown</Badge> : <Switch checked={st.notifyBackup} onChange={(v) => updateSetting('notifyBackup', v)} />}
                  </Row>
                  <Row label="Low memory">
                    <Live>
                      <Switch checked={st.notifyLowMem} onChange={(v) => updateSetting('notifyLowMem', v)} />
                    </Live>
                  </Row>
                  <Row label="Tunnel disconnected">
                    {IS_LIVE ? <Badge tone="neutral">Logged</Badge> : <Switch checked={true} onChange={() => toast('Saved', 'success')} />}
                  </Row>
                </SettingsGroup>
              )}

              {sec === 'about' && (
                <SettingsGroup title="About">
                  <div className="px-5 py-2">
                    <KV k="Application" v="WYZI Server" />
                    <KV k="Version" v={IS_LIVE ? `${host?.portalVersion ?? '—'} · server-connected` : '0.2.0 · frontend prototype'} mono />
                    <KV k="Host" v={`${host?.hostname ?? '—'} · ${lanIp ?? location.hostname}`} mono />
                    <KV
                      k="Data"
                      v={IS_LIVE ? `Live from the FastAPI backend (${conn.state}). Privileged actions go through wyzi-helper.` : 'Simulated in the browser — no commands are executed'}
                    />
                  </div>
                  <Row label={IS_LIVE ? 'Reload portal' : 'Reset prototype state'} desc={IS_LIVE ? 'Re-fetch everything from the server.' : 'Reload to restore the original mock data.'}>
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
