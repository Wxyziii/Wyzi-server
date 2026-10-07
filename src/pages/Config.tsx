import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useApp } from '../lib/store';
import { Select } from '../ui/Controls';
import { Empty, PageHeader, Reveal } from '../ui/Layout';
import { StatusBadge } from '../ui/Status';
import { GameplayTab } from './detail/Gameplay';

/** Gameplay values (quests, achievements, prices, starter) of every server running the POKÉ PORTAL mod. */
export function ConfigPage() {
  const all = useApp((s) => s.servers);
  const servers = all.filter((s) => s.modConfig);
  const [id, setId] = useState<string>(() => {
    try {
      return localStorage.getItem('wyzi.config.server') ?? '';
    } catch {
      return '';
    }
  });
  const current = servers.find((s) => s.id === id) ?? servers[0];
  useEffect(() => {
    if (!current) return;
    try {
      localStorage.setItem('wyzi.config.server', current.id);
    } catch {
      /* private mode */
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <Reveal>
        <PageHeader
          title="Config"
          actions={
            servers.length > 1 && current ? (
              <Select value={current.id} onChange={setId} options={servers.map((s) => ({ value: s.id, label: s.name }))} width={200} />
            ) : null
          }
        >
          {current ? (
            <>
              <span>{current.name}</span>
              <StatusBadge status={current.status} />
              <span className="text-fg-4">· changes apply live, no restart needed</span>
            </>
          ) : (
            'Quests, achievements, prices and the starter kit'
          )}
        </PageHeader>
      </Reveal>
      {current ? (
        <GameplayTab s={current} />
      ) : (
        <div className="surface rounded-xl">
          <Empty icon={SlidersHorizontal} title="No configurable server" desc="Servers running the POKÉ PORTAL mod appear here after their first start." />
        </div>
      )}
    </div>
  );
}
