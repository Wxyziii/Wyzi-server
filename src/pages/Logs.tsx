import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSearch } from 'lucide-react';
import { toast, useApp, type LogEntry } from '../lib/store';
import { cx } from '../lib/format';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/Controls';
import { Empty, PageHeader, Reveal } from '../ui/Layout';

const sources: { id: LogEntry['source']; label: string; color: string }[] = [
  { id: 'system', label: 'System', color: '#9CA5A1' },
  { id: 'portal', label: 'Portal', color: '#8D97B0' },
  { id: 'playit', label: 'Playit', color: '#7AA2D9' },
  { id: 'backup', label: 'Backups', color: '#9A92C8' },
  { id: 'prominence', label: 'Prominence II', color: '#c8ccd4' },
  { id: 'cobblemon', label: 'Cobblemon', color: '#E5AD4F' },
];
const levels: LogEntry['level'][] = ['debug', 'info', 'warn', 'error'];
const levelStyle: Record<LogEntry['level'], string> = {
  debug: 'text-fg-4',
  info: 'text-fg-3',
  warn: 'text-amber',
  error: 'text-red',
};

export function Logs() {
  const logs = useApp((s) => s.logs);
  const [src, setSrc] = useState<Set<string>>(new Set(sources.map((s) => s.id)));
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
            <Button variant="outline" icon={Download} onClick={() => toast('Export is disabled in the prototype', 'info')}>
              Export
            </Button>
          }
        >
          <span>journald + server logs, unified</span>
          <span className="h-3 w-px bg-line-3" />
          <span className="num">{logs.length} entries today</span>
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
                const s = sources.find((x) => x.id === l.source)!;
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
