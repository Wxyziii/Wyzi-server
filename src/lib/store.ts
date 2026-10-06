import { createStore } from './createStore';
import { clamp, clock, hhmm, jitter } from './format';

/* ─────────────────────────────── constants ─────────────────────────────── */

export const TOTAL_RAM = 15.6;
export const SYSTEM_RAM = 1.3;
export const SAFETY_HEADROOM = 2.5;
export const HISTORY = 60;

export const STARTUP_STEPS = [
  'Checking resources',
  'Allocating memory',
  'Starting Java process',
  'Waiting for Minecraft',
  'Checking network',
  'Ready',
] as const;
const STARTUP_DURATIONS = [650, 800, 1000, 1700, 850];

export const BACKUP_STEPS = [
  'Pausing world saves',
  'Flushing chunks to disk',
  'Snapshotting server files',
  'Compressing (zstd -3)',
  'Writing to archive HDD',
  'Verifying checksum',
  'Resuming world saves',
];

/* ─────────────────────────────── types ─────────────────────────────── */

export type ServerStatus = 'running' | 'sleeping' | 'offline' | 'starting' | 'stopping';

export interface Player {
  name: string;
  joined: string;
  ping: number;
  dimension: string;
  op?: boolean;
}

export interface Server {
  id: string;
  name: string;
  loader: string;
  mc: string;
  mods: number;
  port: number;
  tunnelPort: number;
  ramAlloc: number;
  ramUsed: number;
  status: ServerStatus;
  startStep: number;
  players: Player[];
  maxPlayers: number;
  tps: number;
  mspt: number;
  cpu: number;
  uptime: number;
  wakeOnConnect: boolean;
  autoStop: boolean;
  worldSize: string;
  diskSize: number;
  java: string;
  lastOnline: string;
  hist: { tps: number[]; mspt: number[]; cpu: number[]; ram: number[]; players: number[] };
}

export type LineLevel = 'info' | 'warn' | 'error' | 'cmd' | 'chat' | 'sys';
export interface ConsoleLine {
  id: number;
  t: string;
  thread: string;
  level: LineLevel;
  text: string;
}

export interface Backup {
  id: string;
  serverId: string;
  when: string;
  date: string;
  size: number;
  type: 'Automatic' | 'Manual' | 'Pre-shutdown';
  status: 'success' | 'failed';
  duration: string;
  note?: string;
}

export interface BackupJob {
  serverId: string;
  progress: number;
  step: number;
  type: 'Manual';
}

export type ActivityKind = 'start' | 'stop' | 'backup' | 'network' | 'system' | 'warn' | 'player';
export interface Activity {
  id: number;
  time: string;
  title: string;
  detail?: string;
  kind: ActivityKind;
}

export interface Toast {
  id: number;
  title: string;
  desc?: string;
  kind: 'success' | 'info' | 'warn' | 'error';
}

export interface LogEntry {
  id: number;
  t: string;
  source: 'system' | 'playit' | 'prominence' | 'cobblemon' | 'backup' | 'portal';
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
}

export interface Settings {
  autoStop: boolean;
  idleTimeout: string;
  wakeOnConnect: boolean;
  backupBeforeShutdown: boolean;
  autoBackups: boolean;
  backupTime: string;
  retainDays: number;
  compression: string;
  compact: boolean;
  theme: string;
  animations: boolean;
  notifyCrash: boolean;
  notifyBackup: boolean;
  notifyLowMem: boolean;
  safetyHeadroom: number;
}

/* ─────────────────────────────── mock data ─────────────────────────────── */

const series = (n: number, base: number, amp: number, min = 0, max = Infinity) => {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v = clamp(v + (Math.random() - 0.5) * amp + (base - v) * 0.15, min, max);
    out.push(+v.toFixed(2));
  }
  return out;
};

const emptyHist = () => ({
  tps: Array(HISTORY).fill(0),
  mspt: Array(HISTORY).fill(0),
  cpu: Array(HISTORY).fill(0),
  ram: Array(HISTORY).fill(0),
  players: Array(HISTORY).fill(0),
});

