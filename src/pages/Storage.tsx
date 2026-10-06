import { Database, FolderOpen, HardDrive, Thermometer, Activity, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useApp, type StorageInfo, type VolumeInfo } from '../lib/store';
import { cx } from '../lib/format';
import { diskLabel, fmtBytes, GB } from '../lib/hooks';
import { IS_LIVE } from '../lib/mode';
import { refreshStorage } from '../lib/live';
import { AreaChart, Meter, StackedBar } from '../ui/Charts';
import { Empty, KV, PageHeader, Panel, Reveal } from '../ui/Layout';
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
  health: 'healthy' | 'check' | 'unknown';
  healthTip: string;
  extra: [string, string][];
  segments: { label: string; value: number; bytes: number; color: string; detail: string }[];
}

const SEGMENT_COLORS: Record<string, string[]> = {
  system: ['#6F95CC', '#6c7079', '#8D97B0', '#3a3c43'],
  bulk: ['#9A92C8', '#5c5878', '#3a3c43'],
};

/** Map a measured volume onto the drive card model used by the original design. */
function toDrive(v: VolumeInfo, fsType: string): Drive {
  const tb = v.total > 1500 * GB;
  const div = tb ? 1024 * GB : GB;
  const round = (n: number) => (tb ? +(n / div).toFixed(2) : Math.round(n / div));
  const d = v.disk;
  const sm = d?.smart;
  const health: Drive['health'] = !sm?.available ? 'unknown' : sm.passed && !sm.pending && !sm.uncorrectable ? 'healthy' : 'check';
  return {
    id: v.id,
    name: d?.kind ?? 'Disk',
    role: v.role,
    model: d ? `${d.model} · ${diskLabel(d.sizeBytes)}${d.rpm ? ` · ${d.rpm} rpm` : ''}` : v.device ?? 'Unknown device',
    icon: v.id === 'system' ? HardDrive : Database,
    used: round(v.used),
    total: round(v.total),
    unit: tb ? 'TB' : 'GB',
    mount: v.mount,
    fs: fsType,
    temp: sm?.temp != null ? `${sm.temp}°C` : '—',
    health,
    healthTip: !sm?.available ? 'SMART export (wyzi-smart-status) not installed yet' : `SMART ${sm.passed ? 'passed' : 'FAILED'} · ${sm.pending ?? 0} pending · ${sm.uncorrectable ?? 0} uncorrectable`,
    extra: [
      ...(sm?.reallocated != null ? ([['Reallocated', `${sm.reallocated} sectors`]] as [string, string][]) : []),
      ...(sm?.powerOnHours != null ? ([['Power-on', `${sm.powerOnHours.toLocaleString()} h`]] as [string, string][]) : []),
    ],
    segments: v.categories.map((c, i) => ({ label: c.label, value: c.bytes / div, bytes: c.bytes, color: (SEGMENT_COLORS[v.id] ?? SEGMENT_COLORS.bulk)[i] ?? '#3a3c43', detail: c.detail })),
  };
}

export function Storage() {
  const sys = useApp((s) => s.sys);
  const storage = useApp((s) => s.storage) as StorageInfo | null;
  useEffect(() => {
    if (IS_LIVE) void refreshStorage();
  }, []);
  if (!storage)
    return (
      <div className="surface rounded-xl">
        <Empty icon={HardDrive} title="Loading storage" desc="Waiting for the server to report its volumes." />
      </div>
    );
  const fsOf = (mount: string) => storage.mounts.find((m) => m.mount === mount)?.fs ?? 'ext4';
  const drives = storage.volumes.map((v) => toDrive(v, fsOf(v.mount)));
  const smartOk = storage.disks.every((d) => d.smart.available && d.smart.passed);
  const volTotal = (id: string) => storage.volumes.find((v) => v.id === id)?.total ?? 1;
  return (
    <div>
      <Reveal>
        <PageHeader title="Storage">
          <span>{storage.volumes.length} volumes · {storage.disks.length} physical disks</span>
          <span className="h-3 w-px bg-line-3" />
          <span className="num">{storage.volumes.map((v) => fmtBytes(v.used)).join(' + ')} used</span>
          <span className="h-3 w-px bg-line-3" />
          {storage.smartAvailable ? (
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={12} className={smartOk ? 'text-mint' : 'text-amber'} /> SMART {smartOk ? 'healthy' : 'needs attention'}
            </span>
          ) : (
            <Tooltip content="Install the SMART export (deploy/install-root.sh) to show disk health">
              <span className="flex items-center gap-1.5">
                <ShieldQuestion size={12} className="text-fg-4" /> SMART not exported
              </span>
            </Tooltip>
          )}
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
            meta="MB/s · live · both HDDs"
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
            {storage.mounts.map((m, i) => (
              <KV key={m.mount + i} k={m.mount} v={`${m.device.replace('/dev/', '')} · ${m.fs} · ${m.opts}`} mono />
            ))}
            <KV k="Measured" v={storage.measuredAt ? new Date(storage.measuredAt * 1000).toTimeString().slice(0, 5) : 'pending'} />
          </Panel>
        </Reveal>

        <Reveal i={5} className="col-span-12">
          <Panel title="Largest directories" meta="Measured by the portal · instances and backups" flush>
            <div className="grid grid-cols-[1fr_70px_minmax(120px,240px)_90px] gap-4 border-b border-line px-4 py-2 text-2xs text-fg-4">
              <span>Path</span>
              <span>Volume</span>
              <span>Share of volume</span>
              <span className="text-right">Size</span>
            </div>
            {storage.largest.length === 0 && <div className="px-4 py-4 text-sm text-fg-4">Not measured yet</div>}
            {storage.largest.map((d) => {
              const pct = (d.bytes / volTotal(d.volume)) * 100;
              const label = d.volume === 'system' ? 'System' : 'Bulk';
              return (
                <div key={d.path} className="grid grid-cols-[1fr_70px_minmax(120px,240px)_90px] items-center gap-4 border-b border-line px-4 py-2.5 last:border-0 hover:bg-white/[0.015]">
                  <span className="truncate font-mono text-[12px] text-fg-2">{d.path}</span>
                  <Badge tone={d.volume === 'system' ? 'blue' : 'violet'}>{label}</Badge>
                  <Meter value={pct} max={20} tone={d.volume === 'system' ? 'blue' : 'violet'} height={3} />
                  <span className="num text-right text-sm">{fmtBytes(d.bytes)}</span>
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
            <Tooltip content={d.healthTip}>
              <Badge tone={d.health === 'healthy' ? 'mint' : d.health === 'check' ? 'amber' : 'neutral'} dot>
                {d.health === 'healthy' ? 'Healthy' : d.health === 'check' ? 'Check disk' : 'No SMART data'}
              </Badge>
            </Tooltip>
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
            {pct.toFixed(0)}% used · {d.unit === 'TB' ? free.toFixed(2) : free} {d.unit} free
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
              {fmtBytes(s.bytes)}
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
