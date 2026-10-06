import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSearch } from 'lucide-react';
import { toast, useApp, type LogEntry } from '../lib/store';
import { IS_LIVE } from '../lib/mode';
import { cx } from '../lib/format';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/Controls';
import { Empty, PageHeader, Reveal } from '../ui/Layout';

const baseSources: { id: LogEntry['source']; label: string; color: string }[] = [
  { id: 'system', label: 'System', color: '#9CA5A1' },
  { id: 'portal', label: 'Portal', color: '#8D97B0' },
  { id: 'playit', label: 'Playit', color: '#7AA2D9' },
  { id: 'backup', label: 'Backups', color: '#9A92C8' },
];
const SERVER_COLORS = ['#c8ccd4', '#E5AD4F', '#8fb3a3', '#b39ddb', '#d4a5a5'];
// prototype log entries use short source names
const MOCK_ALIASES: Record<string, string> = { 'prominence-ii': 'prominence' };
const levels: LogEntry['level'][] = ['debug', 'info', 'warn', 'error'];
const levelStyle: Record<LogEntry['level'], string> = {
  debug: 'text-fg-4',
  info: 'text-fg-3',
  warn: 'text-amber',
  error: 'text-red',
};

export function Logs() {
  const logs = useApp((s) => s.logs);
  const servers = useApp((s) => s.servers);
  const sources = useMemo(
    () => [
      ...baseSources,
      ...servers
        .filter((x) => x.status !== 'undeployed')
        .map((x, i) => ({ id: MOCK_ALIASES[x.id] ?? x.id, label: x.name, color: SERVER_COLORS[i % SERVER_COLORS.length] })),
    ],
    [servers.map((x) => x.id).join(',')], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const src = useMemo(() => new Set(sources.map((s) => s.id).filter((id) => !hidden.has(id))), [sources, hidden]);
  const setSrc = (next: Set<string>) => setHidden(new Set(sources.map((s) => s.id).filter((id) => !next.has(id))));
  const [lv, setLv] = useState<Set<string>>(new Set(['info', 'warn', 'error']));
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const shown = logs.filter((l) => src.has(l.source) && lv.has(l.level) && (!q || l.msg.toLowerCase().includes(q.toLowerCase())));

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const toggle = (set: Set<string>, v: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    fn(n);
  };

  return (
    <div>
      <Reveal>
        <PageHeader
          title="Logs"
          actions={
            <Button
              variant="outline"
              icon={Download}
              onClick={() => {
                const text = shown.map((l) => `${l.t} [${l.source}] ${l.level.toUpperCase()} ${l.msg}`).join('\n');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
                a.download = `wyzi-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`;
                a.click();
                URL.revokeObjectURL(a.href);
                toast('Logs exported', 'success', `${shown.length} entries`);
              }}
            >
              Export
            </Button>
          }
        >
          <span>{IS_LIVE ? 'Portal events, Playit, backups and server warnings' : 'journald + server logs, unified'}</span>
          <span className="h-3 w-px bg-line-3" />
          <span className="num">{logs.length} entries{IS_LIVE ? ' since portal start' : ' today'}</span>
        </PageHeader>
      </Reveal>

      <Reveal i={1}>
        <section className="surface overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
            <div className="flex flex-wrap gap-1">
              {sources.map((s) => {
                const on = src.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(src, s.id, setSrc)}
                    className={cx(
                      'flex h-6 items-center gap-1.5 rounded-[5px] px-2 text-xs transition-all',
                      on ? 'bg-white/[0.05] text-fg shadow-[inset_0_0_0_1px_var(--color-line-3)]' : 'text-fg-4 shadow-[inset_0_0_0_1px_var(--color-line)] hover:text-fg-3',
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full transition-opacity" style={{ background: s.color, opacity: on ? 1 : 0.35 }} />
                    {s.label}
                  </button>
                );
              })}
            </div>
            <div className="mx-1 h-4 w-px bg-line-2" />
            <div className="flex gap-1">
              {levels.map((l) => {
                const on = lv.has(l);
                return (
                  <button
                    key={l}
                    onClick={() => toggle(lv, l, setLv)}
                    className={cx(
                      'h-6 rounded-[5px] px-2 font-mono text-[10.5px] uppercase transition-all',
                      on ? cx('bg-white/[0.05] shadow-[inset_0_0_0_1px_var(--color-line-3)]', levelStyle[l] === 'text-fg-4' ? 'text-fg-2' : levelStyle[l]) : 'text-fg-4 hover:text-fg-3',
                    )}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            <TextInput placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} className="ml-auto w-60" />
          </div>

          <div ref={ref} className="h-[calc(100vh-260px)] min-h-[360px] overflow-auto py-1.5 font-mono text-[12px] leading-[22px]">
            {shown.length === 0 ? (
              <Empty icon={FileSearch} title="No log entries" desc="Nothing matches the selected sources, levels and search." />
            ) : (
              shown.map((l) => {
                const s = sources.find((x) => x.id === l.source) ?? { id: l.source, label: l.source, color: '#9CA5A1' };
                return (
                  <motion.div
                    key={l.id}
                    initial={{ opacity: 0, backgroundColor: 'rgba(255,255,255,0.03)' }}
                    animate={{ opacity: 1, backgroundColor: 'rgba(255,255,255,0)' }}
                    transition={{ duration: 0.8 }}
                    className="grid grid-cols-[70px_110px_52px_1fr] gap-3 px-4 hover:!bg-white/[0.025]"
                  >
                    <span className="text-fg-4">{l.t}</span>
                    <span className="flex items-center gap-1.5 truncate" style={{ color: s.color }}>
                      <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: s.color }} />
                      {s.label.toLowerCase().replace(' ', '-')}
                    </span>
                    <span className={cx('uppercase', levelStyle[l.level])}>{l.level}</span>
                    <span className={cx('break-all', l.level === 'warn' ? 'text-amber' : l.level === 'error' ? 'text-red' : l.level === 'debug' ? 'text-fg-3' : 'text-fg-2')}>{highlight(l.msg, q)}</span>
                  </motion.div>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-2xs text-fg-4">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/50" style={{ animationDuration: '2.4s' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            Streaming · showing {shown.length} of {logs.length}
          </div>
        </section>
      </Reveal>
    </div>
  );
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[2px] bg-amber/30 text-fg">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
