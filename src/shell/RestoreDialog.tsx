import { useEffect, useState } from 'react';
import { ArchiveRestore, FolderInput, ShieldAlert, Square } from 'lucide-react';
import { restoreBackup, stopServer, useApp } from '../lib/store';
import { cx } from '../lib/format';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/Controls';
import { Modal } from '../ui/Overlay';
import { Monogram } from '../ui/Layout';
import { Badge, StatusBadge } from '../ui/Status';

/** Restore confirmation. The backend never overwrites a world: the current instance
    directory is moved aside first (wyzi-restore), and the server must be stopped. */
export function RestoreDialog() {
  const req = useApp((s) => s.restoreRequest);
  const servers = useApp((s) => s.servers);
  const backups = useApp((s) => s.backups);
  const job = useApp((s) => s.backupJob);
  const [typed, setTyped] = useState('');
  const close = () => useApp.setState({ restoreRequest: null });
  const server = req ? servers.find((s) => s.id === req.serverId) : undefined;
  const backup = req ? backups.find((b) => b.id === req.backupId) : undefined;
  useEffect(() => setTyped(''), [req?.backupId]);

  const stopped = server?.status === 'offline' || server?.status === 'failed';
  const canRestore = !!server && !!backup && stopped && !job && typed.trim() === server.id;

  return (
    <Modal open={!!server && !!backup} onClose={close} width={520}>
      {server && backup && (
        <>
          <div className="relative px-5 pt-5 pb-4">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-red/[0.05] to-transparent" />
            <div className="relative flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red/10 text-[#ff8784] shadow-[inset_0_0_0_1px_rgba(239,100,97,0.25)]">
                <ArchiveRestore size={18} strokeWidth={1.8} />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Restore {server.name}</h2>
                <p className="mt-0.5 text-sm text-fg-2">
                  The server files are replaced with the contents of this backup. Progress made since <span className="text-fg">{backup.when}</span> will not be in the restored world.
                </p>
              </div>
            </div>
          </div>

          <div className="mx-5 space-y-2.5 rounded-lg border border-line-2 bg-bg-1 p-3.5 text-sm">
            <div className="flex items-center gap-3">
              <Monogram name={server.name} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12px] text-fg">{backup.id}</div>
                <div className="num text-xs text-fg-3">
                  {backup.date} · {backup.size} GB · {backup.type}
                </div>
              </div>
              <Badge tone={backup.checksum === 'missing' ? 'amber' : 'neutral'}>{backup.checksum === 'missing' ? 'No checksum' : 'SHA-256'}</Badge>
            </div>
            <div className="flex items-start gap-2.5 border-t border-line-2 pt-2.5 text-xs text-fg-3">
              <FolderInput size={13} className="mt-0.5 shrink-0" />
              <span>
                Nothing is deleted. The current files are moved to{' '}
                <span className="font-mono text-fg-2">{(server.path ?? `/srv/minecraft/instances/${server.id}`).replace(/\/[^/]+$/, '')}/.{server.id}.pre-restore-&lt;time&gt;</span> and the checksum is verified before extracting.
              </span>
            </div>
          </div>

          {!stopped && (
            <div className="mx-5 mt-3 flex items-center gap-3 rounded-lg border border-amber/25 bg-amber/[0.06] px-3 py-2.5">
              <ShieldAlert size={15} className="shrink-0 text-amber" />
              <div className="flex-1 text-xs text-amber">
                {server.name} is <StatusBadge status={server.status} className="mx-0.5 align-middle" /> — stop it before restoring.
              </div>
              {server.status === 'running' && (
                <Button size="xs" variant="secondary" icon={Square} onClick={() => stopServer(server.id)}>
                  Stop
                </Button>
              )}
            </div>
          )}

          <div className="mx-5 mt-4">
            <label className="text-xs text-fg-3">
              Type <span className="font-mono text-fg">{server.id}</span> to confirm
            </label>
            <TextInput mono icon={null} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={server.id} className="mt-1.5 w-full" />
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-line-2 bg-s-1 px-5 py-3">
            {job && <span className="mr-auto text-xs text-fg-3">Waiting for the running {job.kind ?? 'backup'} job…</span>}
            <Button variant="ghost" size="md" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              icon={ArchiveRestore}
              disabled={!canRestore}
              className={cx(!canRestore && 'opacity-60')}
              onClick={() => {
                restoreBackup(server.id, backup.id);
                close();
              }}
            >
              Restore backup
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
