import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { cx } from '../lib/format';

/* ─── geometry helpers ─── */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

const COLORS = {
  mint: '#3ECF8E',
  blue: '#6F95CC',
  slate: '#8D97B0',
  amber: '#E5AD4F',
  red: '#EF6461',
  violet: '#9A92C8',
  grey: '#6C7079',
};
export type ChartColor = keyof typeof COLORS;
export const chartColor = (c: ChartColor) => COLORS[c];

/* ─── Sparkline ─── */
export function Sparkline({
  data,
  color = 'blue',
  height = 28,
  width = 96,
  fill = true,
  max,
  min = 0,
  className,
}: {
  data: number[];
  color?: ChartColor;
  height?: number;
  width?: number;
  fill?: boolean;
  max?: number;
  min?: number;
  className?: string;
}) {
  const id = useId();
  const hi = max ?? Math.max(...data, 1) * 1.15;
  const lo = min;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 1 - ((v - lo) / (hi - lo || 1)) * (height - 2)] as [number, number]);
  const line = smoothPath(pts);
  const c = COLORS[color];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cx('block overflow-visible', className)}>
      <defs>
        <linearGradient id={`sg${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.18" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#sg${id})`} style={{ transition: 'd 0.6s ease' }} />}
      <path d={line} fill="none" stroke={c} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" style={{ transition: 'd 0.6s ease' }} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={c} style={{ transition: 'cy 0.6s ease' }} />
    </svg>
  );
}

/* ─── responsive container size ─── */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ─── Area / line chart with hover readout ─── */
export interface Series {
  data: number[];
  color: ChartColor;
  label: string;
  fill?: boolean;
  dashed?: boolean;
}

