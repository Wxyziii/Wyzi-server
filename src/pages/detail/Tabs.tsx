import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ArrowUpRight,
  Ban,
  ChevronRight,
  Crown,
  FileCode2,
  FileText,
  Folder,
  FolderUp,
  Info,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Terminal,
  Trash2,
  Upload,
  UserMinus,
  Users,
  Zap,
} from 'lucide-react';
import { navigate } from '../../lib/router';
import {
  BACKUP_STEPS,
  createBackup,
  patchServerSettings,
  safelyAvailable,
  toast,
  useApp,
  type ConsoleLine,
  type Server,
} from '../../lib/store';
import { cx } from '../../lib/format';
import { Button, IconButton } from '../../ui/Button';
import { AreaChart, Meter } from '../../ui/Charts';
import { Segmented, Select, Slider, Stepper, Switch, TextInput } from '../../ui/Controls';
import { Empty, KV, Panel } from '../../ui/Layout';
import { Dropdown, useContextMenu } from '../../ui/Menu';
import { Badge } from '../../ui/Status';
import { Tooltip } from '../../ui/Tooltip';
import { StartupSequence } from '../shared';

const EMPTY: ConsoleLine[] = [];

/* ═════════════════════ OVERVIEW ═════════════════════ */
export function OverviewTab({ s }: { s: Server }) {
  const lines = useApp((st) => st.consoles[s.id] ?? EMPTY);
  const backups = useApp((st) => st.backups);
  const [metric, setMetric] = useState<'tps' | 'mspt' | 'ram'>('mspt');
  const live = s.status === 'running';
  const mine = backups.filter((b) => b.serverId === s.id).slice(0, 3);

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 space-y-4 xl:col-span-8">
        <AnimatePresence initial={false}>
          {s.status === 'starting' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Panel title="Starting up" icon={Zap} meta={`Step ${Math.min(6, s.startStep + 1)} of 6`} className="border-amber/20">
                <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                  <StartupSequence s={s} layout="list" />
                  <div className="rounded-lg border border-line bg-[#070708] p-3 font-mono text-[11.5px] leading-[18px]">
                    {lines.slice(-7).map((l) => (
                      <motion.div key={l.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className={cx('truncate', l.level === 'sys' ? 'text-blue' : 'text-fg-2')}>
                        <span className="text-fg-4">{l.t} </span>
                        {l.text}
                      </motion.div>
                    ))}
                  </div>
                </div>
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>

        <Panel
          title="Performance"
          meta="Live · last 90 s"
          actions={
            <Segmented
              size="xs"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'mspt', label: 'MSPT' },
                { value: 'tps', label: 'TPS' },
                { value: 'ram', label: 'Heap' },
              ]}
            />
          }
        >
          {live || s.status === 'starting' || s.hist.cpu.some((v) => v > 0) ? (
            <AreaChart
              key={metric}
              height={210}
              series={[
                metric === 'tps'
                  ? { data: s.hist.tps, color: 'slate', label: 'TPS' }
                  : metric === 'mspt'
                    ? { data: s.hist.mspt, color: 'blue', label: 'MSPT' }
                    : { data: s.hist.ram, color: 'slate', label: 'Heap used' },
              ]}
              max={metric === 'tps' ? 20 : metric === 'mspt' ? 60 : s.ramAlloc}
              format={(v) => (metric === 'ram' ? `${v.toFixed(1)}G` : metric === 'mspt' ? `${v.toFixed(0)}ms` : v.toFixed(1))}
              threshold={metric === 'mspt' ? { value: 50, label: 'Lag threshold · 50 ms', color: 'red' } : metric === 'tps' ? { value: 18, label: 'Degraded below 18', color: 'amber' } : { value: s.ramAlloc * 0.9, label: '90% of heap' }}
            />
          ) : (
            <Empty icon={Zap} title="No performance data" desc={`${s.name} is ${s.status}. Start it to begin collecting tick metrics.`} />
          )}
        </Panel>

        <Panel
          title="Console"
          icon={Terminal}
          meta="latest.log"
          flush
          actions={
            <Button size="xs" variant="ghost" iconRight={ArrowUpRight} onClick={() => navigate(`/servers/${s.id}/console`)}>
              Open console
            </Button>
          }
        >
          <div className="bg-[#070708] px-4 py-3 font-mono text-[11.5px] leading-[19px]">
            {lines.length === 0 && <div className="py-6 text-center font-sans text-sm text-fg-4">No output yet</div>}
            {lines.slice(-9).map((l) => (
              <div key={l.id} className="flex gap-2 truncate">
                <span className="text-fg-4">{l.t}</span>
                <span className={cx('truncate', l.level === 'warn' ? 'text-amber' : l.level === 'error' ? 'text-red' : l.level === 'cmd' ? 'text-accent' : l.level === 'sys' ? 'text-blue' : 'text-fg-2')}>{l.text}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="col-span-12 space-y-4 xl:col-span-4">
        <Panel title="Online now" icon={Users} meta={live ? `${s.players.length} of ${s.maxPlayers}` : undefined} bodyClass="px-2 py-2">
          {live && s.players.length > 0 ? (
            s.players.map((p) => (
              <div key={p.name} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.025]">
                <Avatar name={p.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm">
                    {p.name}
                    {p.op && <Crown size={11} className="text-amber" />}
                  </div>
                  <div className="text-2xs text-fg-4">
                    {p.dimension} · since {p.joined}
                  </div>
                </div>
                <span className={cx('num text-xs', p.ping > 80 ? 'text-amber' : 'text-fg-3')}>{p.ping} ms</span>
              </div>
            ))
          ) : (
            <div className="px-2 py-5 text-center text-sm text-fg-4">{live ? 'Nobody is online' : 'Server is not running'}</div>
          )}
        </Panel>

        <Panel title="Instance" icon={Info} bodyClass="px-4 py-1.5">
          <KV k="Loader" v={s.loader} />
          <KV k="Minecraft" v={s.mc} />
          <KV k="Java runtime" v={s.java} />
          <KV k="Heap" v={`-Xms${s.ramAlloc}G -Xmx${s.ramAlloc}G`} mono />
          <KV k="Directory" v={`/srv/minecraft/${s.id}`} mono />
          <KV k="World size" v={s.worldSize} />
          <KV k="Disk usage" v={`${s.diskSize} GB on SSD`} />
          <KV k="Sleep policy" v={s.wakeOnConnect ? 'Wake on connect' : s.autoStop ? 'Stop when idle' : 'Always on'} />
        </Panel>

        <Panel
          title="Recent backups"
          icon={Archive}
          bodyClass="px-4 py-1.5"
          actions={
            <Button size="xs" variant="ghost" onClick={() => navigate(`/servers/${s.id}/backups`)}>
              View all
            </Button>
          }
        >
          {mine.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-[7px] text-sm">
              <span className={cx('h-1.5 w-1.5 rounded-full', b.status === 'success' ? 'bg-mint' : 'bg-red')} />
              <span className="flex-1 text-fg-2">{b.when}</span>
              <span className="text-xs text-fg-4">{b.type}</span>
              <span className="num w-14 text-right text-xs">{b.status === 'success' ? `${b.size} GB` : 'Failed'}</span>
            </div>
          ))}
          {mine.length === 0 && <div className="py-4 text-center text-sm text-fg-4">No backups yet</div>}
        </Panel>
      </div>
    </div>
  );
}

