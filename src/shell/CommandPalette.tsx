import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ArrowRight,
  Copy,
  Cpu,
  HardDrive,
  LayoutGrid,
  Network,
  Play,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Settings,
  Square,
  type LucideIcon,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { navigate } from '../lib/router';
import { createBackup, requestStart, restartTunnel, stopServer, toast, useApp } from '../lib/store';
import { cx } from '../lib/format';
import { StatusDot } from '../ui/Status';
import { Kbd } from '../ui/Controls';
import { copyAddress } from '../pages/shared';

interface Cmd {
  id: string;
  label: string;
  group: string;
  icon?: LucideIcon;
  run: () => void;
  hint?: string;
  status?: React.ReactNode;
}

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const servers = useApp((s) => s.servers);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = () => useApp.setState({ paletteOpen: false });

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useApp.setState((s) => ({ paletteOpen: !s.paletteOpen }));
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const cmds = useMemo<Cmd[]>(() => {
    const pages: [string, LucideIcon][] = [
      ['Dashboard', LayoutGrid],
      ['Servers', Server],
      ['Storage', HardDrive],
      ['Backups', Archive],
      ['Network', Network],
      ['System', Cpu],
      ['Logs', ScrollText],
      ['Settings', Settings],
    ];
    const list: Cmd[] = pages.map(([p, icon]) => ({ id: 'p' + p, label: p, group: 'Go to', icon, run: () => navigate('/' + p.toLowerCase()), hint: 'Page' }));
    servers.forEach((s) => {
      list.push({ id: 'o' + s.id, label: s.name, group: 'Servers', status: <StatusDot status={s.status} size={6} />, run: () => navigate(`/servers/${s.id}`), hint: `${s.loader} · ${s.mc}` });
    });
    servers.forEach((s) => {
      if (s.status === 'running') list.push({ id: 'x' + s.id, label: `Stop ${s.name}`, group: 'Actions', icon: Square, run: () => stopServer(s.id) });
      if (s.status === 'offline' || s.status === 'sleeping') list.push({ id: 's' + s.id, label: `Start ${s.name}`, group: 'Actions', icon: Play, run: () => requestStart(s.id) });
      if (s.status === 'running') list.push({ id: 'c' + s.id, label: `Open ${s.name} console`, group: 'Actions', icon: ArrowRight, run: () => navigate(`/servers/${s.id}/console`) });
    });
    list.push(
      { id: 'bk', label: 'Back up Prominence II now', group: 'Actions', icon: Archive, run: () => { createBackup('prominence-ii'); navigate('/backups'); } },
      { id: 'cp', label: 'Copy public address', group: 'Actions', icon: Copy, run: () => copyAddress() },
      { id: 'rt', label: 'Restart Playit tunnel', group: 'Actions', icon: RefreshCw, run: () => restartTunnel() },
      { id: 'up', label: 'Check for system updates', group: 'Actions', icon: RefreshCw, run: () => toast('System is up to date', 'success', 'Last checked just now') },
    );
    return list;
  }, [servers]);

  const filtered = cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()) || c.group.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(filtered.map((c) => c.group))];
  const ordered = groups.flatMap((g) => filtered.filter((c) => c.group === g));

  const run = (c: Cmd | undefined) => {
    if (!c) return;
    close();
    c.run();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[85] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-[#020203]/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={close} />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[560px] overflow-hidden rounded-xl border border-line-3 bg-[rgba(17,22,21,0.86)] shadow-[var(--shadow-modal)] backdrop-blur-xl"
          >
            <div className="flex h-12 items-center gap-3 border-b border-line-2 px-4">
              <Search size={15} className="text-fg-3" />
              <input
                ref={inputRef}
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSel((s) => Math.min(ordered.length - 1, s + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSel((s) => Math.max(0, s - 1));
                  } else if (e.key === 'Enter') run(ordered[sel]);
                  else if (e.key === 'Escape') close();
                }}
                placeholder="Search pages, servers and actions…"
                className="flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-4"
              />
              <Kbd>Esc</Kbd>
            </div>
            <div className="max-h-[380px] overflow-y-auto p-1.5">
              {ordered.length === 0 && <div className="py-10 text-center text-sm text-fg-3">No results for “{q}”</div>}
              {groups.map((g) => (
                <div key={g} className="mb-1">
                  <div className="px-2.5 pt-2 pb-1 text-2xs font-medium tracking-[0.06em] text-fg-4 uppercase">{g}</div>
                  {filtered
                    .filter((c) => c.group === g)
                    .map((c) => {
                      const idx = ordered.indexOf(c);
                      const Icon = c.icon;
                      return (
                        <button
                          key={c.id}
                          onMouseMove={() => setSel(idx)}
                          onClick={() => run(c)}
                          className={cx('flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm', sel === idx ? 'bg-white/[0.07] text-fg' : 'text-fg-2')}
                        >
                          <span className="flex w-4 justify-center text-fg-3">{c.status ?? (Icon && <Icon size={14} />)}</span>
                          <span className="flex-1">{c.label}</span>
                          {c.hint && <span className="text-xs text-fg-4">{c.hint}</span>}
                          {sel === idx && <ArrowRight size={13} className="text-fg-3" />}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 border-t border-line-2 px-4 py-2 text-2xs text-fg-4">
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> run</span>
              <span className="ml-auto">WYZI Server · prototype</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
