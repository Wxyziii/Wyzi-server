/* Shared data models. The backend (backend/app/*.py) returns these shapes; the mock
   simulation produces the same shapes so UI components never care which is active. */

export type ServerStatus = 'running' | 'sleeping' | 'offline' | 'starting' | 'stopping' | 'failed' | 'undeployed';

export interface Player {
  name: string;
  joined: string;
  ping: number | null;
  dimension: string | null;
  op?: boolean;
}

export interface Server {
  id: string;
  name: string;
  desc?: string;
  deployed?: boolean;
  loader: string;
  mc: string;
  mods: number;
  port: number;
  tunnelPort: number;
  publicAddress?: string | null;
  /** -Xmx in GB */
  ramAlloc: number;
  ramMin?: number;
  /** Xmx + JVM native overhead, what the RAM safety model reserves */
  footprint?: number;
  /** process RSS in GB */
  ramUsed: number;
  status: ServerStatus;
  startStep: number;
  players: Player[];
  maxPlayers: number;
  tps: number;
  mspt: number;
  tickSupported?: boolean;
  cpu: number;
  uptime: number;
  wakeOnConnect: boolean;
  autoStop: boolean;
  worldSize: string;
  diskSize: number;
  java: string;
  javaPath?: string;
  jvmFlags?: string;
  heavy?: boolean;
  lastOnline: string;
  enabled?: boolean;
  restarts?: number;
  lastError?: string | null;
  path?: string;
  service?: string;
  rcon?: boolean;
  backup?: { keep: number; keepManual: number; excludes: string };
  whitelist?: string[];
  /** safe subset of server.properties (no secrets) */
  properties?: Record<string, string>;
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
  type: 'Automatic' | 'Manual' | 'Pre-shutdown' | 'Pre-restore' | string;
  status: 'success' | 'failed';
  duration: string;
  note?: string;
  checksum?: 'present' | 'missing';
  bytes?: number;
}

export interface BackupJob {
  serverId: string;
  progress: number;
  step: number;
  type: string;
  kind?: 'backup' | 'restore';
  archive?: string;
}

export type ActivityKind = 'start' | 'stop' | 'backup' | 'network' | 'system' | 'warn' | 'player';
export interface Activity {
  id: number;
  time: string;
  title: string;
  detail?: string | null;
  kind: ActivityKind;
}

export interface Toast {
  id: number;
  title: string;
  desc?: string | null;
  kind: 'success' | 'info' | 'warn' | 'error';
}

export interface LogEntry {
  id: number;
  t: string;
  /** 'system' | 'portal' | 'playit' | 'backup' | <instance id> */
  source: string;
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
  /** GB of MemAvailable kept free (server-side setting in live mode) */
  safetyHeadroom: number;
}

export interface MemoryInfo {
  total: number;
  available: number;
  free: number;
  cache: number;
  minecraft: number;
  system: number;
  used: number;
  headroom: number;
  reservedGrowth: number;
  arkReclaimable: number;
  safeForNew: number;
  swapTotal: number;
  swapUsed: number;
  zram?: { size: number; orig: number; compressed: number } | null;
}

export interface SysMetrics {
  cpu: number;
  temp: number;
  load: [number, number, number];
  cores: number[];
  cache: number;
  freqMhz?: number;
  sensors?: { label: string; value: number }[];
  fans?: { label: string; rpm: number }[];
  disk?: Record<string, { read: number; write: number }>;
  net?: Record<string, { rx: number; tx: number }>;
  netTotals?: { rx: number; tx: number };
  hist: { cpu: number[]; ram: number[]; diskR: number[]; diskW: number[]; netIn: number[]; netOut: number[]; temp: number[] };
}

export interface NetIface {
  name: string;
  kind: 'wifi' | 'ethernet';
  up: boolean;
  carrier: boolean;
  speedMbps: number | null;
  addresses: string[];
  mac: string | null;
}

export interface HostInfo {
  hostname: string;
  os: string;
  osShort: string;
  kernel: string;
  cpuModel: string;
  cpuShort: string;
  cores: number;
  threads: number;
  cpuMaxMhz: number | null;
  memTotal: number;
  bootTime: number;
  uptime: number;
  timezone: string;
  board: string | null;
  gpus: string[];
  java: { path: string; dir: string; version: string; major: string }[];
  defaultIface: string | null;
  gateway: string | null;
  dns: string[];
  interfaces: NetIface[];
  portalPort: number;
  portalVersion: string;
}

export interface PlayitTunnel {
  publicHost: string | null;
  publicPort: number | null;
  publicAddress: string | null;
  copyAddress: string | null;
  localTarget: string | null;
  localPort: number | null;
  state: 'online' | 'idle' | 'offline' | 'disabled';
}

export interface PlayitState {
  /** derived summary used by existing components */
  status: 'connected' | 'reconnecting' | 'offline' | 'unknown';
  latency: number | null;
  since: string;
  service?: string;
  agent?: 'online' | 'connecting' | 'offline' | 'not_paired' | 'unknown';
  tunnel?: 'online' | 'idle' | 'offline' | 'disabled' | 'none' | 'unknown';
  tunnels?: PlayitTunnel[];
  publicAddress?: string | null;
  copyAddress?: string | null;
  localTarget?: string | null;
  version?: string | null;
  updatedAt?: number | null;
  stale?: boolean;
  bridge?: 'ok' | 'missing';
}

export interface DiskInfo {
  name: string;
  model: string;
  sizeBytes: number;
  kind: 'HDD' | 'SSD';
  rpm: number | null;
  smart: {
    available: boolean;
    passed?: boolean | null;
    temp?: number | null;
    powerOnHours?: number | null;
    reallocated?: number | null;
    pending?: number | null;
    uncorrectable?: number | null;
    updatedAt?: number | null;
  };
}

export interface VolumeInfo {
  id: 'system' | 'bulk' | string;
  mount: string;
  role: string;
  device: string | null;
  disk: DiskInfo | null;
  total: number;
  used: number;
  free: number;
  percent: number;
  categories: { label: string; bytes: number; detail: string }[];
}

export interface StorageInfo {
  volumes: VolumeInfo[];
  disks: DiskInfo[];
  mounts: { mount: string; device: string; fs: string; opts: string }[];
  largest: { path: string; bytes: number; volume: string }[];
  measuredAt: number | null;
  smartAvailable: boolean;
}

export interface RamConflict {
  serverId: string;
  required?: number;
  safe?: number;
  shortfall?: number;
  blockers?: string[];
}

export interface Connection {
  mode: 'mock' | 'live';
  state: 'connecting' | 'online' | 'offline';
  error?: string | null;
  lastSeen?: number | null;
  helper?: boolean;
}
