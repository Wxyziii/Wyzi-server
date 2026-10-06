import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, Copy, Cable, Globe, Laptop, Lock, Radio, RefreshCw, Server as ServerIcon } from 'lucide-react';
import { navigate } from '../lib/router';
import { restartTunnel, useApp } from '../lib/store';
import { cx } from '../lib/format';
import { Button } from '../ui/Button';
import { AreaChart } from '../ui/Charts';
import { Switch } from '../ui/Controls';
import { KV, PageHeader, Panel, Reveal } from '../ui/Layout';
import { Badge, Dot, StatusDot } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';
import { Spinner } from '../ui/Spinner';
import { copyAddress, copyText, PUBLIC_ADDRESS, PUBLIC_HOST } from './shared';

export function NetworkPage() {
  const playit = useApp((s) => s.playit);
  const servers = useApp((s) => s.servers);
  const sys = useApp((s) => s.sys);
  const [copied, setCopied] = useState(false);
  const ok = playit.status === 'connected';

  const doCopy = async () => {
    await copyAddress();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div>
      <Reveal>
        <PageHeader title="Network">
          <span>Public access via Playit.gg</span>
          <span className="h-3 w-px bg-line-3" />
          <span className="flex items-center gap-1.5">
            <Lock size={11} /> Portal bound to LAN only
          </span>
        </PageHeader>
      </Reveal>

      {/* Agent hero */}
      <Reveal i={1}>
        <section className="surface relative overflow-hidden rounded-xl">
          <div className={cx('pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b transition-colors duration-700', ok ? 'from-white/[0.015]' : 'from-amber/[0.05]', 'to-transparent')} />
          <div className="relative flex flex-wrap items-center gap-4 px-5 pt-5">
            <div className={cx('flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-500', ok ? 'bg-s-4 text-fg-2 shadow-[inset_0_0_0_1px_var(--color-line-3),inset_0_1px_0_rgba(255,255,255,0.05)]' : 'bg-amber/[0.08] text-amber shadow-[inset_0_0_0_1px_rgba(229,173,79,0.25)]')}>
              {ok ? <Radio size={18} strokeWidth={1.8} /> : <Spinner size={16} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Playit Agent</h2>
                <Badge tone={ok ? 'mint' : 'amber'} dot>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={playit.status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                      {ok ? 'Connected' : 'Reconnecting'}
                    </motion.span>
                  </AnimatePresence>
                </Badge>
              </div>
              <div className="text-xs text-fg-3">playit-agent 0.15.13 · systemd · relay eu-west-2 · connected since {playit.since}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" icon={copied ? Check : Copy} onClick={doCopy} className={copied ? 'text-mint' : ''}>
                {copied ? 'Copied' : 'Copy Address'}
              </Button>
              <Button variant="outline" icon={RefreshCw} loading={!ok} onClick={restartTunnel}>
                {ok ? 'Restart Tunnel' : 'Restarting'}
              </Button>
            </div>
          </div>

          {/* route diagram */}
          <div className="relative mt-6 grid grid-cols-1 items-stretch gap-3 px-5 pb-5 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <Node icon={Laptop} label="Players" title="Minecraft clients" sub="Java Edition · any network" />
            <Link ok={ok} label={ok ? `${playit.latency} ms` : '—'} />
            <Node icon={Globe} label="Public endpoint" title={PUBLIC_ADDRESS} mono highlight sub="Playit edge · eu-west-2" onClick={doCopy} />
            <Link ok={ok} label="Tunnel" />
            <Node icon={ServerIcon} label="Local target" title="127.0.0.1:25565" mono sub="Prominence II · WYZI-SERVER" />
          </div>

          <div className="grid grid-cols-2 border-t border-line md:grid-cols-4 md:divide-x md:divide-line">
            <Fig label="Protocol" value="Minecraft Java / TCP" />
            <Fig label="Latency" value={ok ? `${playit.latency} ms` : '—'} tone={ok ? undefined : 'text-fg-4'} />
            <Fig label="Connections" value={`${servers.reduce((a, s) => a + s.players.length, 0)} active`} />
            <Fig label="Transferred today" value="3.8 GB" />
          </div>
        </section>
      </Reveal>

      <div className="mt-4 grid grid-cols-12 gap-4">
        <Reveal i={2} className="col-span-12 xl:col-span-8">
          <Panel
            title="Throughput"
            meta="MB/s · live"
            actions={
              <div className="flex items-center gap-3 text-2xs text-fg-3">
                <span className="flex items-center gap-1.5"><ArrowUpRight size={11} className="text-blue" />Egress</span>
                <span className="flex items-center gap-1.5"><ArrowDownLeft size={11} className="text-slate" />Ingress</span>
              </div>
            }
          >
            <AreaChart
              height={210}
              series={[
                { data: sys.hist.netOut, color: 'blue', label: 'Egress' },
                { data: sys.hist.netIn, color: 'slate', label: 'Ingress', fill: false },
              ]}
              format={(v) => v.toFixed(1)}
            />
          </Panel>
        </Reveal>
        <Reveal i={3} className="col-span-12 xl:col-span-4">
          <Panel title="Local interface" icon={Cable} bodyClass="px-4 py-1.5" className="h-full">
            <KV k="Interface" v="enp3s0" mono />
            <KV k="Address" v="192.168.1.40/24" mono />
            <KV k="Gateway" v="192.168.1.1" mono />
            <KV k="Link" v="1 Gbps · full duplex" />
            <KV k="DNS" v="1.1.1.1, 9.9.9.9" mono />
            <KV k="Portal" v="192.168.1.40:8080" mono />
            <KV k="Firewall" v={<span className="flex items-center gap-1.5"><Dot tone="mint" size={6} />nftables · LAN only</span>} />
          </Panel>
        </Reveal>

        <Reveal i={4} className="col-span-12">
          <Panel title="Tunnels" meta="One TCP tunnel per server" flush>
            {servers.map((s) => (
              <TunnelRow key={s.id} name={s.name} id={s.id} port={s.port} tunnelPort={s.tunnelPort} status={s.status} ok={ok} wake={s.wakeOnConnect} />
            ))}
          </Panel>
        </Reveal>
      </div>
    </div>
  );
}

function TunnelRow({ name, id, port, tunnelPort, status, ok, wake }: { name: string; id: string; port: number; tunnelPort: number; status: import('../lib/store').ServerStatus; ok: boolean; wake: boolean }) {
  const [enabled, setEnabled] = useState(tunnelPort > 0);
  const [copied, setCopied] = useState(false);
  const addr = `${PUBLIC_HOST}:${tunnelPort}`;
  const routing = status === 'running' ? 'Forwarding' : status === 'sleeping' && wake ? 'Wake proxy' : status === 'starting' ? 'Waiting' : 'Idle';
  return (
    <div className="grid grid-cols-[minmax(160px,1fr)_minmax(200px,1.4fr)_minmax(110px,0.6fr)_100px_auto] items-center gap-4 border-b border-line px-4 py-3 last:border-0 hover:bg-white/[0.015] max-lg:grid-cols-[1fr_auto]">
      <button onClick={() => navigate(`/servers/${id}`)} className="flex min-w-0 items-center gap-2.5 text-left">
        <StatusDot status={status} />
        <span className="truncate text-sm font-medium hover:underline hover:decoration-line-4 hover:underline-offset-4">{name}</span>
      </button>
      <div className={cx('flex min-w-0 items-center gap-2 font-mono text-[11.5px] max-lg:hidden', enabled ? 'text-fg-2' : 'text-fg-4 line-through')}>
        <span className="truncate">{tunnelPort ? addr : 'not provisioned'}</span>
        <ArrowRight size={11} className="shrink-0 text-fg-4" />
        <span className="shrink-0 text-fg-3">:{port}</span>
      </div>
      <div className="max-lg:hidden">
        <Badge tone={!enabled ? 'neutral' : !ok ? 'amber' : routing === 'Forwarding' ? 'mint' : routing === 'Wake proxy' ? 'blue' : 'neutral'}>{!enabled ? 'Disabled' : !ok ? 'Reconnecting' : routing}</Badge>
      </div>
      <div className="flex justify-end max-lg:hidden">
        {tunnelPort > 0 && (
          <Tooltip content={copied ? 'Copied' : 'Copy address'}>
            <button
              onClick={async () => {
                await copyText(addr);
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              }}
              className="flex h-6 items-center gap-1.5 rounded-[5px] px-2 text-xs text-fg-3 transition-colors hover:bg-white/5 hover:text-fg"
            >
              {copied ? <Check size={12} className="text-mint" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </Tooltip>
        )}
      </div>
      <Switch size="sm" checked={enabled} disabled={!tunnelPort} onChange={setEnabled} />
    </div>
  );
}

function Node({ icon: Icon, label, title, sub, mono, highlight, onClick }: { icon: typeof Globe; label: string; title: string; sub: string; mono?: boolean; highlight?: boolean; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div';
  return (
    <C
      onClick={onClick}
      className={cx(
        'group min-w-0 rounded-lg border px-3.5 py-3 text-left transition-colors',
        highlight ? 'border-line-3 bg-s-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-line-4' : 'border-line-2 bg-bg-1/60',
      )}
    >
      <div className="flex items-center gap-1.5 text-2xs text-fg-4">
        <Icon size={11} />
        {label}
        {onClick && <Copy size={10} className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      <div className={cx('mt-1.5 truncate text-fg', mono ? 'font-mono text-[12.5px]' : 'text-sm font-medium')}>{title}</div>
      <div className="mt-0.5 truncate text-2xs text-fg-3">{sub}</div>
    </C>
  );
}

function Link({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="relative flex items-center justify-center md:w-24">
      <div className="relative h-px w-full overflow-hidden bg-line-3 max-md:h-6 max-md:w-px">
        {ok && (
          <motion.div
            className="absolute inset-y-0 w-8 bg-gradient-to-r from-transparent via-blue/50 to-transparent max-md:hidden"
            animate={{ x: ['-40px', '110px'] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>
      <span className={cx('num absolute rounded-full border border-line-2 bg-s-1 px-1.5 text-2xs transition-colors', ok ? 'text-fg-3' : 'text-amber')}>{label}</span>
    </div>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-5 py-3 max-md:border-b max-md:border-line">
      <div className="text-2xs text-fg-4">{label}</div>
      <div className={cx('num mt-0.5 text-sm font-medium', tone ?? 'text-fg')}>{value}</div>
    </div>
  );
}
