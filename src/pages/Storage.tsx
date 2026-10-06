import { Database, FolderOpen, HardDrive, Thermometer, Activity, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../lib/store';
import { cx } from '../lib/format';
import { AreaChart, Meter, StackedBar } from '../ui/Charts';
import { KV, PageHeader, Panel, Reveal } from '../ui/Layout';
import { Badge } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';

interface Drive {
  id: string;
  name: string;
  role: string;
  model: string;
  icon: typeof HardDrive;
  used: number;
  total: number;
  unit: string;
  mount: string;
  fs: string;
  temp: string;
  health: string;
  extra: [string, string][];
  segments: { label: string; value: number; color: string; detail: string }[];
}

const drives: Drive[] = [
  {
    id: 'ssd',
    name: 'SSD',
    role: 'Operating system + active Minecraft instances',
    model: 'Samsung 860 EVO 500 GB · SATA',
    icon: HardDrive,
    used: 186,
    total: 500,
    unit: 'GB',
    mount: '/',
    fs: 'ext4',
    temp: '31°C',
    health: '98%',
    extra: [
      ['Written', '41.3 TB'],
      ['Power-on', '19,204 h'],
    ],
    segments: [
      { label: 'Minecraft servers', value: 112, color: '#6F95CC', detail: '/srv/minecraft · 4 instances' },
      { label: 'System', value: 24, color: '#6c7079', detail: 'Debian, packages, Java runtimes' },
      { label: 'Logs', value: 5, color: '#8D97B0', detail: '/var/log + server logs' },
      { label: 'Other', value: 45, color: '#3a3c43', detail: 'Home directories, caches' },
    ],
  },
  {
    id: 'hdd',
    name: 'HDD',
    role: 'Backups + archives',
    model: 'WD Blue 5 TB · 5400 rpm · SATA',
    icon: Database,
    used: 2.1,
    total: 5,
    unit: 'TB',
    mount: '/mnt/archive',
    fs: 'ext4',
    temp: '34°C',
    health: 'Good',
    extra: [
      ['Reallocated', '0 sectors'],
      ['Power-on', '11,872 h'],
    ],
    segments: [
      { label: 'Backups', value: 1.4, color: '#9A92C8', detail: '/mnt/archive/backups · 37 snapshots' },
      { label: 'Archives', value: 0.64, color: '#5c5878', detail: 'Retired worlds and modpacks' },
      { label: 'Other', value: 0.06, color: '#3a3c43', detail: 'ISOs, media' },
    ],
  },
];

const dirs = [
  { path: '/srv/minecraft/prominence-ii', size: 41.2, drive: 'SSD' },
  { path: '/srv/minecraft/skyfactory', size: 22.9, drive: 'SSD' },
  { path: '/srv/minecraft/cobblemon', size: 18.7, drive: 'SSD' },
  { path: '/srv/minecraft/.cache/modpacks', size: 26.8, drive: 'SSD' },
  { path: '/mnt/archive/backups/prominence-ii', size: 612, drive: 'HDD' },
  { path: '/mnt/archive/backups/cobblemon', size: 288, drive: 'HDD' },
  { path: '/mnt/archive/worlds/2024-survival', size: 340, drive: 'HDD' },
];

export function Storage() {
  const sys = useApp((s) => s.sys);
  return (
    <div>
      <Reveal>
        <PageHeader title="Storage">
          <span>2 volumes</span>
          <span className="h-3 w-px bg-line-3" />
          <span className="num">186 GB + 2.1 TB used</span>
          <span className="h-3 w-px bg-line-3" />
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-mint" /> SMART healthy
          </span>
        </PageHeader>
      </Reveal>

      <div className="grid grid-cols-12 gap-4">
        {drives.map((d, i) => (
          <Reveal key={d.id} i={i + 1} className="col-span-12 xl:col-span-6">
            <DriveCard d={d} />
          </Reveal>
        ))}

        <Reveal i={3} className="col-span-12 xl:col-span-8">
          <Panel
            title="Disk I/O"
            icon={Activity}
            meta="MB/s · live"
            actions={
              <div className="flex items-center gap-3 text-2xs text-fg-3">
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px] bg-blue" />Read</span>
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px] bg-violet" />Write</span>
              </div>
            }
          >
            <AreaChart
              height={200}
              series={[
                { data: sys.hist.diskR, color: 'blue', label: 'Read' },
                { data: sys.hist.diskW, color: 'violet', label: 'Write', fill: false },
              ]}
              format={(v) => `${v.toFixed(0)}`}
            />
          </Panel>
        </Reveal>

        <Reveal i={4} className="col-span-12 xl:col-span-4">
          <Panel title="Mounts" icon={FolderOpen} bodyClass="px-4 py-1.5">
            <KV k="/" v="sda2 · ext4 · noatime" mono />
            <KV k="/boot/efi" v="sda1 · vfat · 512 MB" mono />
            <KV k="/mnt/archive" v="sdb1 · ext4 · 5 TB" mono />
            <KV k="swap" v="/swapfile · 2 GB" mono />
            <KV k="Trim" v="fstrim.timer · weekly" />
            <KV k="Last fsck" v="Oct 1 · clean" />
          </Panel>
        </Reveal>

        <Reveal i={5} className="col-span-12">
          <Panel title="Largest directories" flush>
            <div className="grid grid-cols-[1fr_70px_minmax(120px,240px)_90px] gap-4 border-b border-line px-4 py-2 text-2xs text-fg-4">
              <span>Path</span>
              <span>Volume</span>
              <span>Share of volume</span>
              <span className="text-right">Size</span>
            </div>
            {dirs.map((d) => {
              const pct = d.drive === 'SSD' ? (d.size / 500) * 100 : (d.size / 5000) * 100;
              return (
                <div key={d.path} className="grid grid-cols-[1fr_70px_minmax(120px,240px)_90px] items-center gap-4 border-b border-line px-4 py-2.5 last:border-0 hover:bg-white/[0.015]">
                  <span className="truncate font-mono text-[12px] text-fg-2">{d.path}</span>
                  <Badge tone={d.drive === 'SSD' ? 'blue' : 'violet'}>{d.drive}</Badge>
                  <Meter value={pct} max={20} tone={d.drive === 'SSD' ? 'blue' : 'violet'} height={3} />
                  <span className="num text-right text-sm">{d.size >= 100 ? `${(d.size / 1000).toFixed(2)} TB` : `${d.size} GB`}</span>
                </div>
              );
            })}
          </Panel>
        </Reveal>
      </div>
    </div>
  );
}

