import { useEffect, useState } from 'react';
import { Bell, ChevronRight, PanelLeft, Wifi } from 'lucide-react';
import { navigate, type Route } from '../lib/router';
import { useApp } from '../lib/store';
import { IconButton } from '../ui/Button';
import { Dropdown } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';

const titles: Record<string, string> = {
  dashboard: 'Dashboard',
  servers: 'Servers',
  storage: 'Storage',
  backups: 'Backups',
  network: 'Network',
  system: 'System',
  logs: 'Logs',
  settings: 'Settings',
};

export function Topbar({ route, onToggle }: { route: Route; onToggle: () => void }) {
  const servers = useApp((s) => s.servers);
  const activity = useApp((s) => s.activity);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  const srv = route.serverId ? servers.find((s) => s.id === route.serverId) : null;

  const crumbs: { label: string; to?: string }[] = [{ label: titles[route.page], to: '/' + route.page }];
  if (srv) crumbs.push({ label: srv.name });

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg-1/80 px-3 backdrop-blur">
      <Tooltip content="Toggle sidebar" kbd="Ctrl B">
        <IconButton icon={PanelLeft} label="Toggle sidebar" size="sm" onClick={onToggle} />
      </Tooltip>
      <div className="mx-1 h-4 w-px bg-line-2" />
      <div className="flex min-w-0 items-center gap-1 text-sm">
        <span className="font-mono text-[11px] text-fg-4">WYZI-SERVER</span>
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            <ChevronRight size={12} className="text-fg-4" />
            {c.to && i < crumbs.length - 1 ? (
              <button onClick={() => navigate(c.to!)} className="truncate text-fg-3 transition-colors hover:text-fg">
                {c.label}
              </button>
            ) : (
              <span className="truncate font-medium text-fg">{c.label}</span>
            )}
          </span>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip content="Portal is bound to the local network only">
          <span className="hidden h-6 items-center gap-1.5 rounded-[5px] px-2 text-xs text-fg-3 shadow-[inset_0_0_0_1px_var(--color-line-2)] md:flex">
            <Wifi size={12} className="text-fg-4" />
            <span className="font-mono text-[11px]">192.168.1.40</span>
          </span>
        </Tooltip>
        <span className="hidden items-center gap-1.5 px-2 text-xs text-fg-3 lg:flex">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/50" style={{ animationDuration: '2.4s' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          Live
          <span className="num font-mono text-[11px] text-fg-4">{now.toTimeString().slice(0, 8)}</span>
        </span>
        <Dropdown
          width={300}
          items={[
            { heading: 'Recent events' },
            ...activity.slice(0, 6).map((a) => ({ label: a.title, hint: a.time })),
            { separator: true },
            { label: 'View all logs', onSelect: () => navigate('/logs') },
          ]}
          trigger={({ onClick }) => (
            <span className="relative">
              <IconButton icon={Bell} label="Notifications" onClick={onClick} />
              <span className="pointer-events-none absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-bg-1" />
            </span>
          )}
        />
        <div className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-[#2a2b31] to-[#1b1c20] text-2xs font-semibold text-fg-2 shadow-[inset_0_0_0_1px_var(--color-line-4)]">
          W
        </div>
      </div>
    </div>
  );
}