const initialServers: Server[] = [
  {
    id: 'prominence-ii',
    name: 'Prominence II',
    loader: 'Forge 47.2.0',
    mc: '1.20.1',
    mods: 214,
    port: 25565,
    tunnelPort: 28451,
    ramAlloc: 9,
    ramUsed: 7.4,
    status: 'running',
    startStep: 5,
    players: [
      { name: 'Wyzi', joined: '14:23', ping: 12, dimension: 'Overworld', op: true },
      { name: 'Kestrel_', joined: '14:41', ping: 38, dimension: 'The Nether' },
      { name: 'mossbyte', joined: '15:02', ping: 54, dimension: 'Overworld' },
    ],
    maxPlayers: 10,
    tps: 19.98,
    mspt: 31,
    cpu: 34,
    uptime: 4 * 3600 + 27 * 60,
    wakeOnConnect: false,
    autoStop: true,
    worldSize: '8.4 GB',
    diskSize: 41.2,
    java: 'Temurin 17.0.12',
    lastOnline: 'Now',
    hist: {
      tps: series(HISTORY, 19.95, 0.15, 18.6, 20),
      mspt: series(HISTORY, 31, 6, 18, 49),
      cpu: series(HISTORY, 34, 8, 10, 80),
      ram: series(HISTORY, 7.4, 0.5, 6.2, 8.7),
      players: series(HISTORY, 3, 0.4, 2, 3).map(Math.round),
    },
  },
  {
    id: 'cobblemon',
    name: 'Cobblemon',
    loader: 'Fabric 0.15.11',
    mc: '1.20.1',
    mods: 96,
    port: 25566,
    tunnelPort: 28452,
    ramAlloc: 6,
    ramUsed: 0,
    status: 'sleeping',
    startStep: 0,
    players: [],
    maxPlayers: 12,
    tps: 0,
    mspt: 0,
    cpu: 0,
    uptime: 0,
    wakeOnConnect: true,
    autoStop: true,
    worldSize: '3.1 GB',
    diskSize: 18.7,
    java: 'Temurin 17.0.12',
    lastOnline: 'Yesterday, 23:48',
    hist: emptyHist(),
  },
  {
    id: 'vanilla',
    name: 'Vanilla',
    loader: 'Vanilla',
    mc: '1.21.1',
    mods: 0,
    port: 25567,
    tunnelPort: 28453,
    ramAlloc: 2,
    ramUsed: 0,
    status: 'offline',
    startStep: 0,
    players: [],
    maxPlayers: 8,
    tps: 0,
    mspt: 0,
    cpu: 0,
    uptime: 0,
    wakeOnConnect: false,
    autoStop: true,
    worldSize: '1.2 GB',
    diskSize: 2.4,
    java: 'Temurin 21.0.4',
    lastOnline: '6 days ago',
    hist: emptyHist(),
  },
  {
    id: 'skyfactory',
    name: 'SkyFactory 4',
    loader: 'Forge 14.23.5',
    mc: '1.12.2',
    mods: 178,
    port: 25568,
    tunnelPort: 0,
    ramAlloc: 5,
    ramUsed: 0,
    status: 'offline',
    startStep: 0,
    players: [],
    maxPlayers: 6,
    tps: 0,
    mspt: 0,
    cpu: 0,
    uptime: 0,
    wakeOnConnect: false,
    autoStop: true,
    worldSize: '5.8 GB',
    diskSize: 22.9,
    java: 'Temurin 8u422',
    lastOnline: 'Aug 14',
    hist: emptyHist(),
  },
];

let lid = 1000;
const L = (t: string, level: LineLevel, text: string, thread = 'Server thread'): ConsoleLine => ({
  id: lid++,
  t,
  thread,
  level,
  text,
});

