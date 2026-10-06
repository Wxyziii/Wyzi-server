/* Prototype simulation (VITE_WYZI_MODE=mock). Nothing here touches a real machine.
   Moved from the original store.ts; memory now uses the same model as the backend. */
import { clamp, hhmm, jitter } from './format';
import {
  BACKUP_STEPS,
  footprint,
  isActive,
  patchServer,
  pushActivity,
  pushConsole,
  pushLog,
  serverById,
  toast,
  useApp,
  type LineLevel,
  type MemoryInfo,
  type Server,
  type ServerStatus,
} from './store';

const TOTAL_RAM = 15.57;
const SYSTEM_RAM = 1.3;
const STARTUP_DURATIONS = [650, 800, 1000, 1700, 850];

// accessed lazily: this module is imported by store.ts while it initialises
const S: typeof useApp.setState = (p) => useApp.setState(p);
const G = () => useApp.getState();

const timers: number[] = [];
const later = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms));
};
let uid = 5_000_000;

/** Same model as backend/app/memory.py, fed by simulated numbers. */
export function computeMemory(servers: Server[], cache: number, headroom: number): MemoryInfo {
  const minecraft = servers.reduce((a, s) => a + (isActive(s) ? s.ramUsed : 0), 0);
  const free = Math.max(0, TOTAL_RAM - minecraft - SYSTEM_RAM - cache);
  const available = free + cache * 0.85;
  const growth = servers.filter(isActive).reduce((a, s) => a + Math.max(0, footprint(s) - s.ramUsed), 0);
  return {
    total: TOTAL_RAM,
    available,
    free,
    cache,
    minecraft,
    system: SYSTEM_RAM,
    used: minecraft + SYSTEM_RAM,
    headroom,
    reservedGrowth: growth,
    arkReclaimable: 0,
    safeForNew: Math.max(0, +(available - headroom - growth).toFixed(1)),
    swapTotal: 5.9,
    swapUsed: 0,
    zram: { size: 1.9, orig: 0, compressed: 0 },
  };
}

function checkStart(target: Server, stopFirst: string[] = []) {
  const st = G();
  const keep = st.servers.filter((s) => isActive(s) && s.id !== target.id && !stopFirst.includes(s.id));
  const freed = st.servers.filter((s) => stopFirst.includes(s.id)).reduce((a, s) => a + s.ramUsed, 0);
  const growth = keep.reduce((a, s) => a + Math.max(0, footprint(s) - s.ramUsed), 0);
  const safe = Math.max(0, +(st.memory.available + freed - st.settings.safetyHeadroom - growth).toFixed(1));
  const required = footprint(target);
  return {
    ok: required <= safe,
    required,
    safe,
    shortfall: +Math.max(0, required - safe).toFixed(1),
    blockers: keep.sort((a, b) => b.ramAlloc - a.ramAlloc).map((s) => s.id),
  };
}

export function requestStart(id: string) {
  const srv = serverById(id);
  if (!srv || isActive(srv)) return;
  const check = checkStart(srv);
  if (!check.ok) {
    S({ ramConflict: { serverId: id, ...check } });
    pushLog('portal', 'warn', `start blocked: ${id} needs ${check.required}GiB, ${check.safe}GiB safely available`);
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
    [['sys', `Memory check passed · ${G().memory.safeForNew} GB safely available`, 'wyzi-agent']],
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
        toast('Backup completed', 'success', `${srv.name} · ${size} GB written to /srv/storage`);
      });
    }
  }, tick);
}

export function restoreBackup(serverId: string, archive: string) {
  const srv = serverById(serverId);
  toast('Restore simulated', 'info', `${srv?.name ?? serverId} · ${archive} — prototype mode, no files changed`);
}

export function restartTunnel() {
  if (G().playit.status === 'reconnecting') return;
  S((st) => ({ playit: { ...st.playit, status: 'reconnecting' } }));
  pushLog('playit', 'info', 'agent restart requested from portal');
  later(1100, () => pushLog('playit', 'info', 'reconnecting to relay eu-west-2.playit.gg'));
  later(2600, () => {
    const lat = Math.round(24 + Math.random() * 10);
    S({ playit: { ...G().playit, status: 'connected', latency: lat, since: hhmm() } });
    pushLog('playit', 'info', `tunnel established latency=${lat}ms`);
    pushActivity('Playit tunnel reconnected', 'network', `Edge relay eu-west · ${lat} ms`);
    toast('Tunnel reconnected', 'success', `Latency ${lat} ms via eu-west`);
  });
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
      const mem = computeMemory(servers, cache, st.settings.safetyHeadroom);
      const ld = st.sys.load;
      const load1 = clamp(ld[0] + (cpu / 25 - ld[0]) * 0.1, 0.1, 4);
      return {
        servers,
        memory: mem,
        sys: {
          ...st.sys,
          cpu: Math.round(cpu),
          temp: Math.round(temp),
          cores,
          cache,
          load: [+load1.toFixed(2), +(ld[1] + (load1 - ld[1]) * 0.03).toFixed(2), +(ld[2] + (load1 - ld[2]) * 0.01).toFixed(2)],
          hist: {
            cpu: push(st.sys.hist.cpu, cpu),
            ram: push(st.sys.hist.ram, mem.used),
            diskR: push(st.sys.hist.diskR, clamp(Math.random() < 0.12 ? 30 + Math.random() * 60 : Math.random() * 9, 0, 120)),
            diskW: push(st.sys.hist.diskW, st.backupJob ? 80 + Math.random() * 40 : Math.random() < 0.1 ? 20 + Math.random() * 30 : Math.random() * 6),
            netIn: push(st.sys.hist.netIn, jitter(0.2 + servers.filter((s) => s.status === 'running').length * 0.25, 0.2, 0.02, 4)),
            netOut: push(st.sys.hist.netOut, jitter(0.3 + servers.reduce((a, s) => a + s.players.length, 0) * 0.28, 0.35, 0.05, 5)),
            temp: push(st.sys.hist.temp, temp),
          },
        },
        playit: st.playit.status === 'connected' ? { ...st.playit, latency: Math.round(jitter(st.playit.latency ?? 29, 2, 22, 40)) } : st.playit,
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
    if (Math.random() < 0.4) pushLog('system', 'debug', `metrics sample ok (${Math.round(8 + Math.random() * 6)}ms)`);
  }, 9000);

  return () => {
    window.clearInterval(iv);
    window.clearInterval(iv2);
  };
}