function DriveCard({ d }: { d: Drive }) {
  const pct = (d.used / d.total) * 100;
  const free = d.total - d.used;
  const Icon = d.icon;
  return (
    <section className="surface h-full overflow-hidden rounded-xl">
      <div className="flex items-start gap-3.5 px-5 pt-5">
        <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-[inset_0_0_0_1px_var(--color-line-3),inset_0_1px_0_rgba(255,255,255,0.05)]', d.id === 'ssd' ? 'bg-blue/[0.07] text-blue' : 'bg-violet/[0.08] text-violet')}>
          <Icon size={18} strokeWidth={1.7} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold">
              {d.total} {d.unit} {d.name}
            </h3>
            <Badge tone="mint" dot>
              Healthy
            </Badge>
          </div>
          <div className="text-xs text-fg-3">{d.role}</div>
        </div>
        <div className="text-right">
          <div className="num text-[26px] leading-none font-semibold tracking-[-0.03em]">
            {d.used}
            <span className="ml-1 text-sm font-normal tracking-normal text-fg-3">
              / {d.total} {d.unit}
            </span>
          </div>
          <div className="num mt-1 text-xs text-fg-4">
            {pct.toFixed(0)}% used · {d.unit === 'TB' ? free.toFixed(1) : free} {d.unit} free
          </div>
        </div>
      </div>

      <div className="px-5 pt-5">
        <div className="relative">
          <StackedBar
            height={14}
            total={d.total}
            segments={[...d.segments.map((s) => ({ label: s.label, value: s.value, color: s.color })), { label: 'Free', value: free, color: '#17181b' }]}
          />
          {/* capacity ticks */}
          <div className="pointer-events-none absolute inset-0 flex justify-between px-px">
            {[0, 1, 2, 3, 4].map((t) => (
              <span key={t} className="h-full w-px bg-bg-1/60" style={{ visibility: t === 0 ? 'hidden' : 'visible' }} />
            ))}
          </div>
        </div>
        <div className="num mt-1.5 flex justify-between text-2xs text-fg-4">
          <span>0</span>
          <span>
            {d.total} {d.unit}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 px-3 pb-3 sm:grid-cols-2">
        {d.segments.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.05 }}
            className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-white/[0.02]"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">{s.label}</div>
              <div className="truncate text-2xs text-fg-4">{s.detail}</div>
            </div>
            <span className="num text-sm font-medium">
              {d.unit === 'TB' && s.value < 1 ? `${Math.round(s.value * 1000)} GB` : `${s.value} ${d.unit}`}
            </span>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line bg-bg-1/40 px-5 py-2.5 text-xs text-fg-3">
        <span>{d.model}</span>
        <span className="font-mono text-[11px]">
          {d.mount} · {d.fs}
        </span>
        <Tooltip content="Drive temperature">
          <span className="flex items-center gap-1">
            <Thermometer size={11} />
            <span className="num">{d.temp}</span>
          </span>
        </Tooltip>
        {d.extra.map(([k, v]) => (
          <span key={k}>
            {k} <span className="num text-fg-2">{v}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