const prominenceLog: ConsoleLine[] = [
  L('14:20:59', 'info', 'Launching target \'forgeserver\' with arguments [--nogui]', 'main'),
  L('14:21:02', 'info', 'Loading 214 mods', 'main'),
  L('14:21:04', 'warn', 'Mod file majruszlibrary-1.20.1-7.1.6.jar is missing mods.toml signature', 'modloading-worker-0'),
  L('14:21:08', 'info', 'Starting minecraft server version 1.20.1'),
  L('14:21:08', 'info', 'Loading properties'),
  L('14:21:08', 'info', 'Default game type: SURVIVAL'),
  L('14:21:09', 'info', 'Preparing level "world"'),
  L('14:21:13', 'info', 'Preparing spawn area: 84%'),
  L('14:21:15', 'info', 'Done (6.832s)! For help, type "help"'),
  L('14:21:15', 'info', 'Wake-on-connect proxy released port 25565', 'wyzi-agent'),
  L('14:23:01', 'info', 'Wyzi joined the game'),
  L('14:23:16', 'chat', '<Wyzi> hello'),
  L('14:41:52', 'info', 'Kestrel_ joined the game'),
  L('14:42:07', 'chat', '<Kestrel_> evening! anyone seen the hellforged trader?'),
  L('14:58:33', 'warn', "Can't keep up! Is the server overloaded? Running 2140ms or 42 ticks behind"),
  L('15:02:11', 'info', 'mossbyte joined the game'),
  L('15:04:40', 'info', 'Saving the game (this may take a moment!)'),
  L('15:04:41', 'info', 'Saved the game'),
  L('15:12:09', 'chat', '<mossbyte> brb grabbing food'),
];

const initialBackups: Backup[] = [
  { id: 'b1', serverId: 'prominence-ii', when: 'Today, 03:00', date: '2026-10-06 03:00', size: 6.2, type: 'Automatic', status: 'success', duration: '2m 14s' },
  { id: 'b2', serverId: 'cobblemon', when: 'Yesterday, 03:00', date: '2026-10-05 03:00', size: 3.8, type: 'Automatic', status: 'success', duration: '1m 21s' },
  { id: 'b3', serverId: 'prominence-ii', when: 'Yesterday, 03:00', date: '2026-10-05 03:00', size: 6.1, type: 'Automatic', status: 'success', duration: '2m 09s' },
  { id: 'b4', serverId: 'prominence-ii', when: '3 days ago', date: '2026-10-03 21:47', size: 6.0, type: 'Manual', status: 'success', duration: '2m 02s', note: 'Before updating to 2.8.1' },
  { id: 'b5', serverId: 'cobblemon', when: '4 days ago', date: '2026-10-02 23:51', size: 3.7, type: 'Pre-shutdown', status: 'success', duration: '1m 18s' },
  { id: 'b6', serverId: 'vanilla', when: '5 days ago', date: '2026-10-01 03:00', size: 0, type: 'Automatic', status: 'failed', duration: '0m 04s', note: 'Archive volume locked by fsck' },
  { id: 'b7', serverId: 'vanilla', when: '6 days ago', date: '2026-09-30 03:00', size: 1.1, type: 'Automatic', status: 'success', duration: '0m 31s' },
  { id: 'b8', serverId: 'skyfactory', when: 'Aug 14', date: '2026-08-14 19:20', size: 5.4, type: 'Manual', status: 'success', duration: '1m 52s', note: 'Final archive' },
];

const initialActivity: Activity[] = [
  { id: 6, time: '15:02', title: 'mossbyte joined Prominence II', kind: 'player' },
  { id: 5, time: '14:21', title: 'Prominence II started', detail: 'Ready in 6.8s', kind: 'start' },
  { id: 4, time: '14:17', title: 'Backup completed', detail: 'Prominence II · 6.2 GB', kind: 'backup' },
  { id: 3, time: '13:58', title: 'Playit tunnel reconnected', detail: 'Edge relay eu-west · 29 ms', kind: 'network' },
  { id: 2, time: 'Yesterday', title: 'Cobblemon went to sleep', detail: 'Idle for 10 minutes', kind: 'stop' },
  { id: 1, time: 'Yesterday', title: 'System packages updated', detail: '14 packages · no reboot required', kind: 'system' },
];

const logSeed: Omit<LogEntry, 'id'>[] = [
  { t: '13:58:02', source: 'playit', level: 'warn', msg: 'tunnel connection lost (keepalive timeout after 30s)' },
  { t: '13:58:04', source: 'playit', level: 'info', msg: 'reconnecting to relay eu-west-2.playit.gg' },
  { t: '13:58:05', source: 'playit', level: 'info', msg: 'tunnel established id=7c1e…a91 latency=29ms' },
  { t: '14:15:00', source: 'backup', level: 'info', msg: 'job prominence-ii manual started' },
  { t: '14:17:14', source: 'backup', level: 'info', msg: 'job prominence-ii finished size=6.2GiB duration=2m14s sha256=ok' },
  { t: '14:20:57', source: 'portal', level: 'info', msg: 'start requested: prominence-ii (alloc 9GiB, headroom ok)' },
  { t: '14:20:58', source: 'system', level: 'info', msg: 'Started wyzi-mc@prominence-ii.service' },
  { t: '14:21:15', source: 'prominence', level: 'info', msg: 'Done (6.832s)! For help, type "help"' },
  { t: '14:30:00', source: 'system', level: 'debug', msg: 'smartd: /dev/sda SMART healthy, temp 31°C' },
  { t: '14:30:00', source: 'system', level: 'debug', msg: 'smartd: /dev/sdb SMART healthy, temp 34°C' },
  { t: '14:58:33', source: 'prominence', level: 'warn', msg: "Can't keep up! Running 2140ms or 42 ticks behind" },
  { t: '15:00:00', source: 'system', level: 'info', msg: 'apt-daily: 3 upgradable packages' },
  { t: '15:04:41', source: 'prominence', level: 'info', msg: 'Saved the game' },
];

