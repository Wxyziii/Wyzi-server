import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../lib/format';

export const ease = [0.22, 1, 0.36, 1] as const;

/** Staggered entrance wrapper for page sections */
export function Reveal({ children, i = 0, className }: { children: ReactNode; i?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.04 + i * 0.045, ease }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Panel({
  children,
  className,
  title,
  icon: Icon,
  meta,
  actions,
  bodyClass,
  flush,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  icon?: LucideIcon;
  meta?: ReactNode;
  actions?: ReactNode;
  bodyClass?: string;
  flush?: boolean;
}) {
  return (
    <section className={cx('surface flex min-w-0 flex-col rounded-xl', className)}>
      {title && (
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
          {Icon && <Icon size={14} strokeWidth={1.9} className="text-fg-3" />}
          <h3 className="text-sm font-medium text-fg">{title}</h3>
          {meta && <span className="truncate text-xs text-fg-3">{meta}</span>}
          <div className="ml-auto flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      <div className={cx(!flush && 'p-4', 'min-h-0 flex-1', bodyClass)}>{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-5">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs text-fg-3">{eyebrow}</div>}
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">{title}</h1>
        {children && <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-fg-3">{children}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KV({ k, v, mono, className }: { k: ReactNode; v: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-4 py-[7px] text-sm', className)}>
      <span className="text-fg-3">{k}</span>
      <span className={cx('truncate text-right text-fg', mono && 'num font-mono text-xs')}>{v}</span>
    </div>
  );
}

export function Divider({ vertical, className }: { vertical?: boolean; className?: string }) {
  return <div className={cx(vertical ? 'w-px self-stretch bg-line-2' : 'h-px w-full bg-line', className)} />;
}

export function Empty({ icon: Icon, title, desc, action }: { icon: LucideIcon; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line-3 bg-s-2 text-fg-3 shadow-[var(--shadow-raise)]">
        <Icon size={18} strokeWidth={1.7} />
      </div>
      <div className="text-sm font-medium text-fg">{title}</div>
      {desc && <div className="mt-1 max-w-72 text-sm text-fg-3">{desc}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Monogram({ name, size = 32, tone = 'neutral' }: { name: string; size?: number; tone?: 'neutral' | 'blue' | 'amber' }) {
  const initials = name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const tones = {
    blue: 'from-[#18202e] to-[#10141c] text-blue shadow-[inset_0_0_0_1px_rgba(122,162,217,0.2),inset_0_1px_0_rgba(255,255,255,0.06)]',
    amber: 'from-[#3a2c15] to-[#21190d] text-amber shadow-[inset_0_0_0_1px_rgba(229,173,79,0.22),inset_0_1px_0_rgba(255,255,255,0.06)]',
    neutral: 'from-[#1e1f23] to-[#141518] text-fg-2 shadow-[inset_0_0_0_1px_var(--color-line-3),inset_0_1px_0_rgba(255,255,255,0.05)]',
  };
  return (
    <div
      className={cx('flex shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-b font-semibold tracking-tight transition-colors duration-500', tones[tone])}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />;
}