/* ═════════════════════ PLAYERS ═════════════════════ */
const AV = ['#3a4458', '#3b4f6e', '#4d4434', '#47415e', '#36464d', '#4e3a3a'];
function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  const c = AV[name.charCodeAt(0) % AV.length];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[6px] font-semibold text-white/85"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(180deg, ${c}, ${c}cc)`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.12)' }}
    >
      {name[0].toUpperCase()}
    </span>
  );
}

const offlinePlayers = [
  { name: 'Ferrowind', lastSeen: 'Yesterday, 22:14', playtime: '41h 12m' },
  { name: 'lumen_ox', lastSeen: '3 days ago', playtime: '18h 03m' },
  { name: 'Tamsin', lastSeen: 'Sep 28', playtime: '6h 47m' },
];

export function PlayersTab({ s }: { s: Server }) {
  const live = s.status === 'running';
  const playerMenu = (name: string) => [
    { heading: name },
    { label: 'Send message', icon: MessageSquare, onSelect: () => toast(`Message sent to ${name}`, 'success') },
    { label: 'Teleport to spawn', icon: RotateCcw, onSelect: () => toast(`${name} teleported to spawn`, 'success') },
    { label: 'Toggle operator', icon: Crown, onSelect: () => toast(`Operator status changed for ${name}`, 'info') },
    { separator: true },
    { label: 'Kick', icon: UserMinus, danger: true, onSelect: () => toast(`${name} was kicked`, 'warn', 'Prototype — nobody was actually kicked') },
    { label: 'Ban…', icon: Ban, danger: true, onSelect: () => toast('Bans are disabled in the prototype', 'warn') },
  ];
  return (
    <div className="grid grid-cols-12 gap-4">
      <Panel
        className="col-span-12 xl:col-span-8"
        title="Online players"
        icon={Users}
        meta={live ? `${s.players.length} / ${s.maxPlayers}` : 'Server offline'}
        flush
      >
        {live && s.players.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs text-fg-4">
                <th className="px-4 py-2 font-medium">Player</th>
                <th className="px-4 py-2 font-medium">Dimension</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 text-right font-medium">Ping</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {s.players.map((p) => (
                <PlayerRow key={p.name} menu={playerMenu(p.name)}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.name} />
                      <span className="font-medium">{p.name}</span>
                      {p.op && <Badge tone="amber">OP</Badge>}
                    </div>
                  </td>
                  <td className="px-4 text-fg-2">{p.dimension}</td>
                  <td className="num px-4 text-fg-3">{p.joined}</td>
                  <td className="px-4 text-right">
                    <span className="num inline-flex items-center gap-1.5 text-fg-2">
                      <PingBars ping={p.ping} />
                      {p.ping} ms
                    </span>
                  </td>
                  <td className="pr-3 text-right">
                    <Dropdown items={playerMenu(p.name)} trigger={({ onClick }) => <IconButton icon={MoreHorizontal} label="Player actions" size="xs" onClick={onClick} />} />
                  </td>
                </PlayerRow>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon={Users} title={live ? 'Nobody is online' : `${s.name} is ${s.status}`} desc={live ? 'Players will appear here as they join.' : 'Start the server to see who is playing.'} />
        )}
      </Panel>

      <Panel className="col-span-12 xl:col-span-4" title="Whitelist" icon={Shield} meta={`${offlinePlayers.length + s.players.length} players`} bodyClass="px-2 py-2"
        actions={<Button size="xs" variant="ghost" icon={Plus} onClick={() => toast('Player added to whitelist', 'success', 'Prototype')}>Add</Button>}>
        {offlinePlayers.map((p) => (
          <div key={p.name} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.025]">
            <span className="opacity-60">
              <Avatar name={p.name} size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-fg-2">{p.name}</div>
              <div className="text-2xs text-fg-4">Last seen {p.lastSeen}</div>
            </div>
            <span className="num text-xs text-fg-4">{p.playtime}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function PlayerRow({ children, menu }: { children: React.ReactNode; menu: Parameters<typeof useContextMenu>[0] }) {
  const onCtx = useContextMenu(menu);
  return (
    <tr onContextMenu={onCtx} className="border-b border-line transition-colors last:border-0 hover:bg-white/[0.015]">
      {children}
    </tr>
  );
}

function PingBars({ ping }: { ping: number }) {
  const n = ping < 30 ? 4 : ping < 60 ? 3 : ping < 120 ? 2 : 1;
  return (
    <span className="flex items-end gap-[2px]">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={cx('w-[3px] rounded-[1px]', i < n ? (n <= 2 ? 'bg-amber' : 'bg-fg-2') : 'bg-white/10')} style={{ height: 4 + i * 2 }} />
      ))}
    </span>
  );
}

