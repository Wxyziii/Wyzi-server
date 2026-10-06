import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ChevronRight, Copy, Eraser, Pause, Play, Search, WrapText } from 'lucide-react';
import { sendCommand, useApp, type ConsoleLine, type Server } from '../../lib/store';
import { cx } from '../../lib/format';
import { IconButton } from '../../ui/Button';
import { Segmented } from '../../ui/Controls';
import { Tooltip } from '../../ui/Tooltip';
import { StatusBadge } from '../../ui/Status';
import { copyText } from '../shared';
import { toast } from '../../lib/store';

const EMPTY: ConsoleLine[] = [];
const SUGGEST = ['say ', 'list', 'tps', 'help', 'save-all', 'time set day', 'weather clear', 'op ', 'stop'];

const levelClass: Record<ConsoleLine['level'], string> = {
  info: 'text-[#c4ccc8]',
  warn: 'text-amber',
  error: 'text-[#ff8784]',
  cmd: 'text-accent',
  chat: 'text-[#e6ebe8]',
  sys: 'text-blue',
};
const levelTag: Record<ConsoleLine['level'], string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  cmd: '',
  chat: 'INFO',
  sys: 'AGENT',
};

export function ConsoleView({ s, height = 'calc(100vh - 330px)' }: { s: Server; height?: string }) {
  const lines = useApp((st) => st.consoles[s.id] ?? EMPTY);
  const [cmd, setCmd] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [follow, setFollow] = useState(true);
  const [paused, setPaused] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [filter, setFilter] = useState<'all' | 'chat' | 'warn'>('all');
  const [find, setFind] = useState('');
  const [cleared, setCleared] = useState(0);
  const [frozen, setFrozen] = useState<ConsoleLine[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFrozen(paused ? lines : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const source = (frozen ?? lines).filter((l) => l.id > cleared);
  const shown = source.filter(
    (l) =>
      (filter === 'all' || (filter === 'chat' ? l.level === 'chat' || l.level === 'cmd' : l.level === 'warn' || l.level === 'error')) &&
      (!find || l.text.toLowerCase().includes(find.toLowerCase())),
  );

  useLayoutEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [shown.length, follow]);

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus({ preventScroll: true }), 250);
    return () => clearTimeout(t);
  }, []);

  const submit = () => {
    if (!cmd.trim()) return;
    sendCommand(s.id, cmd);
    setHist((h) => [cmd, ...h].slice(0, 50));
    setHIdx(-1);
    setCmd('');
    setFollow(true);
  };

  const suggestions = cmd && !cmd.includes(' ') ? SUGGEST.filter((x) => x.startsWith(cmd) && x.trim() !== cmd) : [];
  const live = s.status === 'running';

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line-2 bg-[#070708] shadow-[var(--shadow-raise)]" style={{ height, minHeight: 380 }}>
      {/* toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-s-1/60 px-3">
        <div className="flex items-center gap-1.5 pr-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a2b31]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a2b31]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a2b31]" />
        </div>
        <span className="font-mono text-[11px] text-fg-3">{s.id}@wyzi-server · latest.log</span>
        <StatusBadge status={s.status} className="ml-1" />
        <div className="ml-auto flex items-center gap-1">
          <label className="mr-1 flex h-6 w-40 items-center gap-1.5 rounded-[5px] bg-white/[0.03] px-2 shadow-[inset_0_0_0_1px_var(--color-line-2)] focus-within:shadow-[inset_0_0_0_1px_var(--color-line-4)]">
            <Search size={11} className="text-fg-4" />
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find" className="w-full bg-transparent text-xs text-fg outline-none placeholder:text-fg-4" />
          </label>
          <Segmented
            size="xs"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'chat', label: 'Chat' },
              { value: 'warn', label: 'Warnings' },
            ]}
          />
          <div className="mx-1 h-4 w-px bg-line-2" />
          <Tooltip content={wrap ? 'Disable wrapping' : 'Wrap lines'}>
            <IconButton icon={WrapText} label="Wrap" size="xs" onClick={() => setWrap(!wrap)} className={wrap ? 'text-fg' : ''} />
          </Tooltip>
          <Tooltip content={paused ? 'Resume stream' : 'Pause stream'}>
            <IconButton icon={paused ? Play : Pause} label="Pause" size="xs" onClick={() => setPaused(!paused)} className={paused ? 'text-amber' : ''} />
          </Tooltip>
          <Tooltip content="Copy visible output">
            <IconButton
              icon={Copy}
              label="Copy"
              size="xs"
              onClick={async () => {
                await copyText(shown.map((l) => `[${l.t}] [${l.thread}/${levelTag[l.level]}]: ${l.text}`).join('\n'));
                toast('Console output copied', 'success', `${shown.length} lines`);
              }}
            />
          </Tooltip>
          <Tooltip content="Clear view">
            <IconButton icon={Eraser} label="Clear" size="xs" onClick={() => setCleared(lines[lines.length - 1]?.id ?? 0)} />
          </Tooltip>
        </div>
      </div>

      {/* output */}
      <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}
        className="absolute inset-0 overflow-auto px-3 py-2.5 font-mono text-[12px] leading-[19px]"
        onClick={() => window.getSelection()?.toString() || input.current?.focus({ preventScroll: true })}
      >
        {shown.length === 0 && (
          <div className="flex h-full items-center justify-center font-sans text-sm text-fg-4">
            {lines.length === 0 ? (live ? 'Waiting for output…' : `${s.name} has no output yet. Start the server to stream its log.`) : 'No lines match the current filter.'}
          </div>
        )}
        {shown.map((l) => (
          <div key={l.id} className={cx('group flex gap-2 rounded-[3px] px-1 hover:bg-white/[0.025]', !wrap && 'whitespace-nowrap')}>
            <span className="shrink-0 text-fg-4 select-none">{l.t}</span>
            {l.level !== 'cmd' && (
              <span className={cx('shrink-0 select-none', l.level === 'warn' ? 'text-amber/70' : l.level === 'error' ? 'text-red/70' : l.level === 'sys' ? 'text-blue/60' : 'text-fg-4')}>
                [{l.thread}/{levelTag[l.level]}]
              </span>
            )}
            <span className={cx(levelClass[l.level], wrap && 'break-all', l.level === 'cmd' && 'font-medium')}>
              {highlight(l.text, find)}
            </span>
          </div>
        ))}
        <div className="h-1" />
      </div>

      {!follow && (
        <button
          onClick={() => setFollow(true)}
          className="glass absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 text-xs text-fg-2 hover:text-fg"
        >
          <ArrowDown size={12} /> Jump to latest
        </button>
      )}
      </div>

      {/* input */}
      <div className="relative shrink-0 border-t border-line bg-s-1/50">
        {suggestions.length > 0 && (
          <div className="glass absolute bottom-full left-3 mb-1.5 flex gap-1 rounded-md p-1">
            {suggestions.slice(0, 5).map((x) => (
              <button key={x} onClick={() => { setCmd(x); input.current?.focus(); }} className="rounded-[4px] px-2 py-0.5 font-mono text-[11px] text-fg-2 hover:bg-white/[0.07] hover:text-fg">
                {x.trim()}
              </button>
            ))}
            <span className="flex items-center px-1.5 text-2xs text-fg-4">Tab</span>
          </div>
        )}
        <div className="flex h-11 items-center gap-2 px-3">
          <ChevronRight size={14} className={live ? 'text-accent' : 'text-fg-4'} />
          <input
            ref={input}
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              else if (e.key === 'Tab' && suggestions[0]) {
                e.preventDefault();
                setCmd(suggestions[0]);
              } else if (e.key === 'ArrowUp' && hist.length) {
                e.preventDefault();
                const n = Math.min(hist.length - 1, hIdx + 1);
                setHIdx(n);
                setCmd(hist[n]);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const n = hIdx - 1;
                setHIdx(Math.max(-1, n));
                setCmd(n < 0 ? '' : hist[n]);
              }
            }}
            spellCheck={false}
            placeholder={live ? 'Enter server command…' : 'Server is not running — commands will not be delivered'}
            className="flex-1 bg-transparent font-mono text-[12.5px] text-fg caret-accent outline-none placeholder:font-sans placeholder:text-sm placeholder:text-fg-4"
          />
          <span className="hidden items-center gap-1.5 text-2xs text-fg-4 md:flex">
            <kbd className="rounded-[3px] border border-line-3 px-1 font-sans">↑</kbd> history
            <kbd className="ml-1.5 rounded-[3px] border border-line-3 px-1 font-sans">↵</kbd> send
          </span>
        </div>
      </div>
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
