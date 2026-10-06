import { useEffect, useState } from 'react';
import { api } from './api';
import { IS_LIVE } from './mode';
import { useApp } from './store';

export interface UpdateItem {
  pkg: string;
  from: string;
  to: string;
  sec: boolean;
}

const MOCK_UPDATES: UpdateItem[] = [
  { pkg: 'linux-image-6.8.0-138-generic', from: '6.8.0-136.136', to: '6.8.0-138.138', sec: true },
  { pkg: 'openjdk-21-jre-headless', from: '21.0.11+10-1', to: '21.0.12+8-1', sec: true },
  { pkg: 'curl', from: '8.5.0-2ubuntu10.6', to: '8.5.0-2ubuntu10.7', sec: false },
];

let cache: { items: UpdateItem[]; checkedAt: number | null } | null = null;
const listeners = new Set<() => void>();

export async function fetchUpdates(refresh = false) {
  if (!IS_LIVE) {
    cache = { items: MOCK_UPDATES, checkedAt: Date.now() / 1000 };
  } else {
    cache = await api.get<{ items: UpdateItem[]; checkedAt: number | null }>(`/api/system/updates${refresh ? '?refresh=true' : ''}`);
  }
  listeners.forEach((l) => l());
  return cache;
}

/** Pending apt updates (read-only; installation is handled by unattended-upgrades / SSH). */
export function useUpdates() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (!cache) fetchUpdates().catch(() => {});
    return () => {
      listeners.delete(l);
    };
  }, []);
  return cache;
}

/** Re-render every `ms` (for uptime counters etc.). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(iv);
  }, [ms]);
  return now;
}

/** Seconds since boot, ticking. */
export function useUptime() {
  const host = useApp((s) => s.host);
  const now = useNow(30000);
  return host ? Math.max(0, now / 1000 - host.bootTime) : 0;
}

export const GB = 1024 ** 3;
export const fmtBytes = (b: number) => (b >= 1024 * GB * 0.95 ? `${(b / (1024 * GB)).toFixed(2)} TB` : b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`);
export const diskLabel = (bytes: number) => (bytes >= 1e12 ? `${Math.round(bytes / 1e12)} TB` : `${Math.round(bytes / 1e9)} GB`);
