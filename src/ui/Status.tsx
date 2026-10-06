import { AnimatePresence, motion } from 'framer-motion';
import type { ServerStatus } from '../lib/store';
import { cx } from '../lib/format';
import type { ReactNode } from 'react';

export type Tone = 'mint' | 'amber' | 'red' | 'blue' | 'neutral' | 'violet';

export const toneText: Record<Tone, string> = {
  mint: 'text-mint',
  amber: 'text-amber',
  red: 'text-red',
  blue: 'text-blue',
  neutral: 'text-fg-3',
  violet: 'text-violet',
};
export const toneBg: Record<Tone, string> = {
  mint: 'bg-mint',
  amber: 'bg-amber',
  red: 'bg-red',
  blue: 'bg-blue',
  neutral: 'bg-fg-4',
  violet: 'bg-violet',
};
const toneBadge: Record<Tone, string> = {
  mint: 'text-mint bg-mint/[0.08] shadow-[inset_0_0_0_1px_rgba(62,207,142,0.2)]',
  amber: 'text-amber bg-amber/[0.08] shadow-[inset_0_0_0_1px_rgba(229,173,79,0.2)]',
  red: 'text-[#ff8784] bg-red/[0.08] shadow-[inset_0_0_0_1px_rgba(239,100,97,0.22)]',
  blue: 'text-blue bg-blue/[0.08] shadow-[inset_0_0_0_1px_rgba(122,162,217,0.2)]',
  neutral: 'text-fg-2 bg-white/[0.035] shadow-[inset_0_0_0_1px_var(--color-line-3)]',
  violet: 'text-violet bg-violet/[0.08] shadow-[inset_0_0_0_1px_rgba(154,146,200,0.22)]',
};

export const statusMeta: Record<ServerStatus, { label: string; tone: Tone }> = {
  running: { label: 'Running', tone: 'mint' },
  starting: { label: 'Starting', tone: 'amber' },
  stopping: { label: 'Stopping', tone: 'amber' },
  sleeping: { label: 'Sleeping', tone: 'blue' },
  offline: { label: 'Offline', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'red' },
  undeployed: { label: 'Planned', tone: 'neutral' },
};

export function Dot({ tone, pulse, size = 7 }: { tone: Tone; pulse?: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {pulse && (
        <span
          className={cx('absolute inset-0 rounded-full', toneBg[tone])}
          style={{ animation: 'pulse-ring 2.4s cubic-bezier(0.2,0.6,0.4,1) infinite' }}
        />
      )}
      <span
        className={cx('relative inline-flex rounded-full transition-colors duration-500', toneBg[tone])}
        style={{ width: size, height: size, boxShadow: tone === 'neutral' ? 'none' : '0 0 0 2px rgba(0,0,0,0.35)' }}
      />
    </span>
  );
}

export function StatusDot({ status, size }: { status: ServerStatus; size?: number }) {
  const m = statusMeta[status];
  return <Dot tone={m.tone} pulse={status === 'running' || status === 'starting'} size={size} />;
}

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex h-5 items-center gap-1.5 rounded-[5px] px-1.5 text-xs font-medium whitespace-nowrap', toneBadge[tone], className)}>
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', toneBg[tone])} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: ServerStatus; className?: string }) {
  const m = statusMeta[status];
  return (
    <span className={cx('inline-flex h-5 items-center gap-1.5 overflow-hidden rounded-[5px] px-1.5 text-xs font-medium transition-[background,box-shadow,color] duration-500', toneBadge[m.tone], className)}>
      <StatusDot status={status} size={6} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={m.label}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {m.label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
