/* Mock data for prototype mode (VITE_WYZI_MODE=mock). Shapes match the live backend.
   Host/storage values describe the real machine (i5-7400, 16 GB, 1 TB + 4 TB HDD). */
import { clamp } from './format';
import type { Activity, Backup, ConsoleLine, HostInfo, LineLevel, LogEntry, Server, StorageInfo } from './types';

export const HISTORY = 60;

export const series = (n: number, base: number, amp: number, min = 0, max = Infinity) => {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v = clamp(v + (Math.random() - 0.5) * amp + (base - v) * 0.15, min, max);
    out.push(+v.toFixed(2));
  }
  return out;
};

export const emptyHist = () => ({
  tps: Array(HISTORY).fill(0),
  mspt: Array(HISTORY).fill(0),
  cpu: Array(HISTORY).fill(0),
  ram: Array(HISTORY).fill(0),
  players: Array(HISTORY).fill(0),
});

export const initialServers: Server[] = [
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
    java: 'OpenJDK 17.0.19',
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
    java: 'OpenJDK 17.0.19',
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
    java: 'OpenJDK 21.0.11',
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
    java: 'OpenJDK 17.0.19',
    lastOnline: 'Aug 14',
    hist: emptyHist(),
  },
];

let lid = 1000;
export const L = (t: string, level: LineLevel, text: string, thread = 'Server thread'): ConsoleLine => ({
  id: lid++,
  t,
  thread,
  level,
  text,
});