/* ─────────────────────────────── store ─────────────────────────────── */

interface State {
  servers: Server[];
  consoles: Record<string, ConsoleLine[]>;
  backups: Backup[];
  backupJob: BackupJob | null;
  activity: Activity[];
  toasts: Toast[];
  logs: LogEntry[];
  ramConflict: { serverId: string } | null;
  paletteOpen: boolean;
  playit: { status: 'connected' | 'reconnecting'; latency: number; since: string };
  sys: {
    cpu: number;
    temp: number;
    load: [number, number, number];
    cores: number[];
    cache: number;
    hist: { cpu: number[]; ram: number[]; diskR: number[]; diskW: number[]; netIn: number[]; netOut: number[]; temp: number[] };
  };
  settings: Settings;
}

let uid = 1;
const timers: number[] = [];
const later = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms));
};

export const useApp = createStore<State>((set, get) => ({
  servers: initialServers,
  consoles: { 'prominence-ii': prominenceLog, cobblemon: [], vanilla: [], skyfactory: [] },
  backups: initialBackups,
  backupJob: null,
  activity: initialActivity,
  toasts: [],
  logs: logSeed.map((l) => ({ ...l, id: uid++ })),
  ramConflict: null,
  paletteOpen: false,
  playit: { status: 'connected', latency: 29, since: '13:58' },
  sys: {
    cpu: 24,
    temp: 47,
    load: [1.12, 0.98, 0.91],
    cores: [28, 22, 31, 17],
    cache: 1.8,
    hist: {
      cpu: series(HISTORY, 24, 9, 6, 70),
      ram: series(HISTORY, 9.8, 0.3, 9, 10.6),
      diskR: series(HISTORY, 6, 8, 0, 60),
      diskW: series(HISTORY, 3, 5, 0, 40),
      netIn: series(HISTORY, 0.42, 0.3, 0.05, 2),
      netOut: series(HISTORY, 0.9, 0.5, 0.1, 3),
      temp: series(HISTORY, 47, 1.5, 42, 55),
    },
  },
  settings: {
    autoStop: true,
    idleTimeout: '10 minutes',
    wakeOnConnect: true,
    backupBeforeShutdown: true,
    autoBackups: true,
    backupTime: '03:00',
    retainDays: 14,
    compression: 'zstd (balanced)',
    compact: false,
    theme: 'Graphite',
    animations: true,
    notifyCrash: true,
    notifyBackup: false,
    notifyLowMem: true,
    safetyHeadroom: SAFETY_HEADROOM,
  },
}));

/* ─────────────────────────────── helpers ─────────────────────────────── */

const S = useApp.setState;
const G = useApp.getState;

function patchServer(id: string, p: Partial<Server> | ((s: Server) => Partial<Server>)) {
  S((st) => ({
    servers: st.servers.map((s) => (s.id === id ? { ...s, ...(typeof p === 'function' ? p(s) : p) } : s)),
  }));
}

export function serverById(id: string) {
  return G().servers.find((s) => s.id === id);
}

export function pushConsole(id: string, level: LineLevel, text: string, thread = 'Server thread') {
  S((st) => ({
    consoles: { ...st.consoles, [id]: [...(st.consoles[id] ?? []), L(clock(), level, text, thread)].slice(-400) },
  }));
}

export function pushActivity(title: string, kind: ActivityKind, detail?: string) {
  S((st) => ({ activity: [{ id: uid++, time: hhmm(), title, detail, kind }, ...st.activity].slice(0, 30) }));
}

