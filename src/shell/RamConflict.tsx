import { motion } from 'framer-motion';
import { ArrowRight, MemoryStick, ShieldAlert } from 'lucide-react';
import { footprint, resolveConflict, useApp } from '../lib/store';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Overlay';
import { Monogram } from '../ui/Layout';
import { StatusBadge } from '../ui/Status';

export function RamConflictModal() {
  const conflict = useApp((s) => s.ramConflict);
  const servers = useApp((s) => s.servers);
  const memory = useApp((s) => s.memory);
  const headroom = memory.headroom;
  const close = () => useApp.setState({ ramConflict: null });
  const target = conflict ? servers.find((s) => s.id === conflict.serverId) : null;
  const blockers = conflict?.blockers
    ? conflict.blockers.map((id) => servers.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s)
    : servers.filter((s) => s.id !== target?.id && (s.status === 'running' || s.status === 'starting')).sort((a, b) => b.ramAlloc - a.ramAlloc);
  const blocker = blockers[0];
  const required = conflict?.required ?? (target ? footprint(target) : 0);
  const avail = conflict?.safe ?? memory.safeForNew;
  const shortfall = conflict?.shortfall ?? +(required - avail).toFixed(1);
  const TOTAL_RAM = memory.total || 16;

  // Projected bar segments (GB): what stays reserved if nothing is stopped
  const segs = target
    ? [
        { label: 'System', v: memory.system, c: '#4b4e56' },
        ...blockers.map((b) => ({ label: b.name, v: Math.max(footprint(b), b.ramUsed), c: '#8D97B0' })),
        { label: 'Safety headroom', v: headroom, c: 'pattern' },
      ]
    : [];
  const usedBefore = Math.min(TOTAL_RAM, segs.reduce((a, s) => a + s.v, 0));

  return (
    <Modal open={!!target} onClose={close} width={500}>
      {target && (
        <>
          <div className="relative px-5 pt-5 pb-4">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-amber/[0.06] to-transparent" />
            <div className="relative flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber/10 text-amber shadow-[inset_0_0_0_1px_rgba(229,173,79,0.25)]">
                <ShieldAlert size={18} strokeWidth={1.8} />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Insufficient memory</h2>
                <p className="mt-0.5 text-sm text-fg-2">
                  Starting <span className="text-fg">{target.name}</span> would exceed the safe memory budget of this machine. Running it alongside {blocker?.name ?? 'other servers'} risks swapping and lag for everyone.
                </p>
              </div>
            </div>
          </div>

          {/* memory projection */}
          <div className="mx-5 rounded-lg border border-line-2 bg-bg-1 p-3.5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-fg-3">
                <MemoryStick size={12} /> Physical memory
              </span>
              <span className="num text-fg-3">{TOTAL_RAM.toFixed(1)} GB</span>
            </div>
            <div className="relative flex h-3 w-full gap-[2px] overflow-hidden rounded-[3px] bg-white/[0.04]">
              {segs.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.v / TOTAL_RAM) * 100}%` }}
                  transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full shrink-0"
                  style={{
                    background: s.c === 'pattern' ? 'repeating-linear-gradient(-45deg, rgba(229,173,79,0.5) 0 2px, transparent 2px 5px)' : s.c,
                  }}
                />
              ))}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(Math.min(required, TOTAL_RAM - usedBefore + shortfall) / TOTAL_RAM) * 100}%` }}
                transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="absolute top-0 h-full rounded-r-[3px] bg-red/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
                style={{ left: `${(usedBefore / TOTAL_RAM) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-2xs text-fg-3">
              <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-[2px] bg-fg-4" />System</span>
              <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-[2px] bg-slate" />Running</span>
              <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-[2px] bg-amber/60" />Headroom</span>
              <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-[2px] bg-red/80" />{target.name} (overflows by {shortfall} GB)</span>
            </div>

            <div className="mt-3.5 grid grid-cols-3 divide-x divide-line-2 border-t border-line-2 pt-3">
              <Fig label={`${target.name} needs`} value={`${required.toFixed(1)} GB`} />
              <Fig label="Safely available" value={`${avail} GB`} tone="text-amber" />
              <Fig label="Shortfall" value={`${shortfall} GB`} tone="text-red" />
            </div>
          </div>

          {blocker && (
            <div className="mx-5 mt-3 flex items-center gap-3 rounded-lg border border-line-2 px-3 py-2.5">
              <Monogram name={blocker.name} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {blocker.name} <StatusBadge status={blocker.status} />
                </div>
                <div className="num text-xs text-fg-3">
                  Using {blocker.ramUsed.toFixed(1)} GB · heap up to {blocker.ramAlloc} GB · {blocker.players.length} player{blocker.players.length === 1 ? '' : 's'} online
                </div>
              </div>
              <ArrowRight size={14} className="text-fg-4" />
              <Monogram name={target.name} size={28} tone="blue" />
            </div>
          )}
          {blocker && blocker.players.length > 0 && (
            <p className="mx-5 mt-2 text-xs text-fg-3">
              {blocker.players.length} player{blocker.players.length === 1 ? '' : 's'} will be disconnected. The world is saved before shutdown.
            </p>
          )}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-line-2 bg-s-1 px-5 py-3">
            <Button variant="ghost" size="md" onClick={close}>
              Cancel
            </Button>
            {blocker && (
              <Button variant="primary" size="md" onClick={() => resolveConflict(blocker.id, target.id)}>
                Stop {blocker.name.split(' ')[0]} &amp; Start {target.name}
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function Fig({ label, value, tone = 'text-fg' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-3 first:pl-0">
      <div className="truncate text-2xs text-fg-3">{label}</div>
      <div className={`num mt-0.5 text-[17px] font-semibold tracking-tight ${tone}`}>{value}</div>
    </div>
  );
}
