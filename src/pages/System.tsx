import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Box, CircuitBoard, Cpu, Download, Gpu, HardDrive, MemoryStick, Package, Power, RefreshCw, RotateCw, Thermometer, Wrench } from 'lucide-react';
import { toast, useApp } from '../lib/store';
import { cx } from '../lib/format';
import { Button } from '../ui/Button';
import { AreaChart, Meter, Num, Ring } from '../ui/Charts';
import { KV, PageHeader, Panel, Reveal } from '../ui/Layout';
import { Badge, Dot } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';
import { MemoryComposition } from './widgets';

const services = [
  { name: 'wyzi-agent', desc: 'Portal backend & process supervisor', state: 'active', mem: '84 MB', since: '12d' },
  { name: 'playit', desc: 'Playit.gg tunnel agent', state: 'active', mem: '22 MB', since: '1h 14m' },
  { name: 'wyzi-mc@prominence-ii', desc: 'Minecraft · Prominence II', state: 'active', mem: '7.4 GB', since: '4h 27m' },
  { name: 'wyzi-wake@cobblemon', desc: 'Wake-on-connect listener', state: 'active', mem: '6 MB', since: '15h' },
  { name: 'wyzi-backup.timer', desc: 'Nightly backups · 03:00', state: 'waiting', mem: '—', since: '—' },
  { name: 'smartd', desc: 'Disk health monitoring', state: 'active', mem: '3 MB', since: '12d' },
  { name: 'ssh', desc: 'OpenSSH server (LAN)', state: 'active', mem: '5 MB', since: '12d' },
  { name: 'unattended-upgrades', desc: 'Security updates', state: 'inactive', mem: '—', since: '—' },
];

const updates = [
  { pkg: 'linux-image-6.1.0-27-amd64', from: '6.1.0-26', to: '6.1.0-27', sec: true },
  { pkg: 'openjdk-17-jre-headless', from: '17.0.12+7', to: '17.0.13+11', sec: true },
  { pkg: 'curl', from: '7.88.1-10+deb12u7', to: '7.88.1-10+deb12u8', sec: false },
];

export function SystemPage() {
  const sys = useApp((s) => s.sys);
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
              <Button variant="outline" icon={RotateCw} onClick={() => toast('Reboot is disabled in the prototype', 'warn', 'It would stop all running servers')}>
                Reboot
              </Button>
              <Button variant="danger" icon={Power} onClick={() => toast('Shutdown is disabled in the prototype', 'warn')}>
                Shut down
              </Button>
            </>
          }
        >
          <span className="font-mono text-[11px]">WYZI-SERVER</span>
          <span className="h-3 w-px bg-line-3" />
          <span>Debian GNU/Linux 12 (bookworm)</span>
          <span className="h-3 w-px bg-line-3" />
          <span>Up 12d 4h</span>
        </PageHeader>
      </Reveal>

      <div className="grid grid-cols-12 gap-4">
        {/* CPU */}
        <Reveal i={1} className="col-span-12 xl:col-span-8">
          <Panel title="Processor" icon={Cpu} meta="Intel Core i5-6500 · 4C/4T · Skylake" className="h-full">
            <div className="grid gap-6 md:grid-cols-[200px_1fr]">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <Ring value={sys.cpu} size={64} stroke={5} color="auto">
                    <span className="num text-sm font-semibold">{sys.cpu}%</span>
                  </Ring>
                  <div>
                    <div className="text-2xs text-fg-4">Package temp</div>
                    <div className="num text-[20px] font-semibold tracking-tight">
                      <Num value={sys.temp} />
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
          <Panel title="Memory" icon={MemoryStick} meta="2 × 8 GB DDR4-2133" className="h-full">
            <MemoryComposition showHeadroom={false} />
          </Panel>
        </Reveal>

        {/* hardware */}
        <Reveal i={3} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel title="Hardware" icon={CircuitBoard} bodyClass="px-4 py-1.5" className="h-full">
            <KV k="Board" v="ASUS H110M-K" />
            <KV k="CPU" v="i5-6500 @ 3.2 GHz" />
            <KV k="Memory" v="16 GB DDR4 (2/2 slots)" />
            <KV
              k="GPU"
              v={
                <span className="flex items-center gap-1.5">
                  GTX 1070 Ti
                  <Tooltip content="Unused by the server — removal planned to save ~15 W">
                    <Badge tone="amber">Removal planned</Badge>
                  </Tooltip>
                </span>
              }
            />
            <KV k="System disk" v="Samsung 860 EVO 500 GB" />
            <KV k="Archive disk" v="WD Blue 5 TB" />
            <KV k="Power draw" v="~48 W idle · ~95 W load" />
          </Panel>
        </Reveal>

        <Reveal i={4} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel title="Sensors" icon={Thermometer} bodyClass="px-4 py-2" className="h-full">
            {[
              { k: 'CPU package', v: sys.temp, max: 100, icon: Cpu },
              { k: 'GPU core', v: 34, max: 90, icon: Gpu },
              { k: 'SSD', v: 31, max: 70, icon: HardDrive },
              { k: 'HDD', v: 34, max: 60, icon: HardDrive },
              { k: 'Chipset', v: 41, max: 90, icon: CircuitBoard },
            ].map((t) => (
              <div key={t.k} className="grid grid-cols-[18px_1fr_90px_42px] items-center gap-2 py-[7px] text-sm">
                <t.icon size={13} className="text-fg-4" />
                <span className="text-fg-2">{t.k}</span>
                <Meter value={t.v} max={t.max} tone="auto" height={3} />
                <span className="num text-right text-xs">{t.v}°C</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-2.5 text-xs text-fg-3">
              <span>Fans</span>
              <span className="num">CPU 1,140 rpm · Case 820 rpm</span>
            </div>
          </Panel>
        </Reveal>

        <Reveal i={5} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel title="Software" icon={Box} bodyClass="px-4 py-1.5" className="h-full">
            <KV k="OS" v="Debian 12.7" />
            <KV k="Kernel" v="6.1.0-26-amd64" mono />
            <KV k="Java" v="Temurin 8 · 17 · 21" />
            <KV k="Playit agent" v="0.15.13" mono />
            <KV k="WYZI agent" v="0.1.0-prototype" mono />
            <KV k="Timezone" v="Europe/Warsaw" />
          </Panel>
        </Reveal>

        {/* services */}
        <Reveal i={6} className="col-span-12 xl:col-span-7">
          <Panel title="Services" icon={Wrench} meta="systemd units managed by WYZI" flush>
            {services.map((s) => (
              <div key={s.name} className="grid grid-cols-[14px_minmax(160px,1fr)_minmax(0,1.3fr)_70px_60px] items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0 hover:bg-white/[0.015] max-md:grid-cols-[14px_1fr_70px]">
                <Dot tone={s.state === 'active' ? 'mint' : s.state === 'waiting' ? 'blue' : 'neutral'} size={6} />
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
            meta={installed ? 'Up to date' : `${updates.length} available`}
            className="h-full"
            flush
            actions={
              <Button
                size="xs"
                variant="ghost"
                icon={RefreshCw}
                loading={checking}
                onClick={() => {
                  setChecking(true);
                  setTimeout(() => {
                    setChecking(false);
                    toast('Package lists refreshed', 'success', installed ? 'No updates available' : `${updates.length} updates available`);
                  }, 1400);
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
                <motion.div key="list" exit={{ opacity: 0 }}>
                  {updates.map((u) => (
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
                    <span className="flex-1 text-xs text-fg-3">Running servers keep running during install.</span>
                    <Button
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
                    </Button>
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