export function pushLog(source: LogEntry['source'], level: LogEntry['level'], msg: string) {
  S((st) => ({ logs: [...st.logs, { id: uid++, t: clock(), source, level, msg }].slice(-500) }));
}

export function toast(title: string, kind: Toast['kind'] = 'success', desc?: string) {
  const id = uid++;
  S((st) => ({ toasts: [...st.toasts, { id, title, desc, kind }] }));
  later(3800, () => dismissToast(id));
}
export function dismissToast(id: number) {
  S((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) }));
}

const isActive = (s: Server) => s.status === 'running' || s.status === 'starting';

export function memoryBreakdown(servers: Server[], cache: number) {
  const minecraft = servers.reduce((a, s) => a + (s.status === 'stopping' ? s.ramUsed : isActive(s) ? s.ramUsed : 0), 0);
  const system = SYSTEM_RAM;
  const free = Math.max(0, TOTAL_RAM - minecraft - system - cache);
  return { minecraft, system, cache, available: free, used: minecraft + system };
}

export function safelyAvailable(servers: Server[], excludeId?: string, headroom = G().settings.safetyHeadroom) {
  const reserved = servers
    .filter((s) => s.id !== excludeId && (isActive(s) || s.status === 'stopping'))
    .reduce((a, s) => a + s.ramAlloc, 0);
  return Math.max(0, +(TOTAL_RAM - SYSTEM_RAM - headroom - reserved).toFixed(1));
}

/* ─────────────────────────────── actions ─────────────────────────────── */

export function requestStart(id: string) {
  const st = G();
  const srv = serverById(id);
  if (!srv || isActive(srv)) return;
  const avail = safelyAvailable(st.servers, id);
  if (srv.ramAlloc > avail) {
    S({ ramConflict: { serverId: id } });
    pushLog('portal', 'warn', `start blocked: ${id} requests ${srv.ramAlloc}GiB, ${avail}GiB safely available`);
    return;
  }
  runStartup(id);
}

function runStartup(id: string) {
  const srv = serverById(id)!;
  patchServer(id, { status: 'starting', startStep: 0, uptime: 0, players: [], tps: 0, mspt: 0, cpu: 0, ramUsed: 0.3 });
  pushLog('portal', 'info', `start requested: ${id} (alloc ${srv.ramAlloc}GiB, headroom ok)`);
  pushConsole(id, 'sys', `Starting ${srv.name} with -Xms${srv.ramAlloc}G -Xmx${srv.ramAlloc}G (${srv.java})`, 'wyzi-agent');
  const lines: [LineLevel, string, string][][] = [
    [['sys', `Memory check passed · ${safelyAvailable(G().servers, id)} GB safely available`, 'wyzi-agent']],
    [['sys', `Reserved ${srv.ramAlloc} GB heap, G1GC region size 8M`, 'wyzi-agent']],
    [
      ['info', `Launching target '${srv.loader.startsWith('Vanilla') ? 'server' : srv.loader.split(' ')[0].toLowerCase() + 'server'}' with arguments [--nogui]`, 'main'],
      ...(srv.mods ? [['info', `Loading ${srv.mods} mods`, 'main'] as [LineLevel, string, string]] : []),
    ],
    [
      ['info', `Starting minecraft server version ${srv.mc}`, 'Server thread'],
      ['info', 'Preparing level "world"', 'Server thread'],
      ['info', `Done (${(4 + Math.random() * 4).toFixed(3)}s)! For help, type "help"`, 'Server thread'],
    ],
    [['sys', `Playit tunnel bound :${srv.tunnelPort || '—'} → 127.0.0.1:${srv.port}`, 'wyzi-agent']],
  ];
  let t = 0;
  STARTUP_DURATIONS.forEach((d, i) => {
    t += d;
    later(t, () => {
      const cur = serverById(id);
      if (!cur || cur.status !== 'starting') return;
      lines[i].forEach(([lv, tx, th]) => pushConsole(id, lv, tx, th));
      patchServer(id, { startStep: i + 1, ramUsed: +(srv.ramAlloc * (0.1 + i * 0.09)).toFixed(1), cpu: 60 + Math.random() * 30 });
    });
  });
  later(t + 700, () => {
    const cur = serverById(id);
    if (!cur || cur.status !== 'starting') return;
    patchServer(id, { status: 'running', startStep: 5, tps: 20, mspt: 14, cpu: 22, uptime: 1, ramUsed: +(srv.ramAlloc * 0.52).toFixed(1), lastOnline: 'Now' });
    pushActivity(`${srv.name} started`, 'start', `Ready in ${(t / 1000).toFixed(1)}s`);
    pushLog('system', 'info', `Started wyzi-mc@${id}.service`);
    toast(`${srv.name} is running`, 'success', `Listening on 127.0.0.1:${srv.port}`);
  });
}

