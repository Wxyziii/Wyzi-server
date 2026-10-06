import { createStore } from './createStore';
import { clock, hhmm } from './format';
import { DATA_MODE, IS_LIVE } from './mode';
import { HISTORY, initialActivity, initialBackups, initialServers, logSeed, mockHost, mockStorage, prominenceLog, series } from './mockData';
import * as live from './live';
import * as mock from './mock';
import type {
  Activity,
  ActivityKind,
  Backup,
  BackupJob,
  Connection,
  ConsoleLine,
  HostInfo,
  LineLevel,
  LogEntry,
  MemoryInfo,
  PlayitState,
  RamConflict,
  Server,
  Settings,
  StorageInfo,
  SysMetrics,
  Toast,
} from './types';

export type * from './types';
export { HISTORY };

/* ─────────────────────────────── constants ─────────────────────────────── */

export const SAFETY_HEADROOM = 2.5;

export const STARTUP_STEPS = [
  'Checking resources',
  'Allocating memory',
  'Starting Java process',
  'Waiting for Minecraft',
  'Checking network',
  'Ready',
] as const;

export const BACKUP_STEPS = [
  'Pausing world saves',
  'Flushing chunks to disk',
  'Snapshotting server files',
  'Compressing (zstd)',
  'Writing to bulk HDD',
  'Verifying checksum',
  'Resuming world saves',
];

/* ─────────────────────────────── state ─────────────────────────────── */

export interface State {
  conn: Connection;
  host: HostInfo | null;
  servers: Server[];
  consoles: Record<string, ConsoleLine[]>;
  backups: Backup[];
  backupJob: BackupJob | null;
  backupSchedule: Record<string, { enabled: boolean; next: string | null; keep: number; keepManual: number }>;
  activity: Activity[];
  toasts: Toast[];
  logs: LogEntry[];
  ramConflict: RamConflict | null;
  restoreRequest: { serverId: string; backupId: string } | null;
  paletteOpen: boolean;
  playit: PlayitState;
  sys: SysMetrics;
  memory: MemoryInfo;
  storage: StorageInfo | null;
  settings: Settings;
}

const zeros = () => Array(HISTORY).fill(0);

const LOCAL_UI_KEY = 'wyzi.ui';
function loadUiPrefs(): Partial<Settings> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_UI_KEY) || '{}');
  } catch {
    return {};
  }
}

const baseSettings: Settings = {
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
  ...loadUiPrefs(),
};

const emptyMemory: MemoryInfo = {
  total: 0, available: 0, free: 0, cache: 0, minecraft: 0, system: 0, used: 0,
  headroom: SAFETY_HEADROOM, reservedGrowth: 0, arkReclaimable: 0, safeForNew: 0, swapTotal: 0, swapUsed: 0, zram: null,
};

function liveInitial(): State {
  return {
    conn: { mode: 'live', state: 'connecting', error: null, lastSeen: null },
    host: null,
    servers: [],
    consoles: {},
    backups: [],
    backupJob: null,
    backupSchedule: {},
    activity: [],
    toasts: [],
    logs: [],
    ramConflict: null,
    restoreRequest: null,
    paletteOpen: false,
    playit: { status: 'unknown', latency: null, since: '—' },
    sys: { cpu: 0, temp: 0, load: [0, 0, 0], cores: [0, 0, 0, 0], cache: 0, hist: { cpu: zeros(), ram: zeros(), diskR: zeros(), diskW: zeros(), netIn: zeros(), netOut: zeros(), temp: zeros() } },
    memory: emptyMemory,
    storage: null,
    settings: baseSettings,
  };
}

let uid = 1;

function mockInitial(): State {
  return {
    conn: { mode: 'mock', state: 'online', helper: true },
    host: mockHost,
    servers: initialServers,
    consoles: { 'prominence-ii': prominenceLog, cobblemon: [], vanilla: [], skyfactory: [] },
    backups: initialBackups,
    backupJob: null,
    backupSchedule: {},
    activity: initialActivity,
    toasts: [],
    logs: logSeed.map((l) => ({ ...l, id: uid++ })),
    ramConflict: null,
    restoreRequest: null,
    paletteOpen: false,
    playit: {
      status: 'connected', latency: 29, since: '13:58', agent: 'online', tunnel: 'online', version: 'prototype',
      publicAddress: 'example.gl.joinmc.link:28451', copyAddress: 'example.gl.joinmc.link:28451', localTarget: '127.0.0.1:25565',
      tunnels: [{ publicHost: 'example.gl.joinmc.link', publicPort: 28451, publicAddress: 'example.gl.joinmc.link:28451', copyAddress: 'example.gl.joinmc.link:28451', localTarget: '127.0.0.1:25565', localPort: 25565, state: 'online' }],
    },
    sys: {
      cpu: 24, temp: 47, load: [1.12, 0.98, 0.91], cores: [28, 22, 31, 17], cache: 1.8, freqMhz: 3300,
      sensors: [{ label: 'CPU package', value: 47 }, { label: 'Chipset (PCH)', value: 41 }, { label: 'GPU', value: 39 }],
      fans: [{ label: 'GPU fan', rpm: 1063 }],
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
    memory: mock.computeMemory(initialServers, 1.8, SAFETY_HEADROOM),
    storage: mockStorage,
    settings: baseSettings,
  };
}

export const useApp = createStore<State>(() => (IS_LIVE ? liveInitial() : mockInitial()));

/* ─────────────────────────────── helpers ─────────────────────────────── */

const S = useApp.setState;
const G = useApp.getState;

export function patchServer(id: string, p: Partial<Server> | ((s: Server) => Partial<Server>)) {
  S((st) => ({
    servers: st.servers.map((s) => (s.id === id ? { ...s, ...(typeof p === 'function' ? p(s) : p) } : s)),
  }));
}

export function serverById(id: string) {
  return G().servers.find((s) => s.id === id);
}

let lid = 1_000_000;
export function pushConsole(id: string, level: LineLevel, text: string, thread = 'Server thread') {
  const line: ConsoleLine = { id: lid++, t: clock(), thread, level, text };
  appendConsole(id, [line]);
}

export function appendConsole(id: string, lines: ConsoleLine[], reset = false) {
  S((st) => ({
    consoles: { ...st.consoles, [id]: [...(reset ? [] : st.consoles[id] ?? []), ...lines].slice(-500) },
  }));
}

export function pushActivity(title: string, kind: ActivityKind, detail?: string) {
  S((st) => ({ activity: [{ id: uid++, time: hhmm(), title, detail, kind }, ...st.activity].slice(0, 40) }));
}

export function pushLog(source: string, level: LogEntry['level'], msg: string) {
  S((st) => ({ logs: [...st.logs, { id: uid++, t: clock(), source, level, msg }].slice(-800) }));
}

export function toast(title: string, kind: Toast['kind'] = 'success', desc?: string | null) {
  const id = uid++;
  S((st) => ({ toasts: [...st.toasts, { id, title, desc, kind }] }));
  window.setTimeout(() => dismissToast(id), kind === 'error' ? 6500 : 3800);
}
export function dismissToast(id: number) {
  S((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) }));
}