export function AreaChart({
  series,
  height = 180,
  max,
  min = 0,
  format = (v) => v.toFixed(1),
  ticks = 4,
  intervalSec = 1.5,
  threshold,
  className,
}: {
  series: Series[];
  height?: number;
  max?: number;
  min?: number;
  format?: (v: number) => string;
  ticks?: number;
  intervalSec?: number;
  threshold?: { value: number; label: string; color?: ChartColor };
  className?: string;
}) {
  const [ref, width] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const n = series[0]?.data.length ?? 0;
  const padL = 34;
  const padB = 18;
  const w = Math.max(0, width - padL);
  const h = height - padB;
  const hi = max ?? Math.max(...series.flatMap((s) => s.data), 1) * 1.2;
  const x = (i: number) => padL + (i / (n - 1)) * w;
  const y = (v: number) => 4 + (1 - (v - min) / (hi - min || 1)) * (h - 4);

  const paths = useMemo(
    () =>
      series.map((s) => {
        const pts = s.data.map((v, i) => [x(i), y(v)] as [number, number]);
        const line = smoothPath(pts);
        return { line, area: `${line} L${x(n - 1)},${h} L${padL},${h} Z` };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, width, hi, height],
  );

  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + ((hi - min) / ticks) * i);
  const secs = (n - 1) * intervalSec;

  return (
    <div
      ref={ref}
      className={cx('relative select-none', className)}
      style={{ height }}
      onMouseMove={(e) => {
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left - padL) / w) * (n - 1));
        setHover(i >= 0 && i < n ? i : null);
      }}
      onMouseLeave={() => setHover(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} className="absolute inset-0 overflow-visible">
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`ag${id}${i}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={COLORS[s.color]} stopOpacity="0.16" />
                <stop offset="0.85" stopColor={COLORS[s.color]} stopOpacity="0.01" />
              </linearGradient>
            ))}
            <clipPath id={`clip${id}`}>
              <motion.rect
                x={padL}
                y={-10}
                height={height + 20}
                initial={{ width: 0 }}
                animate={{ width: w + 4 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </clipPath>
          </defs>
          {tickVals.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke="#1d1e22" strokeDasharray={i === 0 ? undefined : '2 4'} />
              <text x={padL - 8} y={y(t) + 3} textAnchor="end" className="num fill-fg-4 text-[10px]">
                {format(t)}
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <text key={f} x={padL + f * w} y={height - 4} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} className="num fill-fg-4 text-[10px]">
              {f === 1 ? 'now' : `-${Math.round(secs * (1 - f))}s`}
            </text>
          ))}
          {threshold && (
            <g>
              <line x1={padL} x2={width} y1={y(threshold.value)} y2={y(threshold.value)} stroke={COLORS[threshold.color ?? 'amber']} strokeOpacity="0.5" strokeDasharray="4 4" />
              <text x={width - 4} y={y(threshold.value) - 5} textAnchor="end" className="text-[10px]" fill={COLORS[threshold.color ?? 'amber']} fillOpacity="0.8">
                {threshold.label}
              </text>
            </g>
          )}
          <g clipPath={`url(#clip${id})`}>
            {series.map((s, i) => (
              <g key={i}>
                {s.fill !== false && <path d={paths[i].area} fill={`url(#ag${id}${i})`} style={{ transition: 'd 0.5s ease' }} />}
                <path
                  d={paths[i].line}
                  fill="none"
                  stroke={COLORS[s.color]}
                  strokeWidth={1.5}
                  strokeDasharray={s.dashed ? '3 3' : undefined}
                  strokeLinejoin="round"
                  style={{ transition: 'd 0.5s ease' }}
                />
              </g>
            ))}
          </g>
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} stroke="#3a3c43" strokeWidth="1" />
              {series.map((s, i) => (
                <circle key={i} cx={x(hover)} cy={y(s.data[hover])} r="3" fill="#0b0c0e" stroke={COLORS[s.color]} strokeWidth="1.5" />
              ))}
            </g>
          )}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          className="glass pointer-events-none absolute top-1 z-10 min-w-32 rounded-md px-2.5 py-2"
          style={{ left: x(hover) > width - 160 ? x(hover) - 148 : x(hover) + 12 }}
        >
          <div className="num mb-1 text-2xs text-fg-3">{hover === n - 1 ? 'Now' : `${Math.round((n - 1 - hover) * intervalSec)}s ago`}</div>
          {series.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: COLORS[s.color] }} />
              <span className="flex-1 text-fg-2">{s.label}</span>
              <span className="num font-medium text-fg">{format(s.data[hover])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Bar chart (columns) ─── */
export function Bars({ data, color = 'blue', height = 40, max, className, highlightLast }: { data: number[]; color?: ChartColor; height?: number; max?: number; className?: string; highlightLast?: boolean }) {
  const hi = max ?? Math.max(...data, 1);
  return (
    <div className={cx('flex items-end gap-[2px]', className)} style={{ height }}>
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] transition-[height] duration-500"
          style={{
            height: `${Math.max(4, (v / hi) * 100)}%`,
            background: COLORS[color],
            opacity: highlightLast && i === data.length - 1 ? 1 : 0.18 + (v / hi) * 0.5,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Meter (thin progress) ─── */
export function Meter({
  value,
  max = 100,
  tone = 'blue',
  height = 4,
  className,
  striped,
  track = 'bg-white/[0.06]',
}: {
  value: number;
  max?: number;
  tone?: ChartColor | 'auto';
  height?: number;
  className?: string;
  striped?: boolean;
  track?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const c = tone === 'auto' ? (pct > 90 ? 'red' : pct > 75 ? 'amber' : 'slate') : tone;
  return (
    <div className={cx('relative w-full overflow-hidden rounded-full', track, className)} style={{ height }}>
      <motion.div
        className={cx('absolute inset-y-0 left-0 rounded-full', striped && 'progress-stripes')}
        style={{ backgroundColor: COLORS[c] }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={striped ? { duration: 0.15, ease: 'linear' } : { duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/* ─── Stacked composition bar ─── */
export interface Segment {
  label: string;
  value: number;
  color: string;
  pattern?: boolean;
}
export function StackedBar({ segments, total, height = 10, className, gap = 2 }: { segments: Segment[]; total: number; height?: number; className?: string; gap?: number }) {
  return (
    <div className={cx('flex w-full overflow-hidden rounded-[3px]', className)} style={{ height, gap }}>
      {segments.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ flexGrow: 0 }}
          animate={{ flexGrow: s.value / total }}
          transition={{ duration: 0.9, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="relative min-w-0 basis-0 first:rounded-l-[3px] last:rounded-r-[3px]"
          style={{
            background: s.pattern
              ? `repeating-linear-gradient(-45deg, ${s.color} 0 2px, transparent 2px 5px)`
              : s.color,
            boxShadow: s.pattern ? `inset 0 0 0 1px ${s.color}` : 'inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Animated numeric value ─── */
export function Num({ value, format = (v) => v.toFixed(0), className }: { value: number; format?: (v: number) => string; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1] });
    return c.stop;
  }, [value, mv]);
  return <motion.span className={cx('num', className)}>{text}</motion.span>;
}

/* ─── Radial gauge ─── */
export function Ring({ value, size = 44, stroke = 4, color = 'blue', children }: { value: number; size?: number; stroke?: number; color?: ChartColor | 'auto'; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const arc = 0.75;
  const c = color === 'auto' ? (value > 85 ? 'red' : value > 70 ? 'amber' : 'blue') : color;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[135deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#202126" strokeWidth={stroke} strokeDasharray={`${circ * arc} ${circ}`} strokeLinecap="round" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={COLORS[c]}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${(circ * arc * Math.min(100, value)) / 100} ${circ}` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