export function stopServer(id: string, then?: () => void, quiet = false) {
  const srv = serverById(id);
  if (!srv || (srv.status !== 'running' && srv.status !== 'starting')) return;
  patchServer(id, { status: 'stopping' });
  pushConsole(id, 'info', 'Stopping the server');
  later(500, () => pushConsole(id, 'info', 'Saving players'));
  later(900, () => pushConsole(id, 'info', 'Saving worlds'));
  later(1300, () => pushConsole(id, 'info', "Saving chunks for level 'ServerLevel[world]'/minecraft:overworld"));
  later(1900, () => {
    const after: ServerStatus = srv.wakeOnConnect ? 'sleeping' : 'offline';
    patchServer(id, { status: after, ramUsed: 0, cpu: 0, tps: 0, mspt: 0, uptime: 0, players: [], startStep: 0, lastOnline: 'Just now' });
    pushConsole(id, 'sys', after === 'sleeping' ? 'Process exited (0). Wake-on-connect proxy listening.' : 'Process exited (0).', 'wyzi-agent');
    pushActivity(`${srv.name} ${after === 'sleeping' ? 'put to sleep' : 'stopped'}`, 'stop', `Freed ${srv.ramAlloc} GB`);
    pushLog('system', 'info', `Stopped wyzi-mc@${id}.service`);
    if (!quiet) toast(`${srv.name} stopped`, 'info', `${srv.ramAlloc} GB returned to the pool`);
    then?.();
  });
}

export function restartServer(id: string) {
  const srv = serverById(id);
  if (!srv) return;
  if (srv.status === 'running') stopServer(id, () => runStartup(id), true);
  else requestStart(id);
}

export function resolveConflict(stopId: string, startId: string) {
  S({ ramConflict: null });
  const a = serverById(stopId)!;
  const b = serverById(startId)!;
  toast(`Switching to ${b.name}`, 'info', `Stopping ${a.name} first`);
  stopServer(stopId, () => runStartup(startId), true);
}