/* ═════════════════════ FILES ═════════════════════ */
type Node = { name: string; dir?: boolean; size?: string; modified: string; children?: Node[] };
const fileTree = (s: Server): Node[] => [
  { name: 'config', dir: true, modified: 'Oct 3, 21:40', children: [
    { name: 'forge-common.toml', size: '2 KB', modified: 'Oct 3' },
    { name: 'ftbchunks-world.snbt', size: '4 KB', modified: 'Oct 1' },
    { name: 'spark', dir: true, modified: 'Sep 30', children: [] },
  ] },
  { name: 'defaultconfigs', dir: true, modified: 'Sep 30, 18:02', children: [] },
  { name: 'kubejs', dir: true, modified: 'Oct 3, 21:44', children: [] },
  { name: 'logs', dir: true, modified: 'Today, 14:21', children: [
    { name: 'latest.log', size: '412 KB', modified: 'Today, 15:12' },
    { name: 'debug.log', size: '8.1 MB', modified: 'Today, 15:12' },
    { name: '2026-10-05-1.log.gz', size: '96 KB', modified: 'Yesterday' },
  ] },
  { name: 'mods', dir: true, modified: 'Oct 3, 21:39', size: `${s.mods} items`, children: [
    { name: 'create-1.20.1-0.5.1.f.jar', size: '14.2 MB', modified: 'Oct 3' },
    { name: 'ars_nouveau-1.20.1-4.12.4.jar', size: '9.8 MB', modified: 'Oct 3' },
    { name: 'L_Enders_Cataclysm-2.05.jar', size: '21.4 MB', modified: 'Oct 3' },
    { name: 'majruszlibrary-1.20.1-7.1.6.jar', size: '1.1 MB', modified: 'Oct 3' },
  ] },
  { name: 'world', dir: true, modified: 'Today, 15:04', size: s.worldSize, children: [
    { name: 'region', dir: true, modified: 'Today', children: [] },
    { name: 'playerdata', dir: true, modified: 'Today', children: [] },
    { name: 'level.dat', size: '6 KB', modified: 'Today, 15:04' },
  ] },
  { name: 'eula.txt', size: '158 B', modified: 'Sep 30' },
  { name: 'ops.json', size: '214 B', modified: 'Sep 30' },
  { name: 'server.properties', size: '1.4 KB', modified: 'Oct 3, 21:47' },
  { name: 'user_jvm_args.txt', size: '312 B', modified: 'Oct 3, 21:47' },
  { name: 'whitelist.json', size: '402 B', modified: 'Oct 2' },
];