export const prominenceLog: ConsoleLine[] = [
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

export const initialBackups: Backup[] = [
  { id: 'b1', serverId: 'prominence-ii', when: 'Today, 03:00', date: '2026-10-06 03:00', size: 6.2, type: 'Automatic', status: 'success', duration: '2m 14s' },
  { id: 'b2', serverId: 'cobblemon', when: 'Yesterday, 03:00', date: '2026-10-05 03:00', size: 3.8, type: 'Automatic', status: 'success', duration: '1m 21s' },
  { id: 'b3', serverId: 'prominence-ii', when: 'Yesterday, 03:00', date: '2026-10-05 03:00', size: 6.1, type: 'Automatic', status: 'success', duration: '2m 09s' },
  { id: 'b4', serverId: 'prominence-ii', when: '3 days ago', date: '2026-10-03 21:47', size: 6.0, type: 'Manual', status: 'success', duration: '2m 02s', note: 'Before updating to 2.8.1' },
  { id: 'b5', serverId: 'cobblemon', when: '4 days ago', date: '2026-10-02 23:51', size: 3.7, type: 'Pre-shutdown', status: 'success', duration: '1m 18s' },
  { id: 'b6', serverId: 'vanilla', when: '5 days ago', date: '2026-10-01 03:00', size: 0, type: 'Automatic', status: 'failed', duration: '0m 04s', note: 'Archive volume locked by fsck' },
  { id: 'b7', serverId: 'vanilla', when: '6 days ago', date: '2026-09-30 03:00', size: 1.1, type: 'Automatic', status: 'success', duration: '0m 31s' },
  { id: 'b8', serverId: 'skyfactory', when: 'Aug 14', date: '2026-08-14 19:20', size: 5.4, type: 'Manual', status: 'success', duration: '1m 52s', note: 'Final archive' },
];

export const initialActivity: Activity[] = [
  { id: 6, time: '15:02', title: 'mossbyte joined Prominence II', kind: 'player' },
  { id: 5, time: '14:21', title: 'Prominence II started', detail: 'Ready in 6.8s', kind: 'start' },
  { id: 4, time: '14:17', title: 'Backup completed', detail: 'Prominence II · 6.2 GB', kind: 'backup' },
  { id: 3, time: '13:58', title: 'Playit tunnel reconnected', detail: 'Edge relay eu-west · 29 ms', kind: 'network' },
  { id: 2, time: 'Yesterday', title: 'Cobblemon went to sleep', detail: 'Idle for 10 minutes', kind: 'stop' },
  { id: 1, time: 'Yesterday', title: 'System packages updated', detail: '14 packages · no reboot required', kind: 'system' },
];

export const logSeed: Omit<LogEntry, 'id'>[] = [
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

const GiB = 1024 ** 3;

export const mockHost: HostInfo = {
  hostname: 'marceserver',
  os: 'Ubuntu 24.04.3 LTS',
  osShort: 'Ubuntu 24.04',
  kernel: '6.8.0-136-generic',
  cpuModel: 'Intel(R) Core(TM) i5-7400 CPU @ 3.00GHz',
  cpuShort: 'i5-7400',
  cores: 4,
  threads: 4,
  cpuMaxMhz: 3500,
  memTotal: 15.57,
  bootTime: Date.now() / 1000 - (12 * 86400 + 4 * 3600),
  uptime: 12 * 86400 + 4 * 3600,
  timezone: 'Etc/UTC',
  board: 'LENOVO 36D5',
  gpus: ['NVIDIA (nouveau)'],
  java: [
    { path: '/usr/lib/jvm/java-17-openjdk-amd64/bin/java', dir: 'java-17-openjdk-amd64', version: '17.0.19', major: '17' },
    { path: '/usr/lib/jvm/java-21-openjdk-amd64/bin/java', dir: 'java-21-openjdk-amd64', version: '21.0.11', major: '21' },
    { path: '/usr/lib/jvm/java-25-openjdk-amd64/bin/java', dir: 'java-25-openjdk-amd64', version: '25.0.3', major: '25' },
  ],
  defaultIface: 'wlp3s0',
  gateway: '192.168.1.1',
  dns: ['192.168.1.1'],
  interfaces: [
    { name: 'wlp3s0', kind: 'wifi', up: true, carrier: true, speedMbps: null, addresses: ['192.168.1.2/24'], mac: '58:00:e3:ef:05:e5' },
    { name: 'enp2s0', kind: 'ethernet', up: false, carrier: false, speedMbps: null, addresses: [], mac: 'f4:4d:30:b1:d1:53' },
  ],
  portalPort: 8080,
  portalVersion: 'prototype',
};

const hdd = (name: string, model: string, bytes: number, rpm: number, hours: number, temp: number) => ({
  name,
  model,
  sizeBytes: bytes,
  kind: 'HDD' as const,
  rpm,
  smart: { available: true, passed: true, temp, powerOnHours: hours, reallocated: 0, pending: 0, uncorrectable: 0, updatedAt: null },
});

const sdb = hdd('sdb', 'ST1000DM003-1SB1', 1000.2e9, 7200, 28180, 32);
const sda = hdd('sda', 'ST4000DM004-2U91', 4000.8e9, 5400, 18253, 33);

export const mockStorage: StorageInfo = {
  volumes: [
    {
      id: 'system', mount: '/', role: 'Operating system + active Minecraft instances', device: '/dev/mapper/ubuntu--vg-ubuntu--lv', disk: sdb,
      total: 913 * GiB, used: 165 * GiB, free: 748 * GiB, percent: 18,
      categories: [
        { label: 'Minecraft instances', bytes: 85 * GiB, detail: '/srv/minecraft · 4 instances' },
        { label: 'OS, apps & other data', bytes: 80 * GiB, detail: 'Ubuntu, Java, ARK, HomeOps, home dirs (not itemised)' },
      ],
    },
    {
      id: 'bulk', mount: '/mnt/storage', role: 'Backups · archives · bulk storage', device: '/dev/sda1', disk: sda,
      total: 3666 * GiB, used: 1420 * GiB, free: 2246 * GiB, percent: 39,
      categories: [
        { label: 'Minecraft backups', bytes: 36 * GiB, detail: '/srv/storage/backups/minecraft' },
        { label: 'Other data', bytes: 1384 * GiB, detail: 'Redux data, HomeOps workspace, archives (not itemised)' },
      ],
    },
  ],
  disks: [sda, sdb],
  mounts: [
    { mount: '/', device: '/dev/mapper/ubuntu--vg-ubuntu--lv', fs: 'ext4', opts: 'rw' },
    { mount: '/boot', device: '/dev/sdb2', fs: 'ext4', opts: 'rw' },
    { mount: '/boot/efi', device: '/dev/sdb1', fs: 'vfat', opts: 'rw' },
    { mount: '/mnt/storage', device: '/dev/sda1', fs: 'ext4', opts: 'rw' },
    { mount: '/srv/storage', device: '/dev/sda1', fs: 'ext4', opts: 'bind' },
    { mount: 'swap', device: '/dev/zram0', fs: 'partition', opts: '1.9 GB' },
    { mount: 'swap', device: '/swap.img', fs: 'file', opts: '4.0 GB' },
  ],
  largest: [
    { path: '/srv/minecraft/instances/prominence-ii', bytes: 41.2 * GiB, volume: 'system' },
    { path: '/srv/minecraft/instances/skyfactory', bytes: 22.9 * GiB, volume: 'system' },
    { path: '/srv/minecraft/instances/cobblemon', bytes: 18.7 * GiB, volume: 'system' },
    { path: '/srv/storage/backups/minecraft/prominence-ii', bytes: 24.6 * GiB, volume: 'bulk' },
    { path: '/srv/storage/backups/minecraft/cobblemon', bytes: 11.4 * GiB, volume: 'bulk' },
  ],
  measuredAt: null,
  smartAvailable: true,
};

