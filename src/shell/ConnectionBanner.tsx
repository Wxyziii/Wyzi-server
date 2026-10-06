import { RefreshCw, WifiOff } from 'lucide-react';
import { useApp } from '../lib/store';
import { cx } from '../lib/format';
import { Spinner } from '../ui/Spinner';

/** Explicit live-mode connection state: the portal never silently shows stale or fake data.
    A CSS grid-rows transition (instead of an exit animation) so it can never get stuck. */
export function ConnectionBanner() {
  const conn = useApp((s) => s.conn);
  const show = conn.mode === 'live' && conn.state !== 'online';
  return (
    <div
      aria-hidden={!show}
      className={cx(
        'relative z-[2] grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        show ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0',
      )}
    >
      <div className="overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-amber/20 bg-amber/[0.06] px-4 py-2 text-xs text-amber">
          {conn.state === 'connecting' ? <Spinner size={12} /> : <WifiOff size={13} />}
          <span className="font-medium">{conn.state === 'connecting' ? 'Connecting to server…' : 'Server unreachable'}</span>
          <span className="text-amber/70">
            {conn.state === 'connecting' ? 'Loading live data from the Wyzi backend.' : `${conn.error ?? 'No response from the backend.'} Values shown may be out of date — retrying automatically.`}
          </span>
          {conn.state === 'offline' && (
            <button onClick={() => location.reload()} className="ml-auto flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-amber/90 hover:bg-amber/10">
              <RefreshCw size={11} /> Reload
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
