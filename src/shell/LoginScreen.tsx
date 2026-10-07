import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Lock, Terminal } from 'lucide-react';
import { login } from '../lib/live';
import { useApp } from '../lib/store';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

/** Full-screen gate for live mode. 'setup' means no admin password exists yet: it can only be
    set on the server (no first-come setup form on the LAN). */
export function LoginScreen() {
  const auth = useApp((s) => s.auth);
  const conn = useApp((s) => s.conn);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), [auth.state]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setError(null);
    const err = await login(pw);
    setBusy(false);
    if (err) {
      setError(err);
      setPw('');
      input.current?.focus();
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-bg-0 px-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(140,160,200,0.05),transparent)]" />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="surface relative w-full max-w-[380px] rounded-xl p-6"
      >
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-[26px] w-[26px] shrink-0 flex-col justify-center gap-[3px] rounded-[7px] bg-gradient-to-b from-[#1e1f24] to-[#131417] px-[6px] shadow-[inset_0_0_0_1px_var(--color-line-3),inset_0_1px_0_rgba(255,255,255,0.08)]">
            <span className="h-[3px] rounded-[1px] bg-accent" />
            <span className="h-[3px] rounded-[1px] bg-fg-4" />
            <span className="h-[3px] w-2/3 rounded-[1px] bg-fg-4" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-[-0.01em]">WYZI Server</div>
            <div className="text-xs text-fg-3">Local administration portal</div>
          </div>
        </div>

        {auth.state === 'unknown' ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-fg-3">
            <Spinner size={14} /> {conn.state === 'offline' ? conn.error ?? 'Server unreachable' : 'Connecting…'}
          </div>
        ) : auth.state === 'setup' ? (
          <div className="mt-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound size={14} className="text-amber" /> No admin password set
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-3">
              For safety the first password can only be set on the server itself. Over SSH run:
            </p>
            <div className="mt-3 flex items-start gap-2 rounded-md border border-line-2 bg-bg-1 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-fg-2">
              <Terminal size={12} className="mt-1 shrink-0 text-fg-4" />
              <span>
                cd /opt/wyzi-server/portal/backend
                <br />
                .venv/bin/python -m app.admin set-password
              </span>
            </div>
            <Button className="mt-4 w-full justify-center" variant="secondary" onClick={() => location.reload()}>
              I have set it — reload
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6">
            <label htmlFor="pw" className="text-xs text-fg-3">
              Admin password
            </label>
            <div className="mt-1.5 flex h-9 items-center gap-2 rounded-md bg-bg-0/60 px-3 shadow-[inset_0_0_0_1px_var(--color-line-3)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--color-line-4),0_0_0_3px_rgba(122,162,217,0.14)]">
              <Lock size={13} className="shrink-0 text-fg-4" />
              <input
                id="pw"
                ref={input}
                type="password"
                autoComplete="current-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-4"
                placeholder="••••••••••"
              />
            </div>
            {error && <div className="mt-2 text-xs text-[#ff8784]">{error}</div>}
            <Button type="submit" variant="primary" className="mt-4 w-full justify-center" loading={busy} disabled={!pw}>
              Sign in
            </Button>
            <p className="mt-4 text-2xs leading-relaxed text-fg-4">LAN-only portal · session stays signed in for up to 30 days on this browser.</p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