const propsFile = (s: Server) => `#Minecraft server properties
#Fri Oct 03 21:47:12 CEST 2026
allow-flight=true
difficulty=normal
enable-command-block=false
enforce-whitelist=true
gamemode=survival
level-name=world
max-players=${s.maxPlayers}
max-tick-time=-1
motd=\\u00a7aWYZI \\u00a77\\u2022 ${s.name}
online-mode=true
pvp=true
server-ip=127.0.0.1
server-port=${s.port}
simulation-distance=8
spawn-protection=0
sync-chunk-writes=false
view-distance=10
white-list=true`;

const jvmFile = (s: Server) => `# Managed by WYZI — edits are preserved
-Xms${s.ramAlloc}G
-Xmx${s.ramAlloc}G
-XX:+UseG1GC
-XX:+ParallelRefProcEnabled
-XX:MaxGCPauseMillis=200
-XX:+UnlockExperimentalVMOptions
-XX:G1NewSizePercent=30
-XX:G1HeapRegionSize=8M
-XX:G1ReservePercent=20`;

export function FilesTab({ s }: { s: Server }) {
  const [path, setPath] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>('server.properties');
  let nodes = fileTree(s);
  for (const p of path) nodes = nodes.find((n) => n.name === p)?.children ?? [];
  const sorted = [...nodes].sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  const content = open === 'server.properties' ? propsFile(s) : open === 'user_jvm_args.txt' ? jvmFile(s) : open === 'eula.txt' ? '#By changing the setting below to TRUE you are indicating your agreement to our EULA.\neula=true' : null;

  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="surface col-span-12 overflow-hidden rounded-xl xl:col-span-7">
        <div className="flex h-11 items-center gap-1 border-b border-line px-3">
          <button onClick={() => setPath([])} className="rounded px-1.5 py-0.5 font-mono text-[11.5px] text-fg-3 hover:bg-white/5 hover:text-fg">
            /srv/minecraft/{s.id}
          </button>
          {path.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={12} className="text-fg-4" />
              <button onClick={() => setPath(path.slice(0, i + 1))} className="rounded px-1.5 py-0.5 font-mono text-[11.5px] text-fg-2 hover:bg-white/5 hover:text-fg">
                {p}
              </button>
            </span>
          ))}
          <div className="ml-auto flex gap-1">
            <Tooltip content="Upload files">
              <IconButton icon={Upload} label="Upload" size="xs" onClick={() => toast('Uploads are disabled in the prototype', 'info')} />
            </Tooltip>
            <Tooltip content="New folder">
              <IconButton icon={Plus} label="New" size="xs" onClick={() => toast('Folder creation is disabled in the prototype', 'info')} />
            </Tooltip>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_100px_120px] border-b border-line px-4 py-1.5 text-2xs text-fg-4">
          <span>Name</span>
          <span className="text-right">Size</span>
          <span className="text-right">Modified</span>
        </div>
        <div className="min-h-[360px]">
          {path.length > 0 && (
            <button onClick={() => setPath(path.slice(0, -1))} className="grid w-full grid-cols-[1fr_100px_120px] items-center px-4 py-[7px] text-left text-sm text-fg-3 hover:bg-white/[0.025]">
              <span className="flex items-center gap-2.5">
                <FolderUp size={14} /> ..
              </span>
            </button>
          )}
          {sorted.map((n) => (
            <FileRow key={n.name} n={n} active={open === n.name} onOpen={() => (n.dir ? setPath([...path, n.name]) : setOpen(n.name))} />
          ))}
          {sorted.length === 0 && <Empty icon={Folder} title="Empty folder" desc="Nothing in here yet." />}
        </div>
      </section>

      <section className="surface col-span-12 flex flex-col overflow-hidden rounded-xl xl:col-span-5">
        <div className="flex h-11 items-center gap-2 border-b border-line px-4">
          <FileCode2 size={14} className="text-fg-3" />
          <span className="font-mono text-[12px]">{open ?? 'No file selected'}</span>
          {content && <Badge tone="neutral" className="ml-1">{open?.endsWith('.properties') ? 'properties' : 'text'}</Badge>}
          <div className="ml-auto">
            {content && (
              <Button size="xs" variant="secondary" icon={Save} onClick={() => toast(`${open} saved`, 'success', 'Changes apply on next restart')}>
                Save
              </Button>
            )}
          </div>
        </div>
        {content ? (
          <div className="min-h-0 flex-1 overflow-auto bg-[#070708] py-2 font-mono text-[11.5px] leading-[19px]">
            {content.split('\n').map((ln, i) => {
              const [k, ...v] = ln.split('=');
              return (
                <div key={i} className="flex hover:bg-white/[0.02]">
                  <span className="w-10 shrink-0 pr-3 text-right text-fg-4 select-none">{i + 1}</span>
                  {ln.startsWith('#') ? (
                    <span className="text-fg-4">{ln}</span>
                  ) : v.length ? (
                    <span>
                      <span className="text-blue">{k}</span>
                      <span className="text-fg-4">=</span>
                      <span className={v.join('=') === 'true' || v.join('=') === 'false' ? 'text-amber' : /^\d+$/.test(v.join('=')) ? 'text-violet' : 'text-fg'}>{v.join('=')}</span>
                    </span>
                  ) : (
                    <span className="text-fg-2">{ln}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={FileText} title={open ? 'Preview unavailable' : 'Select a file'} desc={open ? 'Binary or large files can’t be previewed in the browser.' : 'Choose a text file to preview and edit it.'} />
        )}
      </section>
    </div>
  );
}

function FileRow({ n, active, onOpen }: { n: Node; active: boolean; onOpen: () => void }) {
  const onCtx = useContextMenu([
    { heading: n.name },
    { label: n.dir ? 'Open folder' : 'Open', icon: n.dir ? Folder : FileText, onSelect: onOpen },
    { label: 'Download', icon: ArrowUpRight, onSelect: () => toast('Downloads are disabled in the prototype', 'info') },
    { separator: true },
    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => toast('File deletion is disabled in the prototype', 'warn') },
  ]);
  return (
    <button
      onClick={onOpen}
      onContextMenu={onCtx}
      className={cx('grid w-full grid-cols-[1fr_100px_120px] items-center px-4 py-[7px] text-left text-sm transition-colors', active ? 'bg-white/[0.045]' : 'hover:bg-white/[0.025]')}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {n.dir ? <Folder size={14} className="shrink-0 fill-blue/15 text-blue" /> : <FileText size={14} className="shrink-0 text-fg-3" />}
        <span className={cx('truncate', n.dir ? 'text-fg' : 'font-mono text-[12px] text-fg-2')}>{n.name}</span>
      </span>
      <span className="num text-right text-xs text-fg-3">{n.size ?? '—'}</span>
      <span className="text-right text-xs text-fg-4">{n.modified}</span>
    </button>
  );
}

/* ═════════════════════ PERFORMANCE ═════════════════════ */
const tickers = [
  { name: 'minecraft:overworld · entities', pct: 31, ms: 9.6 },
  { name: 'minecraft:overworld · block entities', pct: 22, ms: 6.8 },
  { name: 'create:kinetic_network', pct: 14, ms: 4.3 },
  { name: 'minecraft:the_nether · chunks', pct: 9, ms: 2.8 },
  { name: 'ars_nouveau:ritual_tick', pct: 6, ms: 1.9 },
  { name: 'other', pct: 18, ms: 5.6 },
];

export function PerformanceTab({ s }: { s: Server }) {
  const live = s.status === 'running';
  if (!live && !s.hist.cpu.some((v) => v > 0))
    return (
      <div className="surface rounded-xl">
        <Empty icon={Zap} title="No performance data" desc={`${s.name} is ${s.status}. Metrics are collected while the server runs.`} />
      </div>
    );
  return (
    <div className="grid grid-cols-12 gap-4">
      <Panel className="col-span-12 lg:col-span-6" title="Ticks per second" meta={live ? `${s.tps.toFixed(2)} now` : undefined}>
        <AreaChart height={170} series={[{ data: s.hist.tps, color: 'blue', label: 'TPS' }]} max={20} min={0} format={(v) => v.toFixed(0)} threshold={{ value: 18, label: 'Degraded' }} />
      </Panel>
      <Panel className="col-span-12 lg:col-span-6" title="Milliseconds per tick" meta={live ? `${s.mspt} ms now` : undefined}>
        <AreaChart height={170} series={[{ data: s.hist.mspt, color: 'blue', label: 'MSPT' }]} max={60} format={(v) => `${v.toFixed(0)}`} threshold={{ value: 50, label: '50 ms budget', color: 'red' }} />
      </Panel>
      <Panel className="col-span-12 lg:col-span-6" title="Heap usage" meta={`${s.ramUsed} / ${s.ramAlloc} GB · G1GC`}>
        <AreaChart height={170} series={[{ data: s.hist.ram, color: 'slate', label: 'Heap' }]} max={s.ramAlloc} format={(v) => `${v.toFixed(1)}G`} />
      </Panel>
      <Panel className="col-span-12 lg:col-span-6" title="Process CPU" meta="Share of 4 cores">
        <AreaChart height={170} series={[{ data: s.hist.cpu, color: 'violet', label: 'CPU' }]} max={100} format={(v) => `${v.toFixed(0)}%`} />
      </Panel>
      <Panel className="col-span-12 xl:col-span-8" title="Tick breakdown" meta="Sampled by spark · last 5 minutes" bodyClass="px-4 py-2">
        {tickers.map((t) => (
          <div key={t.name} className="grid grid-cols-[1fr_140px_64px] items-center gap-4 py-2">
            <span className="truncate font-mono text-[11.5px] text-fg-2">{t.name}</span>
            <Meter value={t.pct} max={40} tone={t.name === 'other' ? 'grey' : 'blue'} height={4} />
            <span className="num text-right text-xs text-fg">
              {t.ms} <span className="text-fg-4">ms</span>
            </span>
          </div>
        ))}
      </Panel>
      <Panel className="col-span-12 xl:col-span-4" title="Garbage collection" bodyClass="px-4 py-1.5">
        <KV k="Collector" v="G1 Young + Mixed" />
        <KV k="Young GCs / min" v="14" />
        <KV k="Avg pause" v="11.4 ms" />
        <KV k="Max pause (1h)" v="48 ms" />
        <KV k="Old gen" v="4.1 GB" />
        <KV k="Loaded chunks" v="2,318" />
        <KV k="Entities" v="1,904" />
      </Panel>
    </div>
  );
}

/* ═════════════════════ BACKUPS ═════════════════════ */
export function BackupsTab({ s }: { s: Server }) {
  const backups = useApp((st) => st.backups).filter((b) => b.serverId === s.id);
  const job = useApp((st) => st.backupJob);
  const mine = job?.serverId === s.id;
  return (
    <div className="space-y-4">
      <section className="surface flex flex-wrap items-center gap-5 rounded-xl px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{mine ? 'Backup in progress' : 'Snapshot this server'}</div>
          {mine ? (
            <div className="mt-2 max-w-xl">
              <Meter value={job!.progress * 100} tone="blue" height={5} striped />
              <div className="mt-1.5 flex justify-between text-xs text-fg-3">
                <span>{BACKUP_STEPS[job!.step]}</span>
                <span className="num">{Math.round(job!.progress * 100)}%</span>
              </div>
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-fg-3">
              World saves are paused for a few seconds. Players stay connected. Backups are written to <span className="font-mono">/mnt/archive/backups/{s.id}</span>.
            </div>
          )}
        </div>
        <Button variant="primary" icon={Archive} loading={mine} disabled={!!job && !mine} onClick={() => createBackup(s.id)}>
          {mine ? 'Backing up' : 'Create backup'}
        </Button>
      </section>
      <section className="surface overflow-hidden rounded-xl">
        {backups.length ? (
          backups.map((b) => (
            <div key={b.id} className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-0 hover:bg-white/[0.015]">
              <span className={cx('h-1.5 w-1.5 rounded-full', b.status === 'success' ? 'bg-mint' : 'bg-red')} />
              <div className="min-w-0 flex-1">
                <div className="text-sm">{b.when}</div>
                <div className="truncate text-xs text-fg-4">{b.note ?? b.date}</div>
              </div>
              <Badge tone={b.type === 'Manual' ? 'blue' : 'neutral'}>{b.type}</Badge>
              <span className="num w-16 text-right text-sm">{b.status === 'success' ? `${b.size} GB` : '—'}</span>
              <Button size="xs" variant="outline" icon={RotateCcw} disabled={b.status !== 'success'} onClick={() => toast('Restore is disabled in the prototype', 'info')}>
                Restore
              </Button>
            </div>
          ))
        ) : (
          <Empty icon={Archive} title="No backups yet" desc="Create the first snapshot of this server." />
        )}
      </section>
    </div>
  );
}

/* ═════════════════════ SETTINGS ═════════════════════ */
export function SettingsTab({ s }: { s: Server }) {
  const servers = useApp((st) => st.servers);
  const [ram, setRam] = useState(s.ramAlloc);
  const [difficulty, setDifficulty] = useState('Normal');
  const [maxPlayers, setMaxPlayers] = useState(s.maxPlayers);
  const [view, setView] = useState(10);
  const [sim, setSim] = useState(8);
  const [whitelist, setWhitelist] = useState(true);
  const [pvp, setPvp] = useState(true);
  const [backupStop, setBackupStop] = useState(true);
  const [java, setJava] = useState(s.java);
  const safeMax = +(safelyAvailable(servers, s.id) + 0).toFixed(1);
  const dirty = ram !== s.ramAlloc;

  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <SettingsGroup title="Resources" desc="Memory is reserved in full when the server starts.">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Memory allocation</div>
              <div className="text-xs text-fg-3">
                Sets -Xms and -Xmx. <span className="num">{safeMax} GB</span> can run alongside the other active servers.
              </div>
            </div>
            <div className="num text-[22px] font-semibold tracking-tight">
              {ram.toFixed(1)}
              <span className="ml-1 text-sm font-normal text-fg-3">GB</span>
            </div>
          </div>
          <div className="mt-4">
            <Slider value={ram} onChange={setRam} min={1} max={12} step={0.5} marks={[2, 4, 6, 8, 10]} danger={Math.max(1, safeMax)} />
            <div className="num mt-1.5 flex justify-between text-2xs text-fg-4">
              <span>1 GB</span>
              <span>12 GB</span>
            </div>
          </div>
          <AnimatePresence>
            {ram > safeMax && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-3 rounded-md bg-amber/[0.07] px-3 py-2 text-xs text-amber shadow-[inset_0_0_0_1px_rgba(229,173,79,0.2)]">
                  {ram.toFixed(1)} GB exceeds what’s safely available while other servers run. WYZI will ask to stop them before starting {s.name}.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <Row label="Java runtime" desc="Runtime used to launch the server process.">
          <Select value={java} onChange={setJava} width={190} options={['Temurin 8u422', 'Temurin 17.0.12', 'Temurin 21.0.4']} />
        </Row>
        <Row label="JVM flags" desc="Aikar’s G1GC flags tuned for modded servers.">
          <TextInput icon={null} mono defaultValue="-XX:+UseG1GC -XX:MaxGCPauseMillis=200 …" className="w-[260px]" />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Behavior">
        <Row label="Stop when empty" desc="Shut down after 10 minutes without players.">
          <Switch checked={s.autoStop} onChange={(v) => patchServerSettings(s.id, { autoStop: v })} />
        </Row>
        <Row label="Wake on player connection" desc="Keep a lightweight listener on the port and boot when someone joins.">
          <Switch checked={s.wakeOnConnect} onChange={(v) => patchServerSettings(s.id, { wakeOnConnect: v })} />
        </Row>
        <Row label="Back up before shutdown" desc="Snapshot the world whenever the server stops.">
          <Switch checked={backupStop} onChange={setBackupStop} />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Gameplay" desc="Written to server.properties.">
        <Row label="Difficulty">
          <Segmented value={difficulty} onChange={setDifficulty} options={['Peaceful', 'Easy', 'Normal', 'Hard']} size="xs" />
        </Row>
        <Row label="Max players">
          <Stepper value={maxPlayers} onChange={setMaxPlayers} min={1} max={50} />
        </Row>
        <Row label="View distance" desc="Chunks sent to clients. Lower values save memory.">
          <Stepper value={view} onChange={setView} min={4} max={32} suffix="ch" />
        </Row>
        <Row label="Simulation distance">
          <Stepper value={sim} onChange={setSim} min={4} max={32} suffix="ch" />
        </Row>
        <Row label="Whitelist">
          <Switch checked={whitelist} onChange={setWhitelist} />
        </Row>
        <Row label="PvP">
          <Switch checked={pvp} onChange={setPvp} />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Danger zone" danger>
        <Row label="Reset world" desc="Deletes the world folder. A backup is taken first.">
          <Button variant="danger" size="sm" icon={RotateCcw} onClick={() => toast('World reset is disabled in the prototype', 'warn')}>
            Reset world
          </Button>
        </Row>
        <Row label="Delete instance" desc="Removes the server directory and its tunnel.">
          <Button variant="danger" size="sm" icon={Trash2} onClick={() => toast('Deleting instances is disabled in the prototype', 'warn')}>
            Delete
          </Button>
        </Row>
      </SettingsGroup>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass sticky bottom-4 flex items-center gap-3 rounded-lg px-4 py-2.5"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber" />
            <span className="flex-1 text-sm text-fg-2">Unsaved changes · takes effect on next restart</span>
            <Button size="sm" variant="ghost" onClick={() => setRam(s.ramAlloc)}>
              Discard
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                patchServerSettings(s.id, { ramAlloc: ram });
                toast('Settings saved', 'success', `${s.name} will use ${ram} GB after restart`);
              }}
            >
              Save changes
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SettingsGroup({ title, desc, children, danger }: { title: string; desc?: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h3 className={cx('text-sm font-medium', danger ? 'text-[#ff8784]' : 'text-fg')}>{title}</h3>
        {desc && <span className="text-xs text-fg-4">{desc}</span>}
      </div>
      <div className={cx('surface divide-y divide-line rounded-xl', danger && 'border-red/20')}>{children}</div>
    </section>
  );
}

export function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5" style={{ paddingTop: 'calc(var(--row-y) + 2px)', paddingBottom: 'calc(var(--row-y) + 2px)' }}>
      <div className="min-w-0">
        <div className="text-sm text-fg">{label}</div>
        {desc && <div className="text-xs text-fg-3">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