export const isActive = (s: Server) => s.status === 'running' || s.status === 'starting' || s.status === 'stopping';
export const isDeployed = (s: Server) => s.deployed !== false && s.status !== 'undeployed';

/** JVM footprint the RAM safety model reserves for a server (Xmx + native overhead). */
export const footprint = (s: Pick<Server, 'ramAlloc' | 'footprint'>) => s.footprint ?? +(s.ramAlloc + Math.max(0.5, 0.2 * s.ramAlloc)).toFixed(2);

/** Memory composition for charts: everything comes from MemAvailable-based host data. */
export function memoryBreakdown(m: MemoryInfo) {
  return { minecraft: m.minecraft, system: m.system, cache: m.cache, available: m.free, used: m.used, total: m.total || 1 };
}

/** Largest -Xmx (GB) that can start for `server` given current host memory. */
export function safeXmxFor(server: Server | undefined, m: MemoryInfo) {
  let safe = m.safeForNew;
  if (server && isActive(server)) safe += footprint(server);
  const xmx = safe >= 3 ? safe / 1.2 : safe - 0.5;
  return Math.max(0, +xmx.toFixed(1));
}

/* ─────────────────────────────── actions (mode facade) ─────────────────────────────── */

export const requestStart = (id: string) => (IS_LIVE ? live.requestStart(id) : mock.requestStart(id));
export const stopServer = (id: string, then?: () => void, quiet = false) => (IS_LIVE ? live.stopServer(id) : mock.stopServer(id, then, quiet));
export const restartServer = (id: string) => (IS_LIVE ? live.restartServer(id) : mock.restartServer(id));
export const resolveConflict = (stopId: string, startId: string) => (IS_LIVE ? live.resolveConflict(stopId, startId) : mock.resolveConflict(stopId, startId));
export const sendCommand = (id: string, raw: string) => (IS_LIVE ? live.sendCommand(id, raw) : mock.sendCommand(id, raw));
export const createBackup = (serverId: string) => (IS_LIVE ? live.createBackup(serverId) : mock.createBackup(serverId));
export const restoreBackup = (serverId: string, archive: string) => (IS_LIVE ? live.restoreBackup(serverId, archive) : mock.restoreBackup(serverId, archive));
/** Opens the restore confirmation dialog; nothing is restored until the user confirms there. */
export const requestRestore = (serverId: string, backupId: string) => S({ restoreRequest: { serverId, backupId } });
export const restartTunnel = () => (IS_LIVE ? live.restartTunnel() : mock.restartTunnel());
export const subscribeConsole = (id: string) => (IS_LIVE ? live.subscribeConsole(id) : () => {});

/** UI-only preferences persist per browser; safetyHeadroom is server-side in live mode. */
export function updateSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  S((st) => ({ settings: { ...st.settings, [k]: v } }));
  if (k === 'compact' || k === 'animations') {
    try {
      const prefs = loadUiPrefs();
      localStorage.setItem(LOCAL_UI_KEY, JSON.stringify({ ...prefs, [k]: v }));
    } catch {
      /* storage unavailable — preference applies to this tab only */
    }
  }
  if (k === 'safetyHeadroom') {
    if (IS_LIVE) live.saveServerSetting('safetyHeadroom', v as number);
    else S((st) => ({ memory: mock.computeMemory(st.servers, st.sys.cache, v as number) }));
  }
}

export function patchServerSettings(id: string, p: Partial<Server>) {
  if (IS_LIVE) return; // instance config lives in root-owned env files; see Settings tab note
  patchServer(id, p);
}

/** Starts the data source: live WebSocket feed or the in-browser simulation. */
export function startDataSource() {
  return IS_LIVE ? live.connect() : mock.startSimulation();
}

export { DATA_MODE };
