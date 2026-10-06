import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  Check,
  Copy,
  FolderOpen,
  MoreHorizontal,
  Play,
  Power,
  RotateCw,
  Settings2,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react';
import { navigate } from '../lib/router';
import {
  createBackup,
  requestStart,
  restartServer,
  stopServer,
  STARTUP_STEPS,
  toast,
  useApp,
  type Server,
} from '../lib/store';
import { cx } from '../lib/format';
import { Button, IconButton } from '../ui/Button';
import { Dropdown, type MenuItem } from '../ui/Menu';
import { Spinner } from '../ui/Spinner';
import { Tooltip } from '../ui/Tooltip';

export const PUBLIC_HOST = 'example.gl.joinmc.link';
export const PUBLIC_ADDRESS = `${PUBLIC_HOST}:28451`;

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

export async function copyAddress(addr = PUBLIC_ADDRESS) {
  await copyText(addr);
  toast('Address copied', 'success', addr);
}

export function serverMenu(s: Server): MenuItem[] {
  const live = s.status === 'running';
  const idle = s.status === 'offline' || s.status === 'sleeping';
  return [
    { heading: s.name },
    { label: 'Open console', icon: Terminal, onSelect: () => navigate(`/servers/${s.id}/console`), shortcut: 'C' },
    { label: 'Browse files', icon: FolderOpen, onSelect: () => navigate(`/servers/${s.id}/files`) },
    { label: 'Server settings', icon: Settings2, onSelect: () => navigate(`/servers/${s.id}/settings`) },
    { separator: true },
    idle
      ? { label: s.status === 'sleeping' ? 'Wake server' : 'Start server', icon: Play, onSelect: () => requestStart(s.id) }
      : { label: 'Restart', icon: RotateCw, disabled: !live, onSelect: () => restartServer(s.id) },
    { label: 'Back up now', icon: Archive, onSelect: () => { createBackup(s.id); toast('Backup started', 'info', s.name); } },
    { label: 'Copy address', icon: Copy, disabled: !s.tunnelPort, onSelect: () => copyAddress(`${PUBLIC_HOST}:${s.tunnelPort}`) },
    { separator: true },
    { label: 'Stop server', icon: Square, danger: true, disabled: !live, onSelect: () => stopServer(s.id) },
    { label: 'Delete instance…', icon: Trash2, danger: true, onSelect: () => toast('Deleting instances is disabled in the prototype', 'warn') },
  ];
}

export function MoreMenu({ s, size = 'sm' }: { s: Server; size?: 'xs' | 'sm' }) {
  return (
    <Dropdown
      items={serverMenu(s)}
      trigger={({ onClick, ...p }) => (
        <Tooltip content="More actions">
          <IconButton icon={MoreHorizontal} label="More" size={size} onClick={onClick} className={p['data-open'] ? 'bg-white/[0.06] text-fg' : ''} />
        </Tooltip>
      )}
    />
  );
}

/** Start / Stop / Restart cluster that adapts to server state. */
export function PowerActions({ s, size = 'sm', compact }: { s: Server; size?: 'xs' | 'sm' | 'md'; compact?: boolean }) {
  if (s.status === 'running')
    return (
      <div className="flex items-center gap-1.5">
        {compact ? (
          <Tooltip content="Restart">
            <IconButton icon={RotateCw} label="Restart" variant="outline" size={size === 'md' ? 'md' : size} onClick={() => restartServer(s.id)} />
          </Tooltip>
        ) : (
          <Button size={size} variant="secondary" icon={RotateCw} onClick={() => restartServer(s.id)}>
            Restart
          </Button>
        )}
        <Button size={size} variant="danger" icon={Square} onClick={() => stopServer(s.id)}>
          Stop
        </Button>
      </div>
    );
  if (s.status === 'starting')
    return (
      <Button size={size} variant="secondary" loading className="min-w-[96px] text-amber">
        Starting
      </Button>
    );
  if (s.status === 'stopping')
    return (
      <Button size={size} variant="secondary" loading className="min-w-[96px]">
        Stopping
      </Button>
    );
  return (
    <Button size={size} variant="primary" icon={s.status === 'sleeping' ? Power : Play} onClick={() => requestStart(s.id)} className="min-w-[80px]">
      {s.status === 'sleeping' ? 'Wake' : 'Start'}
    </Button>
  );
}

/** Animated startup checklist shown while a server boots. */
export function StartupSequence({ s, layout = 'row' }: { s: Server; layout?: 'row' | 'list' }) {
  const step = s.startStep;
  const pct = (step / (STARTUP_STEPS.length - 1)) * 100;
  if (layout === 'list')
    return (
      <div className="space-y-0.5">
        {STARTUP_STEPS.map((label, i) => {
          const done = i < step || (i === STARTUP_STEPS.length - 1 && s.status === 'running');
          const active = i === step && s.status === 'starting';
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cx('flex h-7 items-center gap-2.5 text-sm transition-colors', done ? 'text-fg-2' : active ? 'text-fg' : 'text-fg-4')}
            >
              <StepIcon done={done} active={active} />
              <span className="flex-1">{label}</span>
              {done && <span className="num font-mono text-2xs text-fg-4">ok</span>}
            </motion.div>
          );
        })}
      </div>
    );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {STARTUP_STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <span key={label} className={cx('flex items-center gap-1.5 text-xs transition-colors duration-300', done ? 'text-fg-3' : active ? 'text-fg' : 'text-fg-4')}>
              <StepIcon done={done} active={active} small />
              {label}
            </span>
          );
        })}
      </div>
      <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-white/[0.05]">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-amber/70 to-amber" animate={{ width: `${Math.max(6, pct)}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
      </div>
    </div>
  );
}

function StepIcon({ done, active, small }: { done: boolean; active: boolean; small?: boolean }) {
  const sz = small ? 12 : 14;
  return (
    <span className="relative flex shrink-0 items-center justify-center" style={{ width: sz, height: sz }}>
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.span key="d" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }} className="flex items-center justify-center rounded-full bg-mint/15 text-mint" style={{ width: sz, height: sz }}>
            <Check size={sz - 4} strokeWidth={3} />
          </motion.span>
        ) : active ? (
          <motion.span key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-amber">
            <Spinner size={sz} />
          </motion.span>
        ) : (
          <motion.span key="p" className="rounded-full border border-line-4" style={{ width: sz - 4, height: sz - 4 }} />
        )}
      </AnimatePresence>
    </span>
  );
}

export function useServer(id?: string) {
  return useApp((s) => s.servers.find((x) => x.id === id));
}

export const monogramTone = (s: Server) =>
  s.status === 'running' ? 'neutral' : s.status === 'starting' || s.status === 'stopping' ? 'amber' : s.status === 'sleeping' ? 'blue' : 'neutral';
