import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ArrowLeft,
  BarChart3,
  Copy,
  FolderTree,
  LayoutDashboard,
  Settings2,
  Terminal,
  Users,
} from 'lucide-react';
import { navigate } from '../../lib/router';
import { useApp } from '../../lib/store';
import { cx, fmtUptime } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Num, Sparkline } from '../../ui/Charts';
import { Tabs } from '../../ui/Controls';
import { Empty, Monogram, Reveal } from '../../ui/Layout';
import { StatusBadge } from '../../ui/Status';
import { Tooltip } from '../../ui/Tooltip';
import { copyAddress, monogramTone, MoreMenu, PowerActions, PUBLIC_HOST, useServer } from '../shared';
import { ConsoleView } from './Console';
import { BackupsTab, FilesTab, OverviewTab, PerformanceTab, PlayersTab, SettingsTab } from './Tabs';

export function ServerDetail({ id, tab }: { id: string; tab: string }) {
  const s = useServer(id);
  const backups = useApp((st) => st.backups);
  if (!s)
    return (
      <div className="surface rounded-xl">
        <Empty
          icon={FolderTree}
          title="Server not found"
          desc={`There is no instance called “${id}”.`}
          action={
            <Button icon={ArrowLeft} onClick={() => navigate('/servers')}>
              Back to servers
            </Button>
          }
        />
      </div>
    );

  const live = s.status === 'running';
  const tabs = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    { value: 'console', label: 'Console', icon: Terminal },
    { value: 'players', label: 'Players', icon: Users, count: live ? s.players.length : undefined },
    { value: 'files', label: 'Files', icon: FolderTree },
    { value: 'performance', label: 'Performance', icon: BarChart3 },
    { value: 'backups', label: 'Backups', icon: Archive, count: backups.filter((b) => b.serverId === s.id).length },
    { value: 'settings', label: 'Settings', icon: Settings2 },
  ];

  return (
    <div>
      {/* header */}
      <Reveal className="flex flex-wrap items-center gap-4 pb-5">
        <Monogram name={s.name} size={46} tone={monogramTone(s)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-[24px] leading-7 font-semibold tracking-[-0.02em]">{s.name}</h1>
            <StatusBadge status={s.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 text-xs text-fg-3">
            <span>{s.loader}</span>
            <span className="text-fg-4">·</span>
            <span>Minecraft {s.mc}</span>
            {s.mods > 0 && (
              <>
                <span className="text-fg-4">·</span>
                <span className="num">{s.mods} mods</span>
              </>
            )}
            <span className="text-fg-4">·</span>
            <span className="font-mono text-[11px]">127.0.0.1:{s.port}</span>
            {s.tunnelPort > 0 && (
              <>
                <span className="text-fg-4">·</span>
                <Tooltip content="Copy public address">
                  <button onClick={() => copyAddress(`${PUBLIC_HOST}:${s.tunnelPort}`)} className="group flex items-center gap-1 font-mono text-[11px] text-fg-3 transition-colors hover:text-fg">
                    {PUBLIC_HOST}:{s.tunnelPort}
                    <Copy size={10} className="opacity-50 group-hover:opacity-100" />
                  </button>
                </Tooltip>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {tab !== 'console' && (
            <Button variant="ghost" icon={Terminal} onClick={() => navigate(`/servers/${s.id}/console`)}>
              Console
            </Button>
          )}
          <PowerActions s={s} size="md" />
          <MoreMenu s={s} />
        </div>
      </Reveal>

      {/* metrics strip */}
      <Reveal i={1}>
        <section className="surface grid grid-cols-3 overflow-hidden rounded-xl lg:grid-cols-6 lg:divide-x lg:divide-line max-lg:[&>*]:border-b max-lg:[&>*]:border-line">
          <Metric label="TPS" dim={!live} value={live ? <Num value={s.tps} format={(v) => v.toFixed(2)} /> : '—'} tone={live && s.tps < 18 ? 'text-amber' : undefined} spark={<Sparkline data={s.hist.tps.slice(-30)} min={15} max={20.4} width={84} height={18} fill={false} color="slate" />} />
          <Metric label="MSPT" dim={!live} value={live ? <Num value={s.mspt} /> : '—'} unit="ms" spark={<Sparkline data={s.hist.mspt.slice(-30)} max={60} width={84} height={18} color="blue" fill={false} />} />
          <Metric label="Players" dim={!live} value={live ? s.players.length : '—'} unit={`/ ${s.maxPlayers}`} spark={<Sparkline data={s.hist.players.slice(-30)} max={s.maxPlayers} width={84} height={18} color="grey" fill={false} />} />
          <Metric label="RAM" dim={s.ramUsed === 0} value={<Num value={s.ramUsed} format={(v) => v.toFixed(1)} />} unit={`/ ${s.ramAlloc} GB`} spark={<Sparkline data={s.hist.ram.slice(-30)} max={s.ramAlloc} width={84} height={18} fill color="slate" />} />
          <Metric label="CPU" dim={!live && s.status !== 'starting'} value={<Num value={s.cpu} />} unit="%" spark={<Sparkline data={s.hist.cpu.slice(-30)} max={100} width={84} height={18} color="grey" fill={false} />} />
          <Metric label={live ? 'Uptime' : 'Last online'} dim={!live} value={live ? fmtUptime(s.uptime) : s.lastOnline} small={!live} />
        </section>
      </Reveal>

      {/* tabs */}
      <Reveal i={2} className="sticky top-0 z-10 -mx-6 mt-4 border-b border-line bg-bg-1/85 px-6 backdrop-blur-md max-md:-mx-4 max-md:px-4">
        <Tabs value={tab} tabs={tabs} onChange={(t) => navigate(`/servers/${s.id}${t === 'overview' ? '' : '/' + t}`)} />
      </Reveal>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.07 } }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="pt-5"
        >
          {tab === 'overview' && <OverviewTab s={s} />}
          {tab === 'console' && <ConsoleView s={s} />}
          {tab === 'players' && <PlayersTab s={s} />}
          {tab === 'files' && <FilesTab s={s} />}
          {tab === 'performance' && <PerformanceTab s={s} />}
          {tab === 'backups' && <BackupsTab s={s} />}
          {tab === 'settings' && <SettingsTab s={s} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  spark,
  dim,
  tone,
  small,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  spark?: React.ReactNode;
  dim?: boolean;
  tone?: string;
  small?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <div className="text-xs text-fg-3">{label}</div>
      <div className={cx('num mt-1.5 flex items-baseline gap-1 font-semibold tracking-[-0.03em]', small ? 'text-[15px] leading-[26px]' : 'text-[24px] leading-[26px]', dim ? 'text-fg-4' : tone ?? 'text-fg')}>
        {value}
        {unit && !dim && <span className="text-xs font-normal tracking-normal text-fg-3">{unit}</span>}
      </div>
      <div className={cx('mt-2 h-[18px] transition-opacity', dim ? 'opacity-25' : 'opacity-100')}>{spark}</div>
    </div>
  );
}
