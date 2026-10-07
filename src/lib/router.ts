import { useEffect, useState } from 'react';

export type Page = 'dashboard' | 'servers' | 'config' | 'storage' | 'backups' | 'network' | 'system' | 'logs' | 'settings';

export interface Route {
  page: Page;
  serverId?: string;
  tab?: string;
}

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const page = (parts[0] as Page) || 'dashboard';
  if (page === 'servers' && parts[1]) return { page, serverId: parts[1], tab: parts[2] ?? 'overview' };
  if (page === 'settings' && parts[1]) return { page, tab: parts[1] };
  return { page };
}

export function navigate(path: string) {
  if (location.hash !== '#' + path) location.hash = path;
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
