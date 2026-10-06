import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ArrowDownToLine,
  CircleStop,
  Package,
  Play,
  Radio,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { navigate } from '../lib/router';
import { memoryBreakdown, safelyAvailable, TOTAL_RAM, useApp, type Activity, type Server } from '../lib/store';
import { cx, fmtUptime } from '../lib/format';
import { Meter, Num, StackedBar } from '../ui/Charts';
import { Monogram } from '../ui/Layout';
import { useContextMenu } from '../ui/Menu';
import { StatusBadge } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';
import { monogramTone, MoreMenu, PowerActions, serverMenu, StartupSequence } from './shared';

/* ─────────────── Activity feed ─────────────── */
const kindIcon: Record<Activity['kind'], [LucideIcon, string]> = {
  start: [Play, 'text-fg-2'],
  stop: [CircleStop, 'text-fg-3'],
  backup: [Archive, 'text-fg-3'],
  network: [Radio, 'text-fg-3'],
  system: [Package, 'text-fg-3'],
  warn: [TriangleAlert, 'text-amber'],
  player: [UserPlus, 'text-fg-3'],
};

export function ActivityFeed({ limit = 7 }: { limit?: number }) {
  const activity = useApp((s) => s.activity);
  return (
    <ol className="relative">
      <AnimatePresence initial={false}>
        {activity.slice(0, limit).map((a, i) => {
          const [Icon, color] = kindIcon[a.kind];
          return (
            <motion.li
              key={a.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex gap-3 overflow-hidden"
            >
              <div className="relative flex w-6 shrink-0 flex-col items-center pt-[9px]">
                <span className={cx('relative z-10 flex h-[22px] w-[22px] items-center justify-center rounded-md border border-line-2 bg-s-2', color)}>
                  <Icon size={11.5} strokeWidth={2} />
                </span>
                {i < Math.min(limit, activity.length) - 1 && <span className="absolute top-[31px] bottom-0 w-px bg-line-2" />}
              </div>
              <div className="min-w-0 flex-1 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 truncate text-sm text-fg">{a.title}</span>
                  <span className="num shrink-0 text-2xs text-fg-4">{a.time}</span>
                </div>
                {a.detail && <div className="truncate text-xs text-fg-3">{a.detail}</div>}
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

/* ─────────────── Memory composition ─────────────── */
export function MemoryComposition({ showHeadroom = true }: { showHeadroom?: boolean }) {
  const servers = useApp((s) => s.servers);
  const cache = useApp((s) => s.sys.cache);
  const m = memoryBreakdown(servers, cache);
  const avail = safelyAvailable(servers);
  const mcServers = servers.filter((s) => s.status === 'running' || s.status === 'starting' || s.status === 'stopping');
  const rows = [
    { label: 'Minecraft heap', value: m.minecraft, color: '#7F9BCB', sub: mcServers.map((s) => s.name).join(', ') || 'No servers running' },
    { label: 'System', value: m.system, color: '#6c7079', sub: 'Kernel, agent, Playit, sshd' },
    { label: 'Filesystem cache', value: m.cache, color: '#8D97B0', sub: 'Reclaimable', pattern: true },
    { label: 'Available', value: m.available, color: '#1f2025', sub: 'Unused physical memory' },
  ];
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">In use</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <Num value={m.used} format={(v) => v.toFixed(1)} className="text-[28px] leading-none font-semibold tracking-[-0.03em]" />
            <span className="num text-sm text-fg-3">/ {TOTAL_RAM} GB</span>
          </div>
        </div>
        <div className="text-right">
          <div className="eyebrow">Pressure</div>
          <div className={cx('mt-1 text-sm font-medium', m.used / TOTAL_RAM > 0.85 ? 'text-red' : m.used / TOTAL_RAM > 0.7 ? 'text-amber' : 'text-fg-2')}>
            {m.used / TOTAL_RAM > 0.85 ? 'High' : m.used / TOTAL_RAM > 0.7 ? 'Elevated' : 'Normal'}
          </div>
        </div>
      </div>
      <StackedBar
        className="mt-4"
        height={12}
        total={TOTAL_RAM}
        segments={rows.map((r) => ({ label: r.label, value: r.value, color: r.color, pattern: r.pattern }))}
      />
      <div className="mt-4 space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5 py-1">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{
                background: r.pattern ? `repeating-linear-gradient(-45deg, ${r.color} 0 1.5px, transparent 1.5px 3.5px)` : r.color,
                boxShadow: r.label === 'Available' ? 'inset 0 0 0 1px #3a3c43' : r.pattern ? `inset 0 0 0 1px ${r.color}` : undefined,
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-fg">{r.label}</div>
              <div className="truncate text-2xs text-fg-4">{r.sub}</div>
            </div>
            <span className="num text-sm font-medium text-fg">
              <Num value={r.value} format={(v) => v.toFixed(1)} />
              <span className="ml-0.5 text-xs font-normal text-fg-3">GB</span>
            </span>
          </div>
        ))}
      </div>
      {showHeadroom && (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-line-2 bg-bg-1/70 px-3 py-2.5">
          <ArrowDownToLine size={13} className="mt-0.5 shrink-0 text-fg-3" />
          <div className="text-xs leading-relaxed text-fg-3">
            <span className="num font-medium text-fg">{avail} GB</span> can be safely allocated to another server. WYZI keeps{' '}
            <span className="text-fg-2">2.5 GB</span> headroom so the host never swaps.
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Compact server row (dashboard) ─────────────── */
export function ServerRow({ s }: { s: Server }) {
  const onCtx = useContextMenu(() => serverMenu(s));
  const live = s.status === 'running';
  const dim = !live && s.status !== 'starting';
  return (
    <div
      onContextMenu={onCtx}
      className="group relative border-b border-line transition-colors last:border-b-0 hover:bg-white/[0.015]"
    >
      <div
        className="grid cursor-pointer grid-cols-[minmax(170px,1.6fr)_88px_repeat(3,minmax(54px,0.6fr))_minmax(110px,1fr)_auto] items-center gap-4 px-4"
        style={{ paddingTop: 'var(--row-y)', paddingBottom: 'var(--row-y)' }}
        onClick={() => navigate(`/servers/${s.id}`)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Monogram name={s.name} size={30} tone={monogramTone(s)} />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium text-fg">{s.name}</div>
            <div className="truncate text-xs text-fg-3">
              {s.loader} · {s.mc}
            </div>
          </div>
        </div>
        <div>
          <StatusBadge status={s.status} />
        </div>
        <Stat label="Players" dim={dim} value={live ? `${s.players.length}/${s.maxPlayers}` : '—'} />
        <Stat label="TPS" dim={dim} value={live ? s.tps.toFixed(2) : '—'} tone={live && s.tps < 18 ? 'text-amber' : undefined} />
        <Stat label="MSPT" dim={dim} value={live ? `${s.mspt}` : '—'} unit={live ? 'ms' : ''} />
        <div className="min-w-0">
          <div className="flex items-baseline justify-between text-2xs text-fg-4">
            <span>Memory</span>
            <span className="num text-xs text-fg-2">
              {s.ramUsed > 0 ? s.ramUsed.toFixed(1) : '0'} <span className="text-fg-4">/ {s.ramAlloc} GB</span>
            </span>
          </div>
          <Meter className="mt-1.5" value={s.ramUsed} max={s.ramAlloc} tone={s.status === 'starting' || s.ramUsed / s.ramAlloc > 0.95 ? 'amber' : 'slate'} height={3} />
          <div className="mt-1 truncate text-2xs text-fg-4">
            {live ? `Up ${fmtUptime(s.uptime)}` : s.status === 'sleeping' ? (s.wakeOnConnect ? 'Wake-on-connect enabled' : 'Sleeping') : s.status === 'starting' ? 'Allocating…' : `Last online ${s.lastOnline}`}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <PowerActions s={s} size="xs" compact />
          <MoreMenu s={s} size="xs" />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {s.status === 'starting' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3.5 pl-[58px]">
              <StartupSequence s={s} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value, unit, dim, tone }: { label: string; value: string; unit?: string; dim?: boolean; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-2xs text-fg-4">{label}</div>
      <div className={cx('num mt-0.5 text-sm font-medium', dim ? 'text-fg-4' : tone ?? 'text-fg')}>
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-fg-3">{unit}</span>}
      </div>
    </div>
  );
}

/* ─────────────── Inline metric used in strips ─────────────── */
export function StripMetric({
  icon: Icon,
  label,
  sub,
  children,
  footer,
  onClick,
  tip,
}: {
  icon: LucideIcon;
  label: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: () => void;
  tip?: string;
}) {
  const body = (
    <button
      onClick={onClick}
      className="group flex h-full w-full min-w-0 flex-col px-4 py-3.5 text-left transition-colors hover:bg-white/[0.015]"
    >
      <div className="flex items-center gap-1.5 text-xs text-fg-3">
        <Icon size={12.5} strokeWidth={1.9} className="text-fg-4 transition-colors group-hover:text-fg-3" />
        <span className="font-medium text-fg-2">{label}</span>
        {sub && <span className="truncate text-fg-4">{sub}</span>}
      </div>
      <div className="mt-2.5 flex min-h-[30px] items-baseline gap-1.5">{children}</div>
      {footer && <div className="mt-2.5 w-full">{footer}</div>}
    </button>
  );
  return tip ? (
    <Tooltip content={tip} className="block min-w-0">
      {body}
    </Tooltip>
  ) : (
    body
  );
}
