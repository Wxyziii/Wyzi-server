export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function fmtUptime(sec: number) {
  if (sec <= 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

export function clock(d = new Date()) {
  return d.toTimeString().slice(0, 8);
}

export function hhmm(d = new Date()) {
  return d.toTimeString().slice(0, 5);
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function jitter(v: number, amount: number, min = -Infinity, max = Infinity) {
  return clamp(v + (Math.random() - 0.5) * 2 * amount, min, max);
}

export function initials(name: string) {
  return name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
