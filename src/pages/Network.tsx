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
import { copyAddress, copyText, PUBLIC_HOST, usePublicAddress } from './shared';
import { IS_LIVE } from '../lib/mode';
import type { PlayitTunnel } from '../lib/types';

export function NetworkPage() {
  const playit = useApp((s) => s.playit);
  const servers = useApp((s) => s.servers);
  const sys = useApp((s) => s.sys);
  const host = useApp((s) => s.host);
  const address = usePublicAddress();
  const [copied, setCopied] = useState(false);
  const ok = playit.status === 'connected';
  const badge = ok ? 'Connected' : playit.status === 'reconnecting' ? 'Reconnecting' : playit.agent === 'not_paired' ? 'Not paired' : playit.status === 'offline' ? 'Offline' : 'Unknown';
  const iface = host?.interfaces.find((i) => i.name === host.defaultIface) ?? host?.interfaces[0];
  const lanIp = iface?.addresses[0]?.split('/')[0];
  const others = host?.interfaces.filter((i) => i !== iface) ?? [];
  const target = servers.find((x) => `127.0.0.1:${x.port}` === playit.localTarget && x.status !== 'undeployed');
  const totals = sys.netTotals ? sys.netTotals.rx + sys.netTotals.tx : null;

  const doCopy = async () => {
    await copyAddress(address);
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
                <Badge tone={ok ? 'mint' : playit.status === 'offline' ? 'red' : 'amber'} dot>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={badge} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                      {badge}
                    </motion.span>
                  </AnimatePresence>
                </Badge>
                {playit.stale && <Badge tone="amber">Status stale</Badge>}
              </div>
              <div className="text-xs text-fg-3">
                playit {playit.version ?? '—'} · systemd ({playit.service ?? 'unknown'}) · running since {playit.since}
                {IS_LIVE && playit.updatedAt ? ` · checked ${new Date(playit.updatedAt * 1000).toTimeString().slice(0, 5)}` : ''}
              </div>
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
            <Link ok={ok} label={ok && playit.latency != null ? `${playit.latency} ms` : '—'} />
            <Node icon={Globe} label="Public endpoint" title={address ?? 'No address reported'} mono highlight sub={playit.publicAddress && playit.publicAddress !== address ? `${playit.publicAddress} · SRV record` : 'Playit edge'} onClick={doCopy} />
            <Link ok={ok && playit.tunnel !== 'idle'} label="Tunnel" />
            <Node
              icon={ServerIcon}
              label="Local target"
              title={playit.localTarget ?? '—'}
              mono
              sub={`${target ? `${target.name} · ${target.status}` : 'No instance on this port'} · ${(host?.hostname ?? 'server').toUpperCase()}`}
            />
          </div>

          <div className="grid grid-cols-2 border-t border-line md:grid-cols-4 md:divide-x md:divide-line">
            <Fig label="Protocol" value="Minecraft Java / TCP" />
            <Fig label="Edge RTT" value={ok && playit.latency != null ? `${playit.latency} ms` : '—'} tone={ok ? undefined : 'text-fg-4'} />
            <Fig label="Players online" value={`${servers.reduce((a, s) => a + s.players.length, 0)}`} />
            <Fig label={IS_LIVE ? 'Transferred since boot' : 'Transferred today'} value={IS_LIVE ? (totals != null ? `${totals.toFixed(1)} GB` : '—') : '3.8 GB'} />
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
            <KV k="Interface" v={iface ? `${iface.name} · ${iface.kind === 'wifi' ? 'Wi-Fi' : 'Ethernet'}` : '—'} mono />
            <KV k="Address" v={iface?.addresses[0] ?? '—'} mono />
            <KV k="Gateway" v={host?.gateway ?? '—'} mono />
            <KV k="Link" v={iface ? (iface.speedMbps ? `${iface.speedMbps} Mbps` : iface.kind === 'wifi' ? 'Wireless' : iface.up ? 'Up' : 'Down') : '—'} />
            <KV k="DNS" v={host?.dns.slice(0, 2).join(', ') || '—'} mono />
            <KV k="Portal" v={lanIp ? `${lanIp}:${host?.portalPort ?? 8080}` : '—'} mono />
            {others.map((o) => (
              <KV key={o.name} k={o.name} v={o.up ? o.addresses[0] ?? 'up' : o.kind === 'ethernet' && !o.carrier ? 'Ethernet · no cable' : 'down'} mono />
            ))}
            <KV
              k="Firewall"
              v={
                <Tooltip content="UFW: SSH and portal allowed from 192.168.1.0/24 only. Minecraft is reached through Playit.">
                  <span className="flex items-center gap-1.5"><Dot tone="mint" size={6} />UFW · LAN only</span>
                </Tooltip>
              }
            />
          </Panel>
        </Reveal>

        <Reveal i={4} className="col-span-12">
          {IS_LIVE ? (
            <Panel title="Tunnels" meta="Configured at playit.gg · Minecraft only" flush>
              {(playit.tunnels ?? []).length === 0 && <div className="px-4 py-4 text-sm text-fg-4">No tunnels reported by the agent</div>}
              {(playit.tunnels ?? []).map((t) => (
                <LiveTunnelRow key={(t.publicAddress ?? '') + t.localTarget} t={t} server={servers.find((x) => x.port === t.localPort && x.status !== 'undeployed')} />
              ))}
            </Panel>
          ) : (
            <Panel title="Tunnels" meta="One TCP tunnel per server" flush>
              {servers.map((s) => (
                <TunnelRow key={s.id} name={s.name} id={s.id} port={s.port} tunnelPort={s.tunnelPort} status={s.status} ok={ok} wake={s.wakeOnConnect} />
              ))}
            </Panel>
          )}
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

function LiveTunnelRow({ t, server }: { t: PlayitTunnel; server?: import('../lib/types').Server }) {
  const [copied, setCopied] = useState(false);
  const addr = t.copyAddress ?? t.publicAddress;
  const tone = t.state === 'online' ? 'mint' : t.state === 'idle' || t.state === 'sleeping' ? 'blue' : t.state === 'disabled' ? 'neutral' : 'amber';
  const label = { online: 'Forwarding', idle: 'Idle · server stopped', sleeping: 'Wake proxy · sleeping', offline: 'Agent offline', disabled: 'Disabled' }[t.state];
  return (
    <div className="grid grid-cols-[minmax(160px,1fr)_minmax(200px,1.4fr)_minmax(110px,0.6fr)_100px_auto] items-center gap-4 border-b border-line px-4 py-3 last:border-0 hover:bg-white/[0.015] max-lg:grid-cols-[1fr_auto]">
      <button onClick={() => server && navigate(`/servers/${server.id}`)} className="flex min-w-0 items-center gap-2.5 text-left">
        {server ? <StatusDot status={server.status} /> : <Dot tone="neutral" size={7} />}
        <span className="truncate text-sm font-medium">{server?.name ?? 'No instance on this port'}</span>
      </button>
      <div className="flex min-w-0 items-center gap-2 font-mono text-[11.5px] text-fg-2 max-lg:hidden">
        <span className="truncate">{t.publicAddress ?? '—'}</span>
        <ArrowRight size={11} className="shrink-0 text-fg-4" />
        <span className="shrink-0 text-fg-3">{t.localTarget}</span>
      </div>
      <div className="max-lg:hidden">
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="flex justify-end max-lg:hidden">
        {addr && (
          <Tooltip content={copied ? 'Copied' : `Copy ${addr}`}>
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
      <Tooltip content="Tunnels are created and removed in your playit.gg dashboard. Never add tunnels for SSH (22) or the portal (8080).">
        <span className="text-2xs text-fg-4">playit.gg</span>
      </Tooltip>
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
