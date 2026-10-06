import { useId, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronsUpDown, Minus, Plus, Search, type LucideIcon } from 'lucide-react';
import { cx, clamp } from '../lib/format';
import { Dropdown } from './Menu';

/* ─── Switch ─── */
export function Switch({ checked, onChange, disabled, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 26 : 30;
  const h = size === 'sm' ? 15 : 17;
  const k = h - 4;
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'focus-ring relative shrink-0 rounded-full transition-[background,box-shadow] duration-200 disabled:opacity-40',
        checked
          ? 'bg-accent-strong shadow-[inset_0_0_0_1px_rgba(122,162,217,0.55),inset_0_1px_0_rgba(255,255,255,0.15)]'
          : 'bg-s-5 shadow-[inset_0_0_0_1px_var(--color-line-4),inset_0_1px_2px_rgba(0,0,0,0.4)] hover:bg-[#2a2b31]',
      )}
      style={{ width: w, height: h }}
    >
      <motion.span
        className={cx('absolute top-[2px] left-[2px] rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.5)]', checked ? 'bg-white' : 'bg-[#c8cbd1]')}
        style={{ width: k, height: k }}
        animate={{ x: checked ? w - k - 4 : 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      />
    </button>
  );
}

/* ─── Select (custom dropdown) ─── */
export function Select({
  value,
  options,
  onChange,
  width = 160,
  icon: Icon,
}: {
  value: string;
  options: (string | { value: string; label: string; hint?: string })[];
  onChange: (v: string) => void;
  width?: number;
  icon?: LucideIcon;
}) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o, hint: undefined } : o));
  const cur = opts.find((o) => o.value === value);
  return (
    <Dropdown
      width={Math.max(width, 160)}
      items={opts.map((o) => ({ label: o.label, hint: o.hint, checked: o.value === value, onSelect: () => onChange(o.value) }))}
      trigger={({ onClick, ...p }) => (
        <button
          onClick={onClick}
          className={cx(
            'focus-ring flex h-7 items-center gap-2 rounded-sm bg-s-3 px-2.5 text-left text-sm text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_var(--color-line-3)] transition-[background,box-shadow] hover:bg-s-4',
            p['data-open'] && 'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_var(--color-line-4)] bg-s-4',
          )}
          style={{ width }}
        >
          {Icon && <Icon size={13} className="text-fg-3" />}
          <span className="flex-1 truncate">{cur?.label}</span>
          <ChevronsUpDown size={12} className="text-fg-3" />
        </button>
      )}
    />
  );
}

/* ─── Segmented control with sliding thumb ─── */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
  className,
}: {
  value: T;
  options: (T | { value: T; label: ReactNode; icon?: LucideIcon })[];
  onChange: (v: T) => void;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const id = useId();
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o as ReactNode, icon: undefined } : o));
  return (
    <div className={cx('inline-flex items-center rounded-md bg-bg-0/70 p-[2px] shadow-[inset_0_0_0_1px_var(--color-line-2)]', className)}>
      {opts.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              'focus-ring relative flex items-center gap-1.5 rounded-[5px] font-medium transition-colors duration-150',
              size === 'xs' ? 'h-[22px] px-2 text-xs' : 'h-6 px-2.5 text-sm',
              active ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[5px] bg-s-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_var(--color-line-3),0_1px_3px_rgba(0,0,0,0.5)]"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            {Icon && <Icon size={13} className="relative" />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Underline tabs ─── */
export function Tabs<T extends string>({
  value,
  tabs,
  onChange,
}: {
  value: T;
  tabs: { value: T; label: string; icon?: LucideIcon; count?: number }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {tabs.map((t) => {
        const active = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cx(
              'focus-ring group relative flex h-10 items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            <span className="absolute inset-x-0 inset-y-1.5 rounded-sm transition-colors group-hover:bg-white/[0.03]" />
            {Icon && <Icon size={14} strokeWidth={1.9} className={cx('relative', active ? 'text-fg' : '')} />}
            <span className="relative">{t.label}</span>
            {t.count !== undefined && <span className="relative num rounded-[4px] bg-white/[0.05] px-1 text-2xs text-fg-3">{t.count}</span>}
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Stepper ─── */
export function Stepper({ value, onChange, min = 0, max = 99, step = 1, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <div className="flex h-7 items-center rounded-sm bg-s-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_var(--color-line-3)]">
      <button disabled={value <= min} onClick={() => onChange(clamp(value - step, min, max))} className="flex h-full w-7 items-center justify-center text-fg-3 hover:text-fg disabled:opacity-30">
        <Minus size={12} />
      </button>
      <span className="num min-w-14 border-x border-line-3 text-center text-sm">
        {value}
        {suffix && <span className="ml-1 text-fg-3">{suffix}</span>}
      </span>
      <button disabled={value >= max} onClick={() => onChange(clamp(value + step, min, max))} className="flex h-full w-7 items-center justify-center text-fg-3 hover:text-fg disabled:opacity-30">
        <Plus size={12} />
      </button>
    </div>
  );
}

/* ─── Slider ─── */
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.5,
  marks,
  danger,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  marks?: number[];
  danger?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;
  const fromEvent = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const raw = min + clamp((clientX - r.left) / r.width, 0, 1) * (max - min);
    onChange(+(Math.round(raw / step) * step).toFixed(2));
  };
  const over = danger !== undefined && value > danger;
  return (
    <div
      ref={ref}
      className="relative h-5 cursor-pointer touch-none select-none"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDrag(true);
        fromEvent(e.clientX);
      }}
      onPointerMove={(e) => drag && fromEvent(e.clientX)}
      onPointerUp={() => setDrag(false)}
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-s-5 shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)]" />
      {danger !== undefined && (
        <div className="absolute top-1/2 right-0 h-1 -translate-y-1/2 rounded-r-full bg-red/25" style={{ left: `${((danger - min) / (max - min)) * 100}%` }} />
      )}
      <div className={cx('absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full transition-colors', over ? 'bg-amber' : 'bg-accent')} style={{ width: `${pct}%` }} />
      {marks?.map((m) => (
        <span key={m} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-4" style={{ left: `${((m - min) / (max - min)) * 100}%` }} />
      ))}
      <div
        className={cx(
          'absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#eef2f0] shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_2px_6px_rgba(0,0,0,0.5)] transition-transform',
          drag && 'scale-110',
        )}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

/* ─── Text input ─── */
export function TextInput({
  icon: Icon = Search,
  className,
  mono,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon | null; mono?: boolean }) {
  return (
    <label
      className={cx(
        'flex h-7 items-center gap-2 rounded-sm bg-bg-0/60 px-2.5 shadow-[inset_0_0_0_1px_var(--color-line-3)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--color-line-4),0_0_0_3px_rgba(122,162,217,0.14)]',
        className,
      )}
    >
      {Icon && <Icon size={13} className="shrink-0 text-fg-3" />}
      <input {...rest} className={cx('w-full min-w-0 bg-transparent text-sm text-fg outline-none placeholder:text-fg-4', mono && 'font-mono text-xs')} />
    </label>
  );
}

/* ─── Kbd ─── */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line-3 bg-s-3 px-1 font-sans text-2xs font-medium text-fg-3 shadow-[0_1px_0_var(--color-line-3)]">
      {children}
    </kbd>
  );
}
