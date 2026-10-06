import { useState } from 'react';
import {
  Activity as ActivityIcon,
  Archive,
  ArrowUpRight,
  Box,
  Check,
  Copy,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  HeartPulse,
  MemoryStick,
  Radio,
  RefreshCw,
  Thermometer,
} from 'lucide-react';
import { navigate } from '../lib/router';
import { createBackup, isDeployed, memoryBreakdown, restartTunnel, useApp, BACKUP_STEPS } from '../lib/store';
import { IS_LIVE } from '../lib/mode';
import { diskLabel, fmtBytes, GB, useUpdates, useUptime } from '../lib/hooks';
import { cx, fmtUptime } from '../lib/format';
import { AreaChart, Meter, Num, Sparkline, StackedBar } from '../ui/Charts';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Controls';
import { Panel, Reveal } from '../ui/Layout';
import { Badge, Dot } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';
import { ActivityFeed, MemoryComposition, ServerRow, StripMetric } from './widgets';
import { copyAddress, usePublicAddress } from './shared';

type Mode = 'cpu' | 'memory' | 'disk' | 'network';

export function Dashboard() {
  const servers = useApp((s) => s.servers);
  const sys = useApp((s) => s.sys);
  const playit = useApp((s) => s.playit);
  const backups = useApp((s) => s.backups);
  const job = useApp((s) => s.backupJob);
  const memory = useApp((s) => s.memory);
  const host = useApp((s) => s.host);
  const storage = useApp((s) => s.storage);
  const conn = useApp((s) => s.conn);
  const schedule = useApp((s) => s.backupSchedule);
  const updates = useUpdates();
  const uptime = useUptime();
  const address = usePublicAddress();
  const [mode, setMode] = useState<Mode>('cpu');
  const [copied, setCopied] = useState(false);
  const mem = memoryBreakdown(memory);
  // non-reclaimable use: page cache is free memory on Linux
  const inUse = Math.max(0, mem.total - memory.available);
  const memPct = (inUse / mem.total) * 100;
  const sysVol = storage?.volumes.find((v) => v.id === 'system');
  const bulkVol = storage?.volumes.find((v) => v.id === 'bulk');
  const sensors = sys.sensors ?? [];
  const gpuTemp = sensors.find((x) => x.label === 'GPU')?.value;
  const running = servers.filter((s) => s.status === 'running');
  const counts = {
    running: running.length,
    sleeping: servers.filter((s) => s.status === 'sleeping').length,
    offline: servers.filter((s) => s.status === 'offline').length,
  };
  const degraded = playit.status !== 'connected';
  const offline = conn.state !== 'online';
  const statusLabel = offline ? 'Live data unavailable' : playit.status === 'reconnecting' ? 'Tunnel reconnecting' : degraded ? 'Tunnel offline' : 'All systems operational';
  const tunnelCount = playit.tunnels?.filter((t) => t.state !== 'disabled').length ?? 0;

  const chart = {
    cpu: { series: [{ data: sys.hist.cpu, color: 'blue' as const, label: 'CPU' }], max: 100, format: (v: number) => `${v.toFixed(0)}%`, threshold: { value: 85, label: 'Sustained load limit' } },
    memory: {
      series: [{ data: sys.hist.ram, color: 'slate' as const, label: 'In use' }],
      max: mem.total,
      format: (v: number) => `${v.toFixed(1)}G`,
      threshold: { value: mem.total - memory.headroom, label: `Safe ceiling · ${(mem.total - memory.headroom).toFixed(1)} GB` },
    },
    disk: {
      series: [
        { data: sys.hist.diskR, color: 'blue' as const, label: 'Read' },
        { data: sys.hist.diskW, color: 'violet' as const, label: 'Write', fill: false },
      ],
      max: undefined,
      format: (v: number) => `${v.toFixed(0)}M`,
      threshold: undefined,
    },
    network: {
      series: [
        { data: sys.hist.netOut, color: 'blue' as const, label: 'Egress' },
        { data: sys.hist.netIn, color: 'slate' as const, label: 'Ingress', fill: false },
      ],
      max: undefined,
      format: (v: number) => `${v.toFixed(1)}M`,
      threshold: undefined,
    },
  }[mode];

  const lastBackup = backups.find((b) => b.status === 'success');
  const backupTarget = servers.find((x) => x.status === 'running') ?? servers.find(isDeployed);
  const nextScheduled = Object.values(schedule).find((x) => x.enabled && x.next)?.next;
  const bulkBackups = bulkVol?.categories.find((c) => c.label === 'Minecraft backups')?.bytes ?? 0;

  return (
    <div>
      {/* header */}
      <Reveal className="flex flex-wrap items-end justify-between gap-4 pb-5">
        <div>
          <div className="eyebrow mb-1.5">Server</div>
          <div className="flex items-center gap-3">
            <h1 className="text-[24px] leading-7 font-semibold tracking-[-0.02em]">WYZI-SERVER</h1>
            <span
              className={cx(
                'flex h-6 items-center gap-2 rounded-full px-2.5 text-xs font-medium transition-colors',
                degraded || offline ? 'bg-amber/[0.08] text-amber shadow-[inset_0_0_0_1px_rgba(229,173,79,0.2)]' : 'bg-mint/[0.07] text-mint shadow-[inset_0_0_0_1px_rgba(62,207,142,0.18)]',
              )}
            >
              <Dot tone={degraded || offline ? 'amber' : 'mint'} pulse size={6} />
              {statusLabel}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
            <span>{host?.os ?? '—'}</span>
            <span className="h-3 w-px bg-line-3" />
            <span className="font-mono text-[11px]">{host?.kernel ?? '—'}</span>
            <span className="h-3 w-px bg-line-3" />
            <span className="font-mono text-[11px]">{host?.hostname ?? '—'}</span>
            <span className="h-3 w-px bg-line-3" />
            <span>
              Up <span className="num text-fg-2">{fmtUptime(uptime)}</span>
            </span>
            <span className="h-3 w-px bg-line-3" />
            <span>
              Load <span className="num text-fg-2">{sys.load.map((l) => l.toFixed(2)).join('  ')}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={Archive} onClick={() => navigate('/backups')}>
            Backups
          </Button>
          <Button variant="secondary" icon={Box} onClick={() => navigate('/servers')}>
            Manage servers
          </Button>
        </div>
      </Reveal>

      <div className="grid grid-cols-12 gap-4">
        {/* ───────── System overview ───────── */}
        <Reveal i={1} className="order-1 col-span-12 xl:col-span-8">
          <section className="surface overflow-hidden rounded-xl">
            <div className="grid grid-cols-2 divide-line md:grid-cols-5 md:divide-x [&>*]:border-b [&>*]:border-line md:[&>*]:border-b-0">
              <StripMetric
                icon={Cpu}
                label="CPU"
                sub={host?.cpuShort}
                onClick={() => setMode('cpu')}
                tip={host ? `${host.cores} cores · ${host.threads} threads · up to ${((host.cpuMaxMhz ?? 0) / 1000).toFixed(1)} GHz${sys.freqMhz ? ` · now ${sys.freqMhz} MHz` : ''}` : undefined}
              >
                <Num value={sys.cpu} className="text-[26px] leading-none font-semibold tracking-[-0.03em]" />
                <span className="text-sm text-fg-3">%</span>
                <span className="ml-auto flex items-center gap-1 text-xs text-fg-3">
                  <Thermometer size={11} />
                  <span className="num">{sys.temp ? `${Math.round(sys.temp)}°C` : '—'}</span>
                </span>
              </StripMetric>
              <StripMetric icon={MemoryStick} label="Memory" sub={`${Math.round(mem.total)} GB`} onClick={() => setMode('memory')} tip={`MemAvailable ${memory.available.toFixed(1)} GB`}>
                <Num value={inUse} format={(v) => v.toFixed(1)} className="text-[26px] leading-none font-semibold tracking-[-0.03em]" />
                <span className="num text-sm text-fg-3">/ {mem.total.toFixed(1)} GB</span>
              </StripMetric>
              <StripMetric icon={HardDrive} label="System" sub={sysVol?.disk ? `${diskLabel(sysVol.disk.sizeBytes)} ${sysVol.disk.kind}` : undefined} onClick={() => navigate('/storage')} tip="OS + active Minecraft instances">
                <span className="num text-[26px] leading-none font-semibold tracking-[-0.03em]">{sysVol ? Math.round(sysVol.used / GB) : '—'}</span>
                <span className="num text-sm text-fg-3">/ {sysVol ? Math.round(sysVol.total / GB) : '—'} GB</span>
              </StripMetric>
              <StripMetric icon={Database} label="Bulk" sub={bulkVol?.disk ? `${diskLabel(bulkVol.disk.sizeBytes)} ${bulkVol.disk.kind}` : undefined} onClick={() => navigate('/storage')} tip="Backups · archives">
                <span className="num text-[26px] leading-none font-semibold tracking-[-0.03em]">{bulkVol ? (bulkVol.used / (1024 * GB)).toFixed(1) : '—'}</span>
                <span className="num text-sm text-fg-3">/ {bulkVol ? (bulkVol.total / (1024 * GB)).toFixed(1) : '—'} TB</span>
              </StripMetric>
              <StripMetric icon={Radio} label="Network" sub="Playit" onClick={() => navigate('/network')}>
                <span className={cx('text-[17px] leading-[26px] font-semibold tracking-[-0.01em] transition-colors', degraded ? 'text-amber' : 'text-fg')}>
                  {playit.status === 'connected' ? 'Connected' : playit.status === 'reconnecting' ? 'Reconnecting' : playit.status === 'offline' ? 'Offline' : 'Unknown'}
                </span>
              </StripMetric>
            </div>
            <div className="grid grid-cols-2 border-t border-line md:grid-cols-5 md:divide-x md:divide-line">
              <div className="px-4 pt-1 pb-3.5">
                <Sparkline data={sys.hist.cpu.slice(-30)} width={150} height={22} max={100} className="w-full" />
              </div>
              <div className="px-4 pt-2 pb-3.5">
                <Meter value={memPct} tone="auto" height={4} />
                <div className="num mt-1.5 text-2xs text-fg-4">{memPct.toFixed(0)}% · {memory.available.toFixed(1)} GB available</div>
              </div>
              <div className="px-4 pt-2 pb-3.5">
                <Meter value={sysVol?.used ?? 0} max={sysVol?.total || 1} tone="blue" height={4} />
                <div className="num mt-1.5 text-2xs text-fg-4">{sysVol ? `${sysVol.percent.toFixed(0)}% · ${Math.round(sysVol.free / GB)} GB free` : '—'}</div>
              </div>
              <div className="px-4 pt-2 pb-3.5">
                <Meter value={bulkVol?.used ?? 0} max={bulkVol?.total || 1} tone="violet" height={4} />
                <div className="num mt-1.5 text-2xs text-fg-4">{bulkVol ? `${bulkVol.percent.toFixed(0)}% · ${fmtBytes(bulkVol.free)} free` : '—'}</div>
              </div>
              <div className="px-4 pt-2 pb-3.5">
                <div className="flex items-center gap-2">
                  <Dot tone={degraded ? 'amber' : 'mint'} pulse={!degraded} size={6} />
                  <span className="num text-xs text-fg-2">{degraded || playit.latency == null ? '—' : `${playit.latency} ms`}</span>
                  <span className="text-2xs text-fg-4">edge RTT</span>
                </div>
                <div className="mt-1 text-2xs text-fg-4">Since {playit.since}</div>
              </div>
            </div>

            {/* utilization chart */}
            <div className="border-t border-line px-4 pt-3.5 pb-3">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <ActivityIcon size={13} className="text-fg-3" />
                  <span className="text-sm font-medium">Utilization</span>
                  <span className="text-xs text-fg-4">Live · 90 s window · 1.5 s sample</span>
                </div>
                <div className="ml-auto">
                  <Segmented
                    size="xs"
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'cpu', label: 'CPU' },
                      { value: 'memory', label: 'Memory' },
                      { value: 'disk', label: 'Disk I/O' },
                      { value: 'network', label: 'Network' },
                    ]}
                  />
                </div>
              </div>
              <AreaChart key={mode} series={chart.series} max={chart.max} format={chart.format} threshold={chart.threshold} height={196} />
            </div>
          </section>
        </Reveal>

        {/* ───────── Memory ───────── */}
        <Reveal i={2} className="order-3 col-span-12 md:col-span-6 xl:order-2 xl:col-span-4">
          <Panel
            title="Memory"
            icon={MemoryStick}
            meta={`${mem.total.toFixed(1)} GB usable`}
            className="h-full"
            actions={
              memory.zram ? (
                <Tooltip content="Compressed swap in RAM — an emergency buffer, not extra Minecraft memory">
                  <Badge tone="neutral">zram {memory.zram.size.toFixed(1)} GB</Badge>
                </Tooltip>
              ) : undefined
            }
          >
            <MemoryComposition />
          </Panel>
        </Reveal>

        {/* ───────── Servers ───────── */}
        <Reveal i={3} className="order-2 col-span-12 xl:order-3 xl:col-span-8">
          <Panel
            title="Minecraft servers"
            icon={Box}
            meta={`${counts.running} running · ${counts.sleeping} sleeping · ${counts.offline} offline`}
            flush
            actions={
              <Button size="xs" variant="ghost" iconRight={ArrowUpRight} onClick={() => navigate('/servers')}>
                All servers
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                {servers.map((s) => (
                  <ServerRow key={s.id} s={s} />
                ))}
              </div>
            </div>
          </Panel>
        </Reveal>

        {/* ───────── Activity ───────── */}
        <Reveal i={4} className="order-4 col-span-12 md:col-span-6 xl:col-span-4 xl:row-span-2">
          <Panel
            title="Recent activity"
            icon={ActivityIcon}
            className="h-full"
            bodyClass="px-4 py-1.5"
            actions={
              <Button size="xs" variant="ghost" onClick={() => navigate('/logs')}>
                Logs
              </Button>
            }
          >
            <ActivityFeed limit={8} />
          </Panel>
        </Reveal>

        {/* ───────── Health / Tunnel / Backups ───────── */}
        <Reveal i={5} className="order-5 col-span-12 xl:col-span-8">
          <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-3">
            <Panel title="Machine health" icon={HeartPulse} bodyClass="px-4 py-2">
              <HealthRow label="CPU package" value={sys.temp ? `${Math.round(sys.temp)}°C` : '—'} tone={!sys.temp ? 'neutral' : sys.temp > 75 ? 'amber' : 'mint'} />
              {host?.gpus.length ? (
                <HealthRow label={host.gpus[0].split(' (')[0] + ' GPU'} value={gpuTemp ? `${Math.round(gpuTemp)}°C idle` : 'idle'} tone="neutral" tip={`${host.gpus[0]} · not used by the server`} />
              ) : null}
              {(storage?.volumes ?? []).map((v) => {
                const d = v.disk;
                const sm = d?.smart;
                const ok = sm?.available ? sm.passed && !sm.pending && !sm.uncorrectable : null;
                return (
                  <HealthRow
                    key={v.id}
                    label={`${d ? diskLabel(d.sizeBytes) : ''} ${d?.kind ?? 'Disk'} · SMART`}
                    value={ok == null ? 'No data' : ok ? 'Healthy' : 'Check'}
                    tone={ok == null ? 'neutral' : ok ? 'mint' : 'amber'}
                    tip={d ? `${d.model}${sm?.temp != null ? ` · ${sm.temp}°C` : ''}${sm?.reallocated != null ? ` · ${sm.reallocated} reallocated` : ''}${sm?.available ? '' : ' · SMART export not installed'}` : undefined}
                  />
                );
              })}
              <HealthRow label="Swap" value={`${memory.swapUsed.toFixed(1)} / ${memory.swapTotal.toFixed(1)} GB`} tone={memory.swapUsed > 0.5 ? 'amber' : 'mint'} tip="zram + swap file · emergency only" />
              <HealthRow
                label="Updates"
                value={updates ? `${updates.items.length} available` : '—'}
                tone={updates?.items.some((u) => u.sec) ? 'amber' : 'neutral'}
                onClick={() => navigate('/system')}
              />
            </Panel>

            <Panel
              title="Playit tunnel"
              icon={Radio}
              actions={
                <Tooltip content="Restart tunnel">
                  <button
                    onClick={restartTunnel}
                    className="flex h-6 w-6 items-center justify-center rounded-[5px] text-fg-3 transition-colors hover:bg-white/5 hover:text-fg"
                  >
                    <RefreshCw size={12.5} className={degraded ? 'animate-spin' : ''} />
                  </button>
                </Tooltip>
              }
            >
              <div className="eyebrow">Public address</div>
              <button
                onClick={async () => {
                  await copyAddress(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="group mt-1.5 flex w-full items-center gap-2 rounded-md border border-line-2 bg-bg-1 px-2.5 py-2 text-left transition-colors hover:border-line-3"
              >
                <span className="flex-1 truncate font-mono text-[11.5px] text-fg">{address ?? 'No tunnel address yet'}</span>
                {copied ? <Check size={13} className="text-mint" /> : <Copy size={13} className="text-fg-4 group-hover:text-fg-2" />}
              </button>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-2xs text-fg-4">Latency</div>
                  <div className="num mt-0.5 text-sm font-medium">{degraded || playit.latency == null ? '—' : `${playit.latency} ms`}</div>
                </div>
                <div>
                  <div className="text-2xs text-fg-4">Tunnels</div>
                  <div className="num mt-0.5 text-sm font-medium">
                    {tunnelCount} <span className="font-normal text-fg-3">active</span>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              title="Backups"
              icon={Archive}
              actions={
                <Button size="xs" variant="ghost" onClick={() => backupTarget && createBackup(backupTarget.id)} disabled={!!job || !backupTarget}>
                  Run now
                </Button>
              }
            >
              {job ? (
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fg">{job.kind === 'restore' ? 'Restoring…' : 'Backing up…'}</span>
                    <span className="num text-fg-2">{Math.round(job.progress * 100)}%</span>
                  </div>
                  <Meter className="mt-2" value={job.progress * 100} tone="blue" height={4} striped />
                  <div className="mt-2 text-xs text-fg-3">{BACKUP_STEPS[job.step]}</div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    {lastBackup ? <Check size={13} className="text-mint" /> : null}
                    <span className="text-fg">{lastBackup ? 'Last backup succeeded' : 'No backups yet'}</span>
                  </div>
                  <div className="mt-1 text-xs text-fg-3">
                    {lastBackup ? `${lastBackup.when} · ${servers.find((x) => x.id === lastBackup.serverId)?.name ?? lastBackup.serverId} · ${lastBackup.size} GB` : 'Create one from the Backups page'}
                  </div>
                </div>
              )}
              <div className="mt-3 border-t border-line pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-3">Next scheduled</span>
                  <span className="num text-fg-2">{IS_LIVE ? (nextScheduled ? nextScheduled.replace(/^\w+ /, '').slice(0, 16) : 'Not scheduled') : 'Tomorrow 03:00'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-fg-3">Backups on bulk HDD</span>
                  <span className="num text-fg-2">{fmtBytes(bulkBackups)}</span>
                </div>
                <StackedBar
                  className="mt-2"
                  height={4}
                  total={bulkVol?.total || 1}
                  segments={[
                    { label: 'Backups', value: bulkBackups, color: '#9A92C8' },
                    { label: 'Other', value: Math.max(0, (bulkVol?.used ?? 0) - bulkBackups), color: '#55516f' },
                    { label: 'Free', value: bulkVol?.free ?? 0, color: '#1f2025' },
                  ]}
                />
              </div>
            </Panel>
          </div>
        </Reveal>
      </div>

      <Reveal i={6} className="mt-5 flex items-center justify-center gap-2 text-2xs text-fg-4">
        <Gauge size={11} /> {IS_LIVE ? `Live · ${host?.hostname ?? 'server'} · portal ${host?.portalVersion ?? ''}` : 'Prototype · all data is simulated locally'}
      </Reveal>
    </div>
  );
}

function HealthRow({ label, value, tone, tip, onClick }: { label: string; value: string; tone: 'mint' | 'amber' | 'neutral'; tip?: string; onClick?: () => void }) {
  const row = (
    <div onClick={onClick} className={cx('flex w-full items-center gap-2.5 py-[7px] text-sm', onClick && 'cursor-pointer')}>
      <Dot tone={tone} size={6} />
      <span className="flex-1 text-fg-2">{label}</span>
      <span className={cx('num text-xs', tone === 'amber' ? 'text-amber' : 'text-fg')}>{value}</span>
    </div>
  );
  return tip ? (
    <Tooltip content={tip} className="flex w-full">
      {row}
    </Tooltip>
  ) : (
    row
  );
}
