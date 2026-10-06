import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Box, CircuitBoard, Cpu, Download, Gpu, HardDrive, MemoryStick, Package, Power, RefreshCw, RotateCw, Thermometer, Wrench } from 'lucide-react';
import { toast, useApp } from '../lib/store';
import { cx, fmtUptime } from '../lib/format';
import { api } from '../lib/api';
import { IS_LIVE } from '../lib/mode';
import { diskLabel, fetchUpdates, useUpdates, useUptime } from '../lib/hooks';
import { Button } from '../ui/Button';
import { AreaChart, Meter, Num, Ring } from '../ui/Charts';
import { KV, PageHeader, Panel, Reveal } from '../ui/Layout';
import { Badge, Dot } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';
import { MemoryComposition } from './widgets';

type Svc = { name: string; desc: string; state: string; mem: string; since: string };

/** systemd units, read without privileges (systemctl show). */
function useServices(): Svc[] | null {
  const [list, setList] = useState<Svc[] | null>(IS_LIVE ? null : mockServices);
  useEffect(() => {
    if (!IS_LIVE) return;
    let alive = true;
    const load = () =>
      api
        .get<{ name: string; desc: string; state: string; sub: string; memBytes: number | null; since: string | null }[]>('/api/system/services')
        .then((r) =>
          alive &&
          setList(
            r.map((x) => ({
              name: x.name,
              desc: x.desc,
              state: x.name.endsWith('.timer') && x.state === 'active' ? 'waiting' : x.state,
              mem: x.memBytes != null ? (x.memBytes > 1024 ** 3 ? `${(x.memBytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(x.memBytes / 1024 ** 2)} MB`) : '—',
              since: x.since ?? '—',
            })),
          ),
        )
        .catch(() => {});
    load();
    const iv = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, []);
  return list;
}

const mockServices = [
  { name: 'wyzi-agent', desc: 'Portal backend & process supervisor', state: 'active', mem: '84 MB', since: '12d' },
  { name: 'playit', desc: 'Playit.gg tunnel agent', state: 'active', mem: '22 MB', since: '1h 14m' },
  { name: 'wyzi-mc@prominence-ii', desc: 'Minecraft · Prominence II', state: 'active', mem: '7.4 GB', since: '4h 27m' },
  { name: 'wyzi-wake@cobblemon', desc: 'Wake-on-connect listener', state: 'active', mem: '6 MB', since: '15h' },
  { name: 'wyzi-backup.timer', desc: 'Nightly backups · 03:00', state: 'waiting', mem: '—', since: '—' },
  { name: 'smartd', desc: 'Disk health monitoring', state: 'active', mem: '3 MB', since: '12d' },
  { name: 'ssh', desc: 'OpenSSH server (LAN)', state: 'active', mem: '5 MB', since: '12d' },
  { name: 'unattended-upgrades', desc: 'Security updates', state: 'inactive', mem: '—', since: '—' },
];

export function SystemPage() {
  const sys = useApp((s) => s.sys);
  const host = useApp((s) => s.host);
  const memory = useApp((s) => s.memory);
  const storage = useApp((s) => s.storage);
  const uptime = useUptime();
  const services = useServices();
  const upd = useUpdates();
  const updates = upd?.items ?? [];
  const sensors = [
    ...(sys.sensors ?? []).map((x) => ({ k: x.label, v: Math.round(x.value), max: x.label === 'CPU package' ? 100 : 90, icon: x.label === 'GPU' ? Gpu : x.label.startsWith('Chipset') ? CircuitBoard : Cpu })),
    ...(storage?.disks ?? []).filter((d) => d.smart.temp != null).map((d) => ({ k: `${diskLabel(d.sizeBytes)} HDD`, v: d.smart.temp as number, max: 60, icon: HardDrive })),
  ];
  const disks = storage?.disks ?? [];
  const sysDisk = storage?.volumes.find((v) => v.id === 'system')?.disk;
  const bulkDisk = storage?.volumes.find((v) => v.id === 'bulk')?.disk;
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  return (
    <div>
      <Reveal>
        <PageHeader
          title="System"
          actions={
            <>
              {IS_LIVE ? (
                <Tooltip content="Power actions need an admin over SSH (sudo reboot). The portal deliberately has no permission for them.">
                  <span className="flex gap-2">
                    <Button variant="outline" icon={RotateCw} disabled>
                      Reboot
                    </Button>
                    <Button variant="danger" icon={Power} disabled>
                      Shut down
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <>
                  <Button variant="outline" icon={RotateCw} onClick={() => toast('Reboot is disabled in the prototype', 'warn', 'It would stop all running servers')}>
                    Reboot
                  </Button>
                  <Button variant="danger" icon={Power} onClick={() => toast('Shutdown is disabled in the prototype', 'warn')}>
                    Shut down
                  </Button>
                </>
              )}
            </>
          }
        >
          <span className="font-mono text-[11px]">{(host?.hostname ?? '—').toUpperCase()}</span>
          <span className="h-3 w-px bg-line-3" />
          <span>{host?.os ?? '—'}</span>
          <span className="h-3 w-px bg-line-3" />
          <span>Up {fmtUptime(uptime)}</span>
        </PageHeader>
      </Reveal>

      <div className="grid grid-cols-12 gap-4">
        {/* CPU */}
        <Reveal i={1} className="col-span-12 xl:col-span-8">
          <Panel title="Processor" icon={Cpu} meta={host ? `${host.cpuModel.replace(/\(R\)|\(TM\)/g, '').replace(/\s+/g, ' ')} · ${host.cores}C/${host.threads}T${sys.freqMhz ? ` · ${sys.freqMhz} MHz now` : ''}` : undefined} className="h-full">
            <div className="grid gap-6 md:grid-cols-[200px_1fr]">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <Ring value={sys.cpu} size={64} stroke={5} color="auto">
                    <span className="num text-sm font-semibold">{sys.cpu}%</span>
                  </Ring>
                  <div>
                    <div className="text-2xs text-fg-4">Package temp</div>
                    <div className="num text-[20px] font-semibold tracking-tight">
                      <Num value={Math.round(sys.temp)} />
                      <span className="text-sm text-fg-3">°C</span>
                    </div>
                    <div className="text-2xs text-fg-4">TjMax 100°C</div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {sys.cores.map((c, i) => (
                    <div key={i} className="grid grid-cols-[44px_1fr_34px] items-center gap-2 text-xs">
                      <span className="text-fg-3">Core {i}</span>
                      <Meter value={c} tone="auto" height={4} />
                      <span className="num text-right text-fg-2">{c}%</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                  {['1m', '5m', '15m'].map((l, i) => (
                    <div key={l}>
                      <div className="num text-sm font-medium">{sys.load[i].toFixed(2)}</div>
                      <div className="text-2xs text-fg-4">load {l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <AreaChart
                  height={240}
                  series={[
                    { data: sys.hist.cpu, color: 'blue', label: 'Usage %' },
                    { data: sys.hist.temp, color: 'amber', label: 'Temp °C', fill: false, dashed: true },
                  ]}
                  max={100}
                  format={(v) => v.toFixed(0)}
                />
              </div>
            </div>
          </Panel>
        </Reveal>

        <Reveal i={2} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel title="Memory" icon={MemoryStick} meta={`${memory.total.toFixed(1)} GB usable${memory.zram ? ` · zram ${memory.zram.size.toFixed(1)} GB` : ''}`} className="h-full">
            <MemoryComposition showHeadroom={false} />
          </Panel>
        </Reveal>

        {/* hardware */}
        <Reveal i={3} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel title="Hardware" icon={CircuitBoard} bodyClass="px-4 py-1.5" className="h-full">
            <KV k="Board" v={host?.board ?? '—'} />
            <KV k="CPU" v={host ? `${host.cpuShort}${host.cpuMaxMhz ? ` · up to ${(host.cpuMaxMhz / 1000).toFixed(1)} GHz` : ''}` : '—'} />
            <KV k="Memory" v={host ? `${Math.round(host.memTotal)} GB` : '—'} />
            {(host?.gpus ?? []).map((g) => (
              <KV
                key={g}
                k="GPU"
                v={
                  <span className="flex items-center gap-1.5">
                    {g}
                    <Tooltip content="Not used by the server">
                      <Badge tone="neutral">Idle</Badge>
                    </Tooltip>
                  </span>
                }
              />
            ))}
            <KV k="System disk" v={sysDisk ? `${sysDisk.model} · ${diskLabel(sysDisk.sizeBytes)} ${sysDisk.kind}` : '—'} />
            <KV k="Bulk disk" v={bulkDisk ? `${bulkDisk.model} · ${diskLabel(bulkDisk.sizeBytes)} ${bulkDisk.kind}` : '—'} />
            <KV k="Disks" v={`${disks.length} physical · no SSD`} />
          </Panel>
        </Reveal>

        <Reveal i={4} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel title="Sensors" icon={Thermometer} bodyClass="px-4 py-2" className="h-full">
            {sensors.length === 0 && <div className="py-3 text-sm text-fg-4">No sensors reported</div>}
            {sensors.map((t) => (
              <div key={t.k} className="grid grid-cols-[18px_1fr_90px_42px] items-center gap-2 py-[7px] text-sm">
                <t.icon size={13} className="text-fg-4" />
                <span className="text-fg-2">{t.k}</span>
                <Meter value={t.v} max={t.max} tone="auto" height={3} />
                <span className="num text-right text-xs">{t.v}°C</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-2.5 text-xs text-fg-3">
              <span>Fans</span>
              <span className="num">{sys.fans?.length ? sys.fans.map((f) => `${f.label} ${f.rpm.toLocaleString()} rpm`).join(' · ') : 'Not exposed by the board'}</span>
            </div>
          </Panel>
        </Reveal>

        <Reveal i={5} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel title="Software" icon={Box} bodyClass="px-4 py-1.5" className="h-full">
            <KV k="OS" v={host?.osShort ?? '—'} />
            <KV k="Kernel" v={host?.kernel ?? '—'} mono />
            <KV k="Java" v={host ? host.java.map((j) => `OpenJDK ${j.major}`).join(' · ') : '—'} />
            <KV k="Playit agent" v={useApp.getState().playit.version ?? '—'} mono />
            <KV k="Wyzi portal" v={host?.portalVersion ?? '—'} mono />
            <KV k="Timezone" v={host?.timezone ?? '—'} />
          </Panel>
        </Reveal>

        {/* services */}
        <Reveal i={6} className="col-span-12 xl:col-span-7">
          <Panel title="Services" icon={Wrench} meta="systemd units relevant to WYZI" flush>
            {services === null && <div className="px-4 py-4 text-sm text-fg-4">Loading…</div>}
            {(services ?? []).map((s) => (
              <div key={s.name} className="grid grid-cols-[14px_minmax(160px,1fr)_minmax(0,1.3fr)_70px_60px] items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0 hover:bg-white/[0.015] max-md:grid-cols-[14px_1fr_70px]">
                <Dot tone={s.state === 'active' ? 'mint' : s.state === 'waiting' ? 'blue' : s.state === 'failed' ? 'red' : 'neutral'} size={6} />
                <span className="truncate font-mono text-[12px]">{s.name}</span>
                <span className="truncate text-xs text-fg-3 max-md:hidden">{s.desc}</span>
                <span className={cx('text-xs', s.state === 'active' ? 'text-fg-2' : 'text-fg-4')}>{s.state}</span>
                <span className="num text-right text-xs text-fg-3 max-md:hidden">{s.mem}</span>
              </div>
            ))}
          </Panel>
        </Reveal>

        {/* updates */}
        <Reveal i={7} className="col-span-12 xl:col-span-5">
          <Panel
            title="Updates"
            icon={Package}
            meta={installed || (upd && updates.length === 0) ? 'Up to date' : `${updates.length} available`}
            className="h-full"
            flush
            actions={
              <Button
                size="xs"
                variant="ghost"
                icon={RefreshCw}
                loading={checking}
                onClick={async () => {
                  setChecking(true);
                  try {
                    const r = await fetchUpdates(true);
                    toast('Update list re-read', 'success', `${r.items.length} upgradable · lists are refreshed daily by apt`);
                  } catch {
                    toast('Could not read the update list', 'error');
                  } finally {
                    setChecking(false);
                  }
                }}
              >
                Check
              </Button>
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              {installed ? (
                <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center px-6 py-10 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-mint/10 text-mint shadow-[inset_0_0_0_1px_rgba(62,207,142,0.25)]">
                    <Package size={17} />
                  </div>
                  <div className="text-sm font-medium">System is up to date</div>
                  <div className="mt-1 text-xs text-fg-3">Kernel update applies after the next reboot.</div>
                </motion.div>
              ) : (
                <motion.div key="list" exit={{ opacity: 0 }} className="max-h-[360px] overflow-auto">
                  {updates.slice(0, 50).map((u) => (
                    <div key={u.pkg} className="flex items-center gap-3 border-b border-line px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[12px]">{u.pkg}</div>
                        <div className="num font-mono text-[10.5px] text-fg-4">
                          {u.from} → <span className="text-fg-3">{u.to}</span>
                        </div>
                      </div>
                      {u.sec && <Badge tone="amber">Security</Badge>}
                    </div>
                  ))}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex-1 text-xs text-fg-3">
                      {IS_LIVE ? 'Security updates install automatically (unattended-upgrades). Others: sudo apt upgrade over SSH.' : 'Running servers keep running during install.'}
                    </span>
                    {!IS_LIVE && <Button
                      size="sm"
                      variant="primary"
                      icon={Download}
                      loading={installing}
                      onClick={() => {
                        setInstalling(true);
                        setTimeout(() => {
                          setInstalling(false);
                          setInstalled(true);
                          toast('3 packages upgraded', 'success', 'Reboot required for kernel 6.1.0-27');
                        }, 2600);
                      }}
                    >
                      {installing ? 'Installing' : 'Install updates'}
                    </Button>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        </Reveal>
      </div>
    </div>
  );
}
