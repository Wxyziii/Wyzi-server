import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Check, ChevronDown, Download, FileArchive, MoreHorizontal, RotateCcw, Trash2, X } from 'lucide-react';
import { BACKUP_STEPS, createBackup, toast, useApp, type Backup } from '../lib/store';
import { cx } from '../lib/format';
import { Button, IconButton } from '../ui/Button';
import { Meter } from '../ui/Charts';
import { Segmented } from '../ui/Controls';
import { Empty, Monogram, PageHeader, Reveal } from '../ui/Layout';
import { Dropdown, useContextMenu, type MenuItem } from '../ui/Menu';
import { Badge } from '../ui/Status';
import { Tooltip } from '../ui/Tooltip';
import { Spinner } from '../ui/Spinner';

export function Backups() {
  const backups = useApp((s) => s.backups);
  const servers = useApp((s) => s.servers);
  const job = useApp((s) => s.backupJob);
  const [filter, setFilter] = useState<string>('all');
  const list = backups.filter((b) => filter === 'all' || b.serverId === filter);
  const total = backups.filter((b) => b.status === 'success').reduce((a, b) => a + b.size, 0);
  const jobServer = job ? servers.find((s) => s.id === job.serverId) : null;
  const name = (id: string) => servers.find((s) => s.id === id)?.name ?? id;

  return (
    <div>
      <Reveal>
        <PageHeader
          title="Backups"
          actions={
            <Dropdown
              width={240}
              items={[
                { heading: 'Back up server' },
                ...servers.map((s) => ({ label: s.name, hint: `~${(s.diskSize * 0.15).toFixed(1)} GB`, icon: Archive, onSelect: () => createBackup(s.id) })),
              ]}
              trigger={({ onClick }) => (
                <Button variant="primary" icon={job ? undefined : Archive} loading={!!job} iconRight={job ? undefined : ChevronDown} onClick={onClick} disabled={!!job}>
                  {job ? 'Backup running' : 'Create backup'}
                </Button>
              )}
            />
          }
        >
          <span>Stored on 5 TB archive HDD</span>
          <span className="h-3 w-px bg-line-3" />
          <span>zstd · SHA-256 verified</span>
        </PageHeader>
      </Reveal>

      {/* summary strip */}
      <Reveal i={1}>
        <section className="surface grid grid-cols-2 overflow-hidden rounded-xl md:grid-cols-5 md:divide-x md:divide-line">
          <Fig label="Snapshots" value={`${backups.length}`} sub="across 4 servers" />
          <Fig label="Total size" value={`${total.toFixed(1)} GB`} sub="1.4 TB incl. history" />
          <Fig label="Last success" value={backups.find((b) => b.status === 'success')?.when ?? '—'} sub={name(backups.find((b) => b.status === 'success')?.serverId ?? '')} small />
          <Fig label="Next scheduled" value="Tomorrow 03:00" sub="Daily · all running servers" small />
          <Fig label="Retention" value="14 days" sub="Manual backups kept forever" small />
        </section>
      </Reveal>

      {/* active job */}
      <AnimatePresence>
        {job && jobServer && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <section className="surface rounded-xl border-blue/25 p-5">
              <div className="flex flex-wrap items-center gap-4">
                <Monogram name={jobServer.name} size={34} tone="blue" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    Backing up {jobServer.name}
                    <Badge tone="blue">Manual</Badge>
                  </div>
                  <div className="text-xs text-fg-3">
                    /srv/minecraft/{jobServer.id} → /mnt/archive/backups/{jobServer.id}
                  </div>
                </div>
                <div className="num text-[24px] font-semibold tracking-tight">{Math.round(job.progress * 100)}%</div>
              </div>
              <Meter className="mt-4" value={job.progress * 100} tone="blue" height={6} striped />
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-7">
                {BACKUP_STEPS.map((st, i) => {
                  const done = i < job.step;
                  const active = i === job.step;
                  return (
                    <div key={st} className={cx('flex items-center gap-1.5 text-xs transition-colors', done ? 'text-fg-3' : active ? 'text-fg' : 'text-fg-4')}>
                      {done ? <Check size={12} className="text-mint" /> : active ? <Spinner size={12} className="text-blue" /> : <span className="h-2 w-2 rounded-full border border-line-4" />}
                      <span className="truncate">{st}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <Reveal i={2} className="mt-6 mb-3 flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All servers' }, ...servers.map((s) => ({ value: s.id, label: s.name }))]}
        />
      </Reveal>

      <Reveal i={3}>
        <section className="surface overflow-hidden rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs text-fg-4">
                  <th className="py-2 pr-4 pl-5 font-medium">Server</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Size</th>
                  <th className="px-4 py-2 text-right font-medium">Duration</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {list.map((b) => (
                    <BackupRow key={b.id} b={b} name={name(b.serverId)} />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          {list.length === 0 && <Empty icon={FileArchive} title="No backups for this server" desc="Create one from the button above." />}
        </section>
      </Reveal>
    </div>
  );
}

function BackupRow({ b, name }: { b: Backup; name: string }) {
  const items: MenuItem[] = [
    { heading: `${name} · ${b.when}` },
    { label: 'Restore…', icon: RotateCcw, disabled: b.status !== 'success', onSelect: () => toast('Restore is disabled in the prototype', 'info') },
    { label: 'Download archive', icon: Download, disabled: b.status !== 'success', onSelect: () => toast('Downloads are disabled in the prototype', 'info') },
    { separator: true },
    { label: 'Delete backup', icon: Trash2, danger: true, onSelect: () => toast('Deleting backups is disabled in the prototype', 'warn') },
  ];
  const onCtx = useContextMenu(items);
  return (
    <motion.tr
      layout
      initial={{ opacity: 0, backgroundColor: 'rgba(122,162,217,0.08)' }}
      animate={{ opacity: 1, backgroundColor: 'rgba(122,162,217,0)' }}
      transition={{ duration: 1.2 }}
      onContextMenu={onCtx}
      className="group border-b border-line last:border-0 hover:!bg-white/[0.015]"
    >
      <td className="py-2.5 pr-4 pl-5">
        <div className="flex items-center gap-2.5">
          <Monogram name={name} size={24} />
          <div>
            <div className="font-medium">{name}</div>
            {b.note && <div className="text-2xs text-fg-4">{b.note}</div>}
          </div>
        </div>
      </td>
      <td className="px-4">
        <div className="text-fg">{b.when}</div>
        <div className="num font-mono text-[10.5px] text-fg-4">{b.date}</div>
      </td>
      <td className="px-4">
        <Badge tone={b.type === 'Manual' ? 'blue' : b.type === 'Pre-shutdown' ? 'violet' : 'neutral'}>{b.type}</Badge>
      </td>
      <td className="num px-4 text-right">{b.status === 'success' ? `${b.size} GB` : '—'}</td>
      <td className="num px-4 text-right text-fg-3">{b.duration}</td>
      <td className="px-4">
        {b.status === 'success' ? (
          <span className="flex items-center gap-1.5 text-mint">
            <Check size={13} /> Success
          </span>
        ) : (
          <Tooltip content={b.note ?? 'Backup failed'}>
            <span className="flex items-center gap-1.5 text-[#ff8784]">
              <X size={13} /> Failed
            </span>
          </Tooltip>
        )}
      </td>
      <td className="pr-3 text-right">
        <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
          <Tooltip content="Restore">
            <IconButton icon={RotateCcw} label="Restore" size="xs" disabled={b.status !== 'success'} onClick={() => toast('Restore is disabled in the prototype', 'info')} />
          </Tooltip>
          <Dropdown items={items} trigger={({ onClick }) => <IconButton icon={MoreHorizontal} label="More" size="xs" onClick={onClick} />} />
        </div>
      </td>
    </motion.tr>
  );
}

function Fig({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-3.5 max-md:border-b max-md:border-line">
      <div className="text-xs text-fg-3">{label}</div>
      <div className={cx('num mt-1.5 truncate font-semibold tracking-[-0.02em]', small ? 'text-[15px] leading-6' : 'text-[22px] leading-6')}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-2xs text-fg-4">{sub}</div>}
    </div>
  );
}
