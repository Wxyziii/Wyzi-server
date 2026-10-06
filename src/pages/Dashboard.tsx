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
import { createBackup, memoryBreakdown, restartTunnel, TOTAL_RAM, useApp, BACKUP_STEPS } from '../lib/store';
import { cx } from '../lib/format';
import { AreaChart, Meter, Num, Sparkline, StackedBar } from '../ui/Charts';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Controls';
import { Panel, Reveal } from '../ui/Layout';
import { Badge, Dot } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';
import { ActivityFeed, MemoryComposition, ServerRow, StripMetric } from './widgets';
import { copyAddress, PUBLIC_ADDRESS } from './shared';

type Mode = 'cpu' | 'memory' | 'disk' | 'network';

export function Dashboard() {
  const servers = useApp((s) => s.servers);
  const sys = useApp((s) => s.sys);
  const playit = useApp((s) => s.playit);
  const backups = useApp((s) => s.backups);
  const job = useApp((s) => s.backupJob);
  const [mode, setMode] = useState<Mode>('cpu');
  const [copied, setCopied] = useState(false);
  const mem = memoryBreakdown(servers, sys.cache);
  const memPct = ((mem.used + mem.cache) / TOTAL_RAM) * 100;
  const running = servers.filter((s) => s.status === 'running');
  const counts = {
    running: running.length,
    sleeping: servers.filter((s) => s.status === 'sleeping').length,
    offline: servers.filter((s) => s.status === 'offline').length,
  };
  const degraded = playit.status !== 'connected';

  const chart = {
    cpu: { series: [{ data: sys.hist.cpu, color: 'blue' as const, label: 'CPU' }], max: 100, format: (v: number) => `${v.toFixed(0)}%`, threshold: { value: 85, label: 'Sustained load limit' } },
    memory: {
      series: [{ data: sys.hist.ram, color: 'slate' as const, label: 'In use' }],
      max: TOTAL_RAM,
      format: (v: number) => `${v.toFixed(1)}G`,
      threshold: { value: TOTAL_RAM - 2.5, label: 'Safe ceiling · 13.1 GB' },
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

  const lastBackup = backups.find((b) => b.status === 'success')!;

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
                degraded ? 'bg-amber/[0.08] text-amber shadow-[inset_0_0_0_1px_rgba(229,173,79,0.2)]' : 'bg-mint/[0.07] text-mint shadow-[inset_0_0_0_1px_rgba(62,207,142,0.18)]',
              )}
            >
              <Dot tone={degraded ? 'amber' : 'mint'} pulse size={6} />
              {degraded ? 'Tunnel reconnecting' : 'All systems operational'}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
            <span>Debian 12 (bookworm)</span>
            <span className="h-3 w-px bg-line-3" />
            <span className="font-mono text-[11px]">6.1.0-26-amd64</span>
            <span className="h-3 w-px bg-line-3" />
            <span>
              Up <span className="num text-fg-2">12d 4h 18m</span>
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
              <StripMetric icon={Cpu} label="CPU" sub="i5-6500" onClick={() => setMode('cpu')} tip="4 cores · 3.2 GHz base · 3.6 GHz boost">
                <Num value={sys.cpu} className="text-[26px] leading-none font-semibold tracking-[-0.03em]" />
                <span className="text-sm text-fg-3">%</span>
                <span className="ml-auto flex items-center gap-1 text-xs text-fg-3">
                  <Thermometer size={11} />
                  <span className="num">{sys.temp}°C</span>
                </span>
              </StripMetric>
              <StripMetric icon={MemoryStick} label="Memory" sub="DDR4" onClick={() => setMode('memory')}>
                <Num value={mem.used + mem.cache} format={(v) => v.toFixed(1)} className="text-[26px] leading-none font-semibold tracking-[-0.03em]" />
                <span className="num text-sm text-fg-3">/ 15.6 GB</span>
              </StripMetric>
              <StripMetric icon={HardDrive} label="Storage" sub="SSD" onClick={() => navigate('/storage')}>
                <span className="num text-[26px] leading-none font-semibold tracking-[-0.03em]">186</span>
                <span className="num text-sm text-fg-3">/ 500 GB</span>
              </StripMetric>
              <StripMetric icon={Database} label="Archive" sub="HDD" onClick={() => navigate('/storage')}>
                <span className="num text-[26px] leading-none font-semibold tracking-[-0.03em]">2.1</span>
                <span className="num text-sm text-fg-3">/ 5 TB</span>
              </StripMetric>
              <StripMetric icon={Radio} label="Network" sub="Playit" onClick={() => navigate('/network')}>
                <span className={cx('text-[17px] leading-[26px] font-semibold tracking-[-0.01em] transition-colors', degraded ? 'text-amber' : 'text-fg')}>
                  {degraded ? 'Reconnecting' : 'Connected'}
                </span>
              </StripMetric>
            </div>
            <div className="grid grid-cols-2 border-t border-line md:grid-cols-5 md:divide-x md:divide-line">
              <div className="px-4 pt-1 pb-3.5">
                <Sparkline data={sys.hist.cpu.slice(-30)} width={150} height={22} max={100} className="w-full" />
              </div>
              <div className="px-4 pt-2 pb-3.5">
                <Meter value={memPct} tone="auto" height={4} />
                <div className="num mt-1.5 text-2xs text-fg-4">{memPct.toFixed(0)}% · {mem.available.toFixed(1)} GB free</div>
              </div>
              <div className="px-4 pt-2 pb-3.5">
                <Meter value={186} max={500} tone="blue" height={4} />
                <div className="num mt-1.5 text-2xs text-fg-4">37% · 314 GB free</div>
              </div>
              <div className="px-4 pt-2 pb-3.5">
                <Meter value={2.1} max={5} tone="violet" height={4} />
                <div className="num mt-1.5 text-2xs text-fg-4">42% · 2.9 TB free</div>
              </div>
              <div className="px-4 pt-2 pb-3.5">
                <div className="flex items-center gap-2">
                  <Dot tone={degraded ? 'amber' : 'mint'} pulse={!degraded} size={6} />
                  <span className="num text-xs text-fg-2">{degraded ? '—' : `${playit.latency} ms`}</span>
                  <span className="text-2xs text-fg-4">eu-west</span>
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
            meta="15.6 GB usable"
            className="h-full"
            actions={
              <Tooltip content="16 GB installed · 0.4 GB reserved by firmware & iGPU">
                <Badge tone="neutral">2 × 8 GB</Badge>
              </Tooltip>
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
              <HealthRow label="CPU package" value={`${sys.temp}°C`} tone={sys.temp > 75 ? 'amber' : 'mint'} />
              <HealthRow label="GTX 1070 Ti" value="34°C idle" tone="neutral" tip="Planned for removal — saves ~15 W idle" />
              <HealthRow label="SSD · SMART" value="Healthy" tone="mint" tip="Samsung 860 EVO · 2% wear · 31°C" />
              <HealthRow label="HDD · SMART" value="Healthy" tone="mint" tip="WD Blue 5 TB · 0 reallocated sectors · 34°C" />
              <HealthRow label="Swap" value="0 B / 2 GB" tone="mint" />
              <HealthRow label="Updates" value="3 available" tone="amber" onClick={() => navigate('/system')} />
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
                  await copyAddress();
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="group mt-1.5 flex w-full items-center gap-2 rounded-md border border-line-2 bg-bg-1 px-2.5 py-2 text-left transition-colors hover:border-line-3"
              >
                <span className="flex-1 truncate font-mono text-[11.5px] text-fg">{PUBLIC_ADDRESS}</span>
                {copied ? <Check size={13} className="text-mint" /> : <Copy size={13} className="text-fg-4 group-hover:text-fg-2" />}
              </button>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-2xs text-fg-4">Latency</div>
                  <div className="num mt-0.5 text-sm font-medium">{degraded ? '—' : `${playit.latency} ms`}</div>
                </div>
                <div>
                  <div className="text-2xs text-fg-4">Tunnels</div>
                  <div className="num mt-0.5 text-sm font-medium">
                    2 <span className="font-normal text-fg-3">active</span>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              title="Backups"
              icon={Archive}
              actions={
                <Button size="xs" variant="ghost" onClick={() => createBackup('prominence-ii')} disabled={!!job}>
                  Run now
                </Button>
              }
            >
              {job ? (
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fg">Backing up…</span>
                    <span className="num text-fg-2">{Math.round(job.progress * 100)}%</span>
                  </div>
                  <Meter className="mt-2" value={job.progress * 100} tone="blue" height={4} striped />
                  <div className="mt-2 text-xs text-fg-3">{BACKUP_STEPS[job.step]}</div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check size={13} className="text-mint" />
                    <span className="text-fg">Last backup succeeded</span>
                  </div>
                  <div className="mt-1 text-xs text-fg-3">
                    {lastBackup.when} · {lastBackup.size} GB
                  </div>
                </div>
              )}
              <div className="mt-3 border-t border-line pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-3">Next scheduled</span>
                  <span className="num text-fg-2">Tomorrow 03:00</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-fg-3">Archive usage</span>
                  <span className="num text-fg-2">1.4 TB</span>
                </div>
                <StackedBar
                  className="mt-2"
                  height={4}
                  total={5}
                  segments={[
                    { label: 'b', value: 1.4, color: '#9A92C8' },
                    { label: 'a', value: 0.64, color: '#55516f' },
                    { label: 'f', value: 2.96, color: '#1f2025' },
                  ]}
                />
              </div>
            </Panel>
          </div>
        </Reveal>
      </div>

      <Reveal i={6} className="mt-5 flex items-center justify-center gap-2 text-2xs text-fg-4">
        <Gauge size={11} /> Prototype · all data is simulated locally
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
