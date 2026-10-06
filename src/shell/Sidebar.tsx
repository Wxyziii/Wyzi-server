import { motion } from 'framer-motion';
import {
  Archive,
  Cpu,
  HardDrive,
  LayoutGrid,
  Network,
  ScrollText,
  Search,
  Server as ServerIcon,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { navigate, type Route } from '../lib/router';
import { memoryBreakdown, TOTAL_RAM, useApp } from '../lib/store';
import { cx } from '../lib/format';
import { Dot, StatusDot } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';
import { Kbd } from '../ui/Controls';

const nav: { id: Route['page']; label: string; icon: LucideIcon; group?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'servers', label: 'Servers', icon: ServerIcon },
  { id: 'storage', label: 'Storage', icon: HardDrive, group: 'Infrastructure' },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'network', label: 'Network', icon: Network },
  { id: 'system', label: 'System', icon: Cpu },
  { id: 'logs', label: 'Logs', icon: ScrollText, group: 'Diagnostics' },
];

export function Sidebar({ route, collapsed }: { route: Route; collapsed: boolean }) {
  const servers = useApp((s) => s.servers);
  const sys = useApp((s) => s.sys);
  const playit = useApp((s) => s.playit);
  const job = useApp((s) => s.backupJob);
  const running = servers.filter((s) => s.status === 'running').length;
  const mem = memoryBreakdown(servers, sys.cache);
  const ramPct = ((mem.used + mem.cache) / TOTAL_RAM) * 100;

  const Item = ({ id, label, icon: Icon, badge }: { id: Route['page']; label: string; icon: LucideIcon; badge?: React.ReactNode }) => {
    const active = route.page === id;
    const btn = (
      <button
        onClick={() => navigate('/' + id)}
        className={cx(
          'focus-ring group relative flex h-[30px] w-full items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors duration-150',
          collapsed ? 'justify-center px-0' : 'px-2.5',
          active ? 'text-fg' : 'text-fg-3 hover:bg-white/[0.03] hover:text-fg-2',
        )}
      >
        {active && (
          <motion.span
            layoutId="nav-active"
            className="absolute inset-0 rounded-md bg-s-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_0_0_1px_var(--color-line-2),0_1px_3px_rgba(0,0,0,0.4)]"
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
        <Icon size={15} strokeWidth={active ? 2 : 1.8} className={cx('relative shrink-0 transition-colors', active ? 'text-fg' : 'text-fg-3 group-hover:text-fg-2')} />
        {!collapsed && <span className="relative flex-1 text-left">{label}</span>}
        {!collapsed && badge}
      </button>
    );
    return collapsed ? (
      <Tooltip content={label} side="right" delay={100} className="w-full">
        {btn}
      </Tooltip>
    ) : (
      btn
    );
  };

  return (
    <aside className={cx('flex h-full shrink-0 flex-col overflow-hidden bg-bg-0 pb-3 transition-[width] duration-300', collapsed ? 'w-[60px] px-2.5' : 'w-[212px] px-3')}>
      {/* identity */}
      <div className={cx('flex h-12 items-center gap-2.5', collapsed ? 'justify-center' : 'px-1')}>
        <div className="relative flex h-[22px] w-[22px] shrink-0 flex-col justify-center gap-[3px] rounded-[6px] bg-gradient-to-b from-[#1e1f24] to-[#131417] px-[5px] shadow-[inset_0_0_0_1px_var(--color-line-3),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <span className="h-[3px] rounded-[1px] bg-accent" />
          <span className="h-[3px] rounded-[1px] bg-fg-4" />
          <span className="h-[3px] w-2/3 rounded-[1px] bg-fg-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="text-[13px] font-semibold tracking-[-0.01em]">WYZI Server</div>
          </div>
        )}
      </div>

      {/* search */}
      <button
        onClick={() => useApp.setState({ paletteOpen: true })}
        className={cx(
          'focus-ring mt-1 mb-3 flex h-[30px] items-center gap-2 rounded-md bg-white/[0.025] text-sm text-fg-4 shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-white/[0.04] hover:text-fg-3',
          collapsed ? 'justify-center' : 'px-2.5',
        )}
      >
        <Search size={13} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search</span>
            <Kbd>Ctrl K</Kbd>
          </>
        )}
      </button>

      <nav className="flex flex-col gap-[2px]">
        {nav.map((n) => (
          <div key={n.id}>
            {n.group && !collapsed && <div className="mt-4 mb-1.5 px-2.5 text-2xs font-medium tracking-[0.06em] text-fg-4 uppercase">{n.group}</div>}
            {n.group && collapsed && <div className="mx-2 my-2.5 h-px bg-line-2" />}
            <Item
              id={n.id}
              label={n.label}
              icon={n.icon}
              badge={
                n.id === 'servers' ? (
                  <span className="num relative text-2xs text-fg-4">
                    <span className={running ? 'text-fg-2' : ''}>{running}</span>/{servers.length}
                  </span>
                ) : n.id === 'backups' && job ? (
                  <span className="relative h-1.5 w-1.5 animate-pulse rounded-full bg-blue" />
                ) : n.id === 'network' && playit.status !== 'connected' ? (
                  <span className="relative h-1.5 w-1.5 rounded-full bg-amber" />
                ) : null
              }
            />
          </div>
        ))}
      </nav>

      {/* quick servers */}
      {!collapsed && (
        <div className="mt-5">
          <div className="mb-1.5 px-2.5 text-2xs font-medium tracking-[0.06em] text-fg-4 uppercase">Instances</div>
          <div className="flex flex-col gap-[2px]">
            {servers.map((s) => {
              const active = route.serverId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/servers/${s.id}`)}
                  className={cx(
                    'flex h-7 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] transition-colors',
                    active ? 'bg-white/[0.04] text-fg' : 'text-fg-3 hover:bg-white/[0.03] hover:text-fg-2',
                  )}
                >
                  <span className="flex w-[15px] justify-center">
                    <StatusDot status={s.status} size={6} />
                  </span>
                  <span className="flex-1 truncate text-left">{s.name}</span>
                  {s.status === 'running' && <span className="num text-2xs text-fg-4">{s.players.length}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1" />

      <Item id="settings" label="Settings" icon={Settings} />

      {/* machine identity */}
      {collapsed ? (
        <Tooltip content="WYZI-SERVER · Online" side="right" className="mt-2 flex justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-line-2 bg-s-1">
            <Dot tone="mint" pulse size={7} />
          </div>
        </Tooltip>
      ) : (
        <button
          onClick={() => navigate('/system')}
          className="mt-2 rounded-lg border border-line-2 bg-gradient-to-b from-s-2 to-s-1 p-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-line-3"
        >
          <div className="flex items-center gap-2">
            <Dot tone="mint" pulse size={6} />
            <span className="font-mono text-[11px] font-medium tracking-wide text-fg">WYZI-SERVER</span>
          </div>
          <div className="mt-1 pl-[14px] text-2xs text-fg-3">Debian 12 · Online · 12d 4h</div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 pl-[14px]">
            <MiniBar label="CPU" pct={sys.cpu} />
            <MiniBar label="RAM" pct={ramPct} />
          </div>
        </button>
      )}
    </aside>
  );
}

function MiniBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-[9.5px] leading-3 text-fg-4">
        <span>{label}</span>
        <span className="num">{Math.round(pct)}%</span>
      </div>
      <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cx('h-full rounded-full transition-[width] duration-700', pct > 85 ? 'bg-red' : pct > 70 ? 'bg-amber' : 'bg-fg-3')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
