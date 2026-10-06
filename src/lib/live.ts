/* Live data source: REST snapshot + WebSocket stream from the FastAPI backend.
   Never invents data: if the backend is unreachable the store's `conn` says so. */
import { api, ApiError, enc } from './api';
import { appendConsole, pushConsole, serverById, toast, useApp } from './store';
import type { Activity, Backup, BackupJob, ConsoleLine, LogEntry, PlayitState, Server, StorageInfo } from './types';

// accessed lazily: this module is imported by store.ts while it initialises
const S: typeof useApp.setState = (p) => useApp.setState(p);
const G = () => useApp.getState();

let ws: WebSocket | null = null;
let retry = 0;
const consoleSubs = new Map<string, number>();

/* ───────────── mapping backend → store ───────────── */

function mapPlayit(p: any): PlayitState {
  if (!p) return { status: 'unknown', latency: null, since: '—' };
  const status: PlayitState['status'] =
    p.agent === 'online' ? 'connected' : p.agent === 'connecting' ? 'reconnecting' : p.service !== 'running' || p.agent === 'offline' ? 'offline' : 'unknown';
  const since = typeof p.serviceSince === 'string' ? (p.serviceSince.match(/\d{2}:\d{2}/)?.[0] ?? '—') : '—';
  return {
    status,
    latency: p.latencyMs ?? null,
    since,
    service: p.service,
    agent: p.agent,
    tunnel: p.tunnel,
    tunnels: p.tunnels ?? [],
    publicAddress: p.publicAddress,
    copyAddress: p.copyAddress,
    localTarget: p.localTarget,
    version: p.version,
    updatedAt: p.updatedAt,
    stale: p.stale,
    bridge: p.bridge,
  };
}

const zeros = () => Array(60).fill(0);

/** Planned (undeployed) instances come back as stubs; give them safe defaults. */
function normalizeServer(x: any): Server {
  if (x.deployed !== false) return x as Server;
  return {
    loader: 'Not deployed', mc: '—', mods: 0, port: 0, tunnelPort: 0, ramAlloc: 0, ramUsed: 0, startStep: 0, players: [],
    maxPlayers: 0, tps: 0, mspt: 0, cpu: 0, uptime: 0, wakeOnConnect: false, autoStop: false, worldSize: '—', diskSize: 0,
    java: '—', lastOnline: 'Never', hist: { tps: zeros(), mspt: zeros(), cpu: zeros(), ram: zeros(), players: zeros() },
    ...x,
  } as Server;
}

function applyTick(d: any) {
  const prev = G();
  S({
    servers: (d.servers as any[]).map(normalizeServer),
    memory: d.memory,
    sys: { ...prev.sys, ...d.sys, cache: d.memory?.cache ?? prev.sys.cache, temp: d.sys?.temp ?? 0 },
    playit: mapPlayit(d.playit),
    backupJob: (d.backupJob as BackupJob | null) ?? null,
    conn: { ...prev.conn, state: 'online', error: null, lastSeen: Date.now() },
  });
}

async function loadSnapshot() {
  const st = await api.get<any>('/api/state');
  applyTick(st);
  S((cur) => ({
    host: st.host,
    storage: st.storage as StorageInfo,
    backups: st.backups as Backup[],
    activity: st.activity as Activity[],
    logs: st.logs as LogEntry[],
    settings: { ...cur.settings, safetyHeadroom: st.settings?.safetyHeadroom ?? cur.settings.safetyHeadroom },
    conn: { ...cur.conn, helper: st.capabilities?.helper ?? false },
  }));
  void refreshBackups();
}

export async function refreshBackups() {
  try {
    const b = await api.get<any>('/api/backups');
    S({ backups: b.backups, backupSchedule: b.schedule ?? {} });
  } catch {
    /* connection state is handled by the socket */
  }
}

export async function refreshStorage() {
  try {
    S({ storage: await api.get<StorageInfo>('/api/storage') });
  } catch {
    /* ignore */
  }
}

/* ───────────── socket ───────────── */

function sendSubs() {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'console', ids: [...consoleSubs.keys()] }));
}

function onMessage(ev: MessageEvent) {
  let m: any;
  try {
    m = JSON.parse(ev.data);
  } catch {
    return;
  }
  switch (m.type) {
    case 'tick':
      applyTick(m);
      break;
    case 'console':
      appendConsole(m.id, m.lines as ConsoleLine[], !!m.reset);
      break;
    case 'activity':
      S((st) => ({ activity: [m.activity, ...st.activity.filter((a) => a.id !== m.activity.id)].slice(0, 40) }));
      break;
    case 'log':
      S((st) => ({ logs: [...st.logs, m.entry].slice(-800) }));
      break;
    case 'toast':
      toast(m.toast.title, m.toast.kind, m.toast.desc);
      break;
    case 'backups':
      S({ backups: m.backups, backupJob: m.job });
      void refreshBackups();
      void refreshStorage();
      break;
    case 'storage':
      S({ storage: m.storage });
      break;
  }
}

