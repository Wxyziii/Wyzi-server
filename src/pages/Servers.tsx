import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Globe, HardDrive, MemoryStick, Moon, Plus, SearchX, Terminal, Timer } from 'lucide-react';
import { navigate } from '../lib/router';
import { SYSTEM_RAM, TOTAL_RAM, toast, useApp, type Server } from '../lib/store';
import { cx, fmtUptime } from '../lib/format';
import { Button } from '../ui/Button';
import { Meter, Sparkline } from '../ui/Charts';
import { Segmented, TextInput } from '../ui/Controls';
import { Empty, Monogram, PageHeader, Reveal } from '../ui/Layout';
import { useContextMenu } from '../ui/Menu';
import { StatusBadge } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';
import { monogramTone, MoreMenu, PowerActions, serverMenu, StartupSequence } from './shared';

type Filter = 'all' | 'running' | 'sleeping' | 'offline';

export function Servers() {
  const servers = useApp((s) => s.servers);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const list = servers.filter(
    (s) =>
      (filter === 'all' || (filter === 'running' ? s.status === 'running' || s.status === 'starting' || s.status === 'stopping' : s.status === filter)) &&
      s.name.toLowerCase().includes(q.toLowerCase()),
  );
  const allocated = servers.reduce((a, s) => a + s.ramAlloc, 0);

  return (
    <div>
      <Reveal>
        <PageHeader
          title="Servers"
          actions={
            <Button variant="primary" icon={Plus} onClick={() => toast('Instance creation comes in the next build', 'info', 'Prototype — no files were created')}>
              New server
            </Button>
          }
        >
          <span>{servers.length} instances</span>
          <span className="h-3 w-px bg-line-3" />
          <span className="num">{allocated} GB allocated</span>
          <span className="text-fg-4">across</span>
          <span className="num">{TOTAL_RAM} GB physical</span>
        </PageHeader>
      </Reveal>

      <Reveal i={1}>
        <AllocationBudget />
      </Reveal>

      <Reveal i={2} className="mt-6 mb-3 flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All  ${servers.length}` },
            { value: 'running', label: 'Running' },
            { value: 'sleeping', label: 'Sleeping' },
            { value: 'offline', label: 'Offline' },
          ]}
        />
        <TextInput placeholder="Filter instances" value={q} onChange={(e) => setQ(e.target.value)} className="ml-auto w-56" />
      </Reveal>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((s, i) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.08 + i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, scale: 0.99, transition: { duration: 0.15 } }}
            >
              <ServerCard s={s} />
            </motion.div>
          ))}
        </AnimatePresence>
        {list.length === 0 && (
          <div className="surface rounded-xl">
            <Empty
              icon={SearchX}
              title="No matching servers"
              desc={q ? `Nothing matches “${q}”.` : `No servers are ${filter} right now.`}
              action={
                <Button size="sm" variant="secondary" onClick={() => { setFilter('all'); setQ(''); }}>
                  Clear filters
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function AllocationBudget() {
  const servers = useApp((s) => s.servers);
  const headroom = useApp((s) => s.settings.safetyHeadroom);
  const active = servers.filter((s) => s.status === 'running' || s.status === 'starting' || s.status === 'stopping');
  const used = SYSTEM_RAM + active.reduce((a, s) => a + s.ramAlloc, 0);
  const free = Math.max(0, TOTAL_RAM - used - headroom);
  const segs = [
    { k: 'System', v: SYSTEM_RAM, cls: 'bg-fg-4' },
    ...active.map((s) => ({ k: s.name, v: s.ramAlloc, cls: s.status === 'running' ? 'bg-[#4b5b7c] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'bg-amber/70' })),
    { k: 'Allocatable', v: free, cls: 'bg-white/[0.04] shadow-[inset_0_0_0_1px_var(--color-line-3)]' },
    { k: 'Safety headroom', v: headroom, cls: 'hatch' },
  ];
  return (
    <section className="surface rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <MemoryStick size={14} className="text-fg-3" />
          <span className="text-sm font-medium">Memory budget</span>
        </div>
        <span className="text-xs text-fg-3">
          A 16 GB host fits one large modpack at a time. Servers that don’t fit can still be started by swapping out the current one.
        </span>
        <span className="num ml-auto text-sm">
          <span className="font-semibold text-fg">{free.toFixed(1)} GB</span> <span className="text-fg-3">allocatable</span>
        </span>
      </div>
      <div className="mt-3.5 flex h-7 w-full gap-[3px]">
        {segs.map((s) => (
          <Tooltip
            key={s.k}
            content={`${s.k} · ${s.v.toFixed(1)} GB`}
            className="min-w-0 transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${(s.v / TOTAL_RAM) * 100}%` }}
            delay={80}
          >
            <div className={cx('relative flex h-full w-full min-w-0 items-center overflow-hidden rounded-[5px] px-2', s.cls)}>
              {s.cls === 'hatch' && (
                <span className="absolute inset-0 rounded-[5px] shadow-[inset_0_0_0_1px_rgba(229,173,79,0.35)]" style={{ background: 'repeating-linear-gradient(-45deg, rgba(229,173,79,0.22) 0 2px, transparent 2px 6px)' }} />
              )}
              {s.v / TOTAL_RAM > 0.09 && (
                <span className={cx('relative truncate text-2xs font-medium', s.cls.includes('#4b5b7c') ? 'text-white/90' : 'text-fg-2')}>
                  {s.k} <span className="num opacity-70">{s.v.toFixed(1)}</span>
                </span>
              )}
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="num mt-2 flex justify-between text-2xs text-fg-4">
        <span>0 GB</span>
        <span>{TOTAL_RAM} GB</span>
      </div>
    </section>
  );
}

function ServerCard({ s }: { s: Server }) {
  const onCtx = useContextMenu(() => serverMenu(s));
  const live = s.status === 'running';
  return (
    <article
      onContextMenu={onCtx}
      className={cx(
        'surface group relative overflow-hidden rounded-xl transition-[border-color,box-shadow] duration-200 hover:border-line-3',
        s.status === 'starting' && 'before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-amber/70',
      )}
    >
      <div className="flex flex-wrap items-center gap-4 px-5 pt-4 pb-3.5">
        <Monogram name={s.name} size={38} tone={monogramTone(s)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <button onClick={() => navigate(`/servers/${s.id}`)} className="truncate text-[15px] font-semibold tracking-[-0.01em] hover:underline hover:decoration-line-4 hover:underline-offset-4">
              {s.name}
            </button>
            <StatusBadge status={s.status} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-3">
            <span>{s.loader}</span>
            <span className="text-fg-4">·</span>
            <span>Minecraft {s.mc}</span>
            {s.mods > 0 && (
              <>
                <span className="text-fg-4">·</span>
                <span className="num">{s.mods} mods</span>
              </>
            )}
            <span className="text-fg-4">·</span>
            <span className="font-mono text-[11px]">:{s.port}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" icon={Terminal} onClick={() => navigate(`/servers/${s.id}/console`)}>
            Console
          </Button>
          <PowerActions s={s} size="sm" />
          <MoreMenu s={s} />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {s.status === 'starting' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="px-5 pb-4 pl-[74px]">
              <StartupSequence s={s} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-6 [&>*]:border-line max-lg:[&>*]:border-b lg:divide-x lg:divide-line">
        <Cell label="Players" value={live ? `${s.players.length}` : '—'} unit={live ? `/ ${s.maxPlayers}` : ''} dim={!live}>
          {live && (
            <div className="mt-1.5 flex -space-x-1">
              {s.players.map((p) => (
                <Tooltip key={p.name} content={p.name} delay={80}>
                  <span className="flex h-4 w-4 items-center justify-center rounded-[4px] bg-s-5 text-[8px] font-semibold text-fg-2 ring-2 ring-s-1">{p.name[0].toUpperCase()}</span>
                </Tooltip>
              ))}
            </div>
          )}
        </Cell>
        <Cell label="TPS" value={live ? s.tps.toFixed(2) : '—'} dim={!live} spark={live ? <Sparkline data={s.hist.tps.slice(-24)} min={15} max={20.5} width={60} height={16} fill={false} color="slate" /> : null} />
        <Cell label="MSPT" value={live ? `${s.mspt}` : '—'} unit={live ? 'ms' : ''} dim={!live} spark={live ? <Sparkline data={s.hist.mspt.slice(-24)} max={60} width={60} height={16} color="blue" fill={false} /> : null} />
        <Cell label="CPU" value={live ? `${s.cpu}` : '—'} unit={live ? '%' : ''} dim={!live} spark={live ? <Sparkline data={s.hist.cpu.slice(-24)} max={100} width={60} height={16} fill={false} color="grey" /> : null} />
        <Cell label="Memory" value={s.ramUsed > 0 ? s.ramUsed.toFixed(1) : '0'} unit={`/ ${s.ramAlloc} GB`} dim={s.ramUsed === 0}>
          <Meter className="mt-2" value={s.ramUsed} max={s.ramAlloc} tone={s.status === 'starting' || s.ramUsed / s.ramAlloc > 0.95 ? 'amber' : 'slate'} height={3} />
        </Cell>
        <Cell label={live ? 'Uptime' : 'Last online'} value={live ? fmtUptime(s.uptime) : s.lastOnline} dim={!live} small={!live} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-bg-1/40 px-5 py-2 text-xs text-fg-3">
        <Chip icon={Moon} on={s.wakeOnConnect}>
          Wake-on-connect {s.wakeOnConnect ? 'on' : 'off'}
        </Chip>
        <Chip icon={Timer} on={s.autoStop}>
          Auto-stop after 10 min idle
        </Chip>
        <Chip icon={Globe} on={!!s.tunnelPort}>
          {s.tunnelPort ? `Tunnel :${s.tunnelPort}` : 'No tunnel'}
        </Chip>
        <Chip icon={HardDrive}>World {s.worldSize}</Chip>
        <span className="ml-auto flex items-center gap-1.5 text-fg-4">
          <Clock size={11} /> {s.java}
        </span>
      </div>
    </article>
  );
}

function Cell({
  label,
  value,
  unit,
  dim,
  spark,
  children,
  small,
}: {
  label: string;
  value: string;
  unit?: string;
  dim?: boolean;
  spark?: React.ReactNode;
  children?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="min-w-0 px-5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-2xs text-fg-4">{label}</span>
        {spark}
      </div>
      <div className={cx('num mt-1 truncate font-semibold tracking-[-0.01em]', small ? 'text-sm' : 'text-[17px]', dim ? 'text-fg-4' : 'text-fg')}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-fg-3">{unit}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ icon: Icon, children, on = true }: { icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode; on?: boolean }) {
  return (
    <span className={cx('flex items-center gap-1.5', on ? 'text-fg-3' : 'text-fg-4')}>
      <Icon size={11} className={on ? 'text-fg-3' : 'text-fg-4'} />
      {children}
    </span>
  );
}