export function sendCommand(id: string, raw: string) {
  const cmd = raw.trim().replace(/^\//, '');
  if (!cmd) return;
  const srv = serverById(id)!;
  pushConsole(id, 'cmd', `> ${cmd}`, 'console');
  if (srv.status !== 'running') {
    later(120, () => pushConsole(id, 'error', 'Server is not running. Command was not delivered.', 'wyzi-agent'));
    return;
  }
  const [head, ...rest] = cmd.split(' ');
  const arg = rest.join(' ');
  const reply = (lv: LineLevel, tx: string) => later(140 + Math.random() * 120, () => pushConsole(id, lv, tx));
  switch (head.toLowerCase()) {
    case 'say':
      reply('chat', `[Server] ${arg || ''}`);
      break;
    case 'list':
      reply('info', `There are ${srv.players.length} of a max of ${srv.maxPlayers} players online: ${srv.players.map((p) => p.name).join(', ')}`);
      break;
    case 'tps':
    case 'forge':
      reply('info', `Overall: Mean tick time: ${srv.mspt.toFixed(3)} ms. Mean TPS: ${srv.tps.toFixed(3)}`);
      break;
    case 'help':
      reply('info', '/say <message> · /list · /tps · /time set <value> · /weather <type> · /save-all · /stop');
      break;
    case 'save-all':
      reply('info', 'Saving the game (this may take a moment!)');
      later(900, () => pushConsole(id, 'info', 'Saved the game'));
      break;
    case 'time':
      reply('info', `Set the time to ${rest[1] ?? '1000'}`);
      break;
    case 'weather':
      reply('info', `Set the weather to ${arg || 'clear'}`);
      break;
    case 'op':
      reply('info', `Made ${arg} a server operator`);
      break;
    case 'stop':
      stopServer(id);
      break;
    default:
      reply('error', `Unknown or incomplete command, see below for error`);
      reply('error', `${cmd}<--[HERE]`);
  }
}

export function createBackup(serverId: string) {
  if (G().backupJob) return;
  const srv = serverById(serverId)!;
  S({ backupJob: { serverId, progress: 0, step: 0, type: 'Manual' } });
  pushLog('backup', 'info', `job ${serverId} manual started`);
  if (srv.status === 'running') pushConsole(serverId, 'info', 'Automatic saving is now disabled');
  const total = 7200;
  const tick = 90;
  let elapsed = 0;
  const iv = window.setInterval(() => {
    elapsed += tick;
    const p = Math.min(1, elapsed / total);
    const eased = p;
    S((st) => ({
      backupJob: st.backupJob && {
        ...st.backupJob,
        progress: eased,
        step: Math.min(BACKUP_STEPS.length - 1, Math.floor(eased * BACKUP_STEPS.length)),
      },
    }));
    if (p >= 1) {
      window.clearInterval(iv);
      const size = +(srv.diskSize * 0.15 + Math.random() * 0.2).toFixed(1);
      later(350, () => {
        S((st) => ({
          backupJob: null,
          backups: [
            { id: 'b' + uid++, serverId, when: `Today, ${hhmm()}`, date: `2026-10-06 ${hhmm()}`, size, type: 'Manual', status: 'success', duration: '0m 07s' },
            ...st.backups,
          ],
        }));
        if (srv.status === 'running') pushConsole(serverId, 'info', 'Automatic saving is now enabled');
        pushActivity('Backup completed', 'backup', `${srv.name} · ${size} GB`);
        pushLog('backup', 'info', `job ${serverId} finished size=${size}GiB sha256=ok`);
        toast('Backup completed', 'success', `${srv.name} · ${size} GB written to /mnt/archive`);
      });
    }
  }, tick);
}

export function restartTunnel() {
  if (G().playit.status === 'reconnecting') return;
  S((st) => ({ playit: { ...st.playit, status: 'reconnecting' } }));
  pushLog('playit', 'info', 'agent restart requested from portal');
  later(1100, () => pushLog('playit', 'info', 'reconnecting to relay eu-west-2.playit.gg'));
  later(2600, () => {
    const lat = Math.round(24 + Math.random() * 10);
    S({ playit: { status: 'connected', latency: lat, since: hhmm() } });
    pushLog('playit', 'info', `tunnel established latency=${lat}ms`);
    pushActivity('Playit tunnel reconnected', 'network', `Edge relay eu-west · ${lat} ms`);
    toast('Tunnel reconnected', 'success', `Latency ${lat} ms via eu-west`);
  });
}

export function updateSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  S((st) => ({ settings: { ...st.settings, [k]: v } }));
}

export function patchServerSettings(id: string, p: Partial<Server>) {
  patchServer(id, p);
}

/* ─────────────────────────────── live simulation ─────────────────────────────── */

const push = (arr: number[], v: number) => [...arr.slice(1), +v.toFixed(2)];