let generation = 0;

function open() {
  const gen = generation;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = new WebSocket(`${proto}://${location.host}/api/ws`);
  ws = sock;
  sock.onopen = () => {
    if (gen !== generation) return sock.close();
    retry = 0;
    sendSubs();
    loadSnapshot().catch(() => {});
  };
  sock.onmessage = (ev) => gen === generation && onMessage(ev);
  sock.onclose = () => {
    // only the current socket of the current connect() may change connection state
    if (gen !== generation || ws !== sock) return;
    ws = null;
    S((st) => ({ conn: { ...st.conn, state: 'offline', error: 'Connection to the server was lost' } }));
    const delay = Math.min(15000, 1000 * 2 ** retry++);
    window.setTimeout(() => gen === generation && open(), delay);
  };
}

export function connect() {
  const gen = ++generation;
  loadSnapshot().catch((e: Error) => gen === generation && S((st) => ({ conn: { ...st.conn, state: 'offline', error: e.message } })));
  open();
  const iv = window.setInterval(refreshBackups, 30000);
  return () => {
    generation++; // invalidates this connection's socket and retry timers (StrictMode runs effects twice)
    window.clearInterval(iv);
    ws?.close();
    ws = null;
  };
}

export function subscribeConsole(id: string) {
  consoleSubs.set(id, (consoleSubs.get(id) ?? 0) + 1);
  sendSubs();
  return () => {
    const n = (consoleSubs.get(id) ?? 1) - 1;
    if (n <= 0) consoleSubs.delete(id);
    else consoleSubs.set(id, n);
    sendSubs();
  };
}

/* ───────────── actions ───────────── */

function fail(title: string, e: unknown) {
  const msg = e instanceof ApiError ? e.message : 'The server could not be reached';
  toast(title, 'error', msg);
}

export async function requestStart(id: string, stopFirst: string[] = []) {
  const srv = serverById(id);
  try {
    await api.post(`/api/instances/${enc(id)}/start`, { stop_first: stopFirst });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.body?.code === 'insufficient_memory') {
      S({ ramConflict: { serverId: id, required: e.body.required, safe: e.body.safe, shortfall: e.body.shortfall, blockers: e.body.blockers } });
      return;
    }
    fail(`Could not start ${srv?.name ?? id}`, e);
  }
}

export async function stopServer(id: string) {
  try {
    await api.post(`/api/instances/${enc(id)}/stop`);
  } catch (e) {
    fail(`Could not stop ${serverById(id)?.name ?? id}`, e);
  }
}

export async function restartServer(id: string) {
  const srv = serverById(id);
  if (srv && srv.status !== 'running') return requestStart(id);
  try {
    await api.post(`/api/instances/${enc(id)}/restart`);
  } catch (e) {
    fail(`Could not restart ${srv?.name ?? id}`, e);
  }
}

export async function resolveConflict(stopId: string, startId: string) {
  S({ ramConflict: null });
  const a = serverById(stopId);
  const b = serverById(startId);
  toast(`Switching to ${b?.name ?? startId}`, 'info', `Stopping ${a?.name ?? stopId} first`);
  await requestStart(startId, [stopId]);
}

export async function sendCommand(id: string, raw: string) {
  if (!raw.trim()) return;
  try {
    await api.post(`/api/instances/${enc(id)}/command`, { command: raw });
  } catch (e) {
    pushConsole(id, 'error', e instanceof ApiError ? e.message : 'Command could not be sent', 'wyzi-portal');
  }
}

export async function createBackup(serverId: string) {
  try {
    await api.post(`/api/instances/${enc(serverId)}/backups`);
  } catch (e) {
    fail('Backup could not start', e);
  }
}

export async function restoreBackup(serverId: string, archive: string) {
  try {
    await api.post(`/api/instances/${enc(serverId)}/backups/${enc(archive)}/restore`, { confirm: serverId });
    toast('Restore started', 'info', archive);
  } catch (e) {
    fail('Restore could not start', e);
  }
}

export async function restartTunnel() {
  S((st) => ({ playit: { ...st.playit, status: 'reconnecting' } }));
  try {
    await api.post('/api/playit/restart');
    toast('Playit agent restarted', 'success', 'Status refreshes within 30 seconds');
  } catch (e) {
    fail('Could not restart the tunnel', e);
  }
}

export async function saveServerSetting(key: 'safetyHeadroom', value: number) {
  try {
    await api.put('/api/settings', { [key]: value });
  } catch (e) {
    fail('Setting was not saved', e);
  }
}