export function startSimulation() {
  const iv = window.setInterval(() => {
    S((st) => {
      const servers = st.servers.map((s) => {
        if (s.status === 'running') {
          const players = s.players.length;
          const tps = s.mspt > 50 ? 20 * (50 / s.mspt) : Math.min(20, jitter(19.97, 0.04, 19.7, 20));
          const mspt = jitter(s.mspt + (s.ramAlloc > 6 ? (31 - s.mspt) * 0.2 : (16 - s.mspt) * 0.2), 3, 8, 48);
          const target = s.ramAlloc * (s.ramAlloc > 6 ? 0.86 : 0.6);
          let ramUsed = s.ramUsed + (target - s.ramUsed) * 0.08 + (Math.random() - 0.45) * 0.18;
          if (ramUsed > s.ramAlloc * 0.96) ramUsed -= 1.1; // GC
          ramUsed = clamp(ramUsed, 0.5, s.ramAlloc * 0.97);
          const cpu = jitter(s.ramAlloc > 6 ? 34 : 12, 7, 3, 95);
          return {
            ...s,
            tps: +tps.toFixed(2),
            mspt: Math.round(mspt),
            ramUsed: +ramUsed.toFixed(1),
            cpu: Math.round(cpu),
            uptime: s.uptime + 1.5,
            hist: {
              tps: push(s.hist.tps, tps),
              mspt: push(s.hist.mspt, mspt),
              cpu: push(s.hist.cpu, cpu),
              ram: push(s.hist.ram, ramUsed),
              players: push(s.hist.players, players),
            },
          };
        }
        if (s.status === 'starting' || s.status === 'stopping') {
          return {
            ...s,
            hist: {
              tps: push(s.hist.tps, 0),
              mspt: push(s.hist.mspt, 0),
              cpu: push(s.hist.cpu, s.cpu),
              ram: push(s.hist.ram, s.ramUsed),
              players: push(s.hist.players, 0),
            },
          };
        }
        return s;
      });
      const mcCpu = servers.reduce((a, s) => a + (s.status !== 'offline' && s.status !== 'sleeping' ? s.cpu : 0), 0);
      const cpu = clamp(6 + mcCpu * 0.55 + (Math.random() - 0.5) * 6, 2, 98);
      const cores = st.sys.cores.map(() => Math.round(clamp(cpu + (Math.random() - 0.5) * 22, 1, 100)));
      const temp = clamp(st.sys.temp + (38 + cpu * 0.4 - st.sys.temp) * 0.2 + (Math.random() - 0.5) * 0.8, 36, 82);
      const cache = clamp(st.sys.cache + (Math.random() - 0.5) * 0.08, 1.5, 2.1);
      const mem = memoryBreakdown(servers, cache);
      const ld = st.sys.load;
      const load1 = clamp(ld[0] + (cpu / 25 - ld[0]) * 0.1, 0.1, 4);
      return {
        servers,
        sys: {
          cpu: Math.round(cpu),
          temp: Math.round(temp),
          cores,
          cache,
          load: [+load1.toFixed(2), +(ld[1] + (load1 - ld[1]) * 0.03).toFixed(2), +(ld[2] + (load1 - ld[2]) * 0.01).toFixed(2)],
          hist: {
            cpu: push(st.sys.hist.cpu, cpu),
            ram: push(st.sys.hist.ram, mem.used + cache * 0),
            diskR: push(st.sys.hist.diskR, clamp(Math.random() < 0.12 ? 30 + Math.random() * 60 : Math.random() * 9, 0, 120)),
            diskW: push(st.sys.hist.diskW, st.backupJob ? 80 + Math.random() * 40 : Math.random() < 0.1 ? 20 + Math.random() * 30 : Math.random() * 6),
            netIn: push(st.sys.hist.netIn, jitter(0.2 + servers.filter((s) => s.status === 'running').length * 0.25, 0.2, 0.02, 4)),
            netOut: push(st.sys.hist.netOut, jitter(0.3 + servers.reduce((a, s) => a + s.players.length, 0) * 0.28, 0.35, 0.05, 5)),
            temp: push(st.sys.hist.temp, temp),
          },
        },
        playit: st.playit.status === 'connected' ? { ...st.playit, latency: Math.round(jitter(st.playit.latency, 2, 22, 40)) } : st.playit,
      };
    });
  }, 1500);

  // ambient log + chat noise
  const chatter = [
    ['prominence-ii', 'chat', '<Kestrel_> found a lava lake near spawn, careful'],
    ['prominence-ii', 'info', 'Kestrel_ has made the advancement [Hot Tourist Destinations]'],
    ['prominence-ii', 'chat', '<mossbyte> back'],
    ['prominence-ii', 'info', 'Saving the game (this may take a moment!)'],
    ['prominence-ii', 'chat', '<Wyzi> server feels smooth today'],
    ['prominence-ii', 'warn', 'Kestrel_ moved too quickly! 9.21,0.0,3.84'],
  ] as const;
  let ci = 0;
  const iv2 = window.setInterval(() => {
    const p = serverById('prominence-ii');
    if (p?.status === 'running') {
      const [id, lv, tx] = chatter[ci++ % chatter.length];
      pushConsole(id, lv, tx);
      pushLog('prominence', lv === 'warn' ? 'warn' : 'info', tx);
    }
    if (Math.random() < 0.4) pushLog('system', 'debug', `node-exporter scrape ok (${Math.round(8 + Math.random() * 6)}ms)`);
  }, 9000);

  return () => {
    window.clearInterval(iv);
    window.clearInterval(iv2);
  };
}
