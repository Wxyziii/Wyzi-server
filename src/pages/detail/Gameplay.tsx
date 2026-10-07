import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, ChevronRight, Coins, Copy, FileJson, Plus, RotateCcw, Save, Scroll, Sparkles, Trash2, Trophy, TriangleAlert, Wand2 } from 'lucide-react';
import { api, ApiError, enc } from '../../lib/api';
import { toast, type Server } from '../../lib/store';
import { cx } from '../../lib/format';
import { Button, IconButton } from '../../ui/Button';
import { Segmented, Select, Stepper, Switch, TextInput } from '../../ui/Controls';
import { Empty, Panel } from '../../ui/Layout';
import { Badge } from '../../ui/Status';
import { Tooltip } from '../../ui/Tooltip';
import { Row, SettingsGroup } from './Tabs';

/* POKÉ PORTAL gameplay configuration (config/wyzi-poke-portal/*.json on the server).
   Every save is applied live with `/poke reload`; the mod validates each file and keeps the
   previous valid settings when a file is rejected. */

type FileName = 'quests.json' | 'achievements.json' | 'portal.json' | 'starter.json' | 'spawn_boosts.json' | 'legendary_shop.json' | 'gym_tiers.json';
type SaveResult = { applied: boolean; ok?: boolean; results: Record<string, string>; message: string };

function useModFile<T>(server: Server, name: FileName) {
  const [data, setData] = useState<T | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const load = () =>
    api
      .get<T>(`/api/instances/${enc(server.id)}/modconfig/${name}`)
      .then((d) => {
        setData(d);
        setOriginal(JSON.stringify(d));
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, [server.id, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = data !== null && JSON.stringify(data) !== original;
  const save = async (value: T | null = data) => {
    if (value === null) return;
    setSaving(true);
    try {
      const r = await api.put<SaveResult>(`/api/instances/${enc(server.id)}/modconfig/${name}`, value);
      setResult(r);
      setData(value);
      setOriginal(JSON.stringify(value));
      const fileStatus = r.results?.[name];
      if (fileStatus && fileStatus !== 'ok') toast('Saved, but the server rejected it', 'error', fileStatus.replace(/^error: /, ''));
      else toast(r.applied ? 'Saved and applied live' : 'Saved', 'success', r.applied ? 'No restart needed' : r.message);
    } catch (e) {
      toast('Not saved', 'error', e instanceof ApiError ? e.message : 'The server could not be reached');
    } finally {
      setSaving(false);
    }
  };
  const reset = () => original && setData(JSON.parse(original));
  return { data, setData, dirty, saving, save, reset, error, result, reload: load };
}

function SaveBar({ dirty, saving, onSave, onReset, label }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void; label: string }) {
  return (
    <AnimatePresence>
      {dirty && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="glass sticky bottom-4 z-10 mt-4 flex items-center gap-3 rounded-lg px-4 py-2.5"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber" />
          <span className="flex-1 text-sm text-fg-2">Unsaved changes to {label} · applied live when saved</span>
          <Button size="sm" variant="ghost" onClick={onReset}>
            Discard
          </Button>
          <Button size="sm" variant="primary" icon={Save} loading={saving} onClick={onSave}>
            Save & apply
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ResultNote({ result, name }: { result: SaveResult | null; name: FileName }) {
  if (!result) return null;
  const s = result.results?.[name];
  const ok = !s || s === 'ok';
  return (
    <div className={cx('mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs', ok ? 'bg-mint/[0.06] text-mint' : 'bg-red/[0.07] text-[#ff8784]')}>
      {ok ? <Check size={13} className="mt-0.5 shrink-0" /> : <TriangleAlert size={13} className="mt-0.5 shrink-0" />}
      <span>{ok ? result.message : `Rejected by the server — previous settings stay active: ${s!.replace(/^error: /, '')}`}</span>
    </div>
  );
}

function LoadState({ error }: { error: string | null }) {
  return error ? <Empty icon={TriangleAlert} title="Cannot load this file" desc={error} /> : <div className="px-5 py-6 text-sm text-fg-4">Loading…</div>;
}

const money = (v: string) => (/^\d+$/.test(v) ? Number(v).toLocaleString() : v);
const digits = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 12);

/* ═════════════════════ QUESTS & ACHIEVEMENTS ═════════════════════ */

type Definition = {
  id: string;
  title: string;
  description: string;
  type: string;
  filters: Record<string, string>;
  target: number;
  reward: string;
  repeat: string;
  category: string;
};
type ObjectiveFile = { enabled: boolean; dailyCount: number; dailyBonus: string; definitions: Definition[] };

const TYPES: { value: string; label: string; needs?: string }[] = [
  { value: 'defeat_pokemon', label: 'Defeat Pokémon' },
  { value: 'catch_pokemon', label: 'Catch Pokémon' },
  { value: 'catch_type', label: 'Catch a type', needs: 'pokemon_type' },
  { value: 'catch_species', label: 'Catch a species', needs: 'species' },
  { value: 'catch_shiny', label: 'Catch a shiny' },
  { value: 'catch_iv_threshold', label: 'Catch with IV ≥ %', needs: 'minimum_iv_percent' },
  { value: 'catch_distinct_species', label: 'Catch different species' },
  { value: 'catch_distinct_types', label: 'Catch different types' },
  { value: 'defeat_trainer', label: 'Defeat trainers' },
  { value: 'reach_pokemon_level', label: 'Reach Pokémon level' },
  { value: 'gym_victory', label: 'Win gym battles' },
  { value: 'region_completion', label: 'Complete a region', needs: 'region' },
  { value: 'minecraft_advancement', label: 'Minecraft advancement', needs: 'advancement' },
  { value: 'minecraft_item_obtained', label: 'Obtain an item', needs: 'item' },
  { value: 'enter_dimension', label: 'Enter a dimension', needs: 'dimension' },
  { value: 'kill_entity', label: 'Kill an entity', needs: 'entity' },
];
const FILTERS = ['pokemon_type', 'species', 'minimum_iv_percent', 'item', 'advancement', 'dimension', 'gym', 'region', 'entity', 'distinct'];
const POKEMON_TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh'];
const CATEGORIES = ['minecraft', 'pokemon', 'exploration', 'combat', 'collection', 'progression'];
const PLACEHOLDER: Record<string, string> = {
  species: 'cobblemon:lucario',
  item: 'minecraft:diamond',
  advancement: 'minecraft:story/mine_diamond',
  dimension: 'minecraft:the_nether',
  entity: 'minecraft:ender_dragon',
  gym: 'brock',
  minimum_iv_percent: '80',
};
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'objective';

function FilterValue({ k, v, onChange }: { k: string; v: string; onChange: (v: string) => void }) {
  if (k === 'pokemon_type') return <Select value={v || 'grass'} onChange={onChange} options={POKEMON_TYPES} width={150} />;
  if (k === 'region') return <Select value={v || 'kanto'} onChange={onChange} options={REGIONS} width={150} />;
  if (k === 'distinct') return <Select value={v || 'true'} onChange={onChange} options={['true', 'false']} width={150} />;
  return <TextInput icon={null} mono value={v} placeholder={PLACEHOLDER[k] ?? ''} onChange={(e) => onChange(e.target.value.trim().slice(0, 128))} className="w-[240px]" />;
}

function DefinitionRow({ d, achievement, onChange, onDelete, onDuplicate, open, onToggle }: {
  d: Definition;
  achievement: boolean;
  onChange: (d: Definition) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  open: boolean;
  onToggle: () => void;
}) {
  const set = <K extends keyof Definition>(k: K, v: Definition[K]) => onChange({ ...d, [k]: v });
  const filterKey = Object.keys(d.filters ?? {})[0] ?? '';
  const needs = TYPES.find((t) => t.value === d.type)?.needs;
  return (
    <div className="border-b border-line last:border-0">
      <div className="grid grid-cols-[18px_minmax(180px,1.4fr)_minmax(140px,1fr)_80px_110px_90px_auto] items-center gap-3 px-4 py-2.5 hover:bg-white/[0.015]">
        <button onClick={onToggle} className="text-fg-4 hover:text-fg">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <button onClick={onToggle} className="min-w-0 text-left">
          <div className="truncate text-sm font-medium">{d.title || 'Untitled'}</div>
          <div className="truncate text-2xs text-fg-4">{d.description}</div>
        </button>
        <span className="truncate text-xs text-fg-2">{typeLabel(d.type)}{filterKey ? <span className="text-fg-4"> · {d.filters[filterKey]}</span> : null}</span>
        <span className="num text-right text-sm">{d.target.toLocaleString()}</span>
        <span className="num text-right text-sm text-amber">{money(d.reward)} ₽</span>
        <Badge tone={d.repeat === 'daily' ? 'blue' : d.repeat === 'weekly' ? 'violet' : 'neutral'}>{achievement ? d.category : d.repeat}</Badge>
        <div className="flex justify-end gap-0.5">
          <Tooltip content="Duplicate"><IconButton icon={Copy} label="Duplicate" size="xs" onClick={onDuplicate} /></Tooltip>
          <Tooltip content="Delete"><IconButton icon={Trash2} label="Delete" size="xs" onClick={onDelete} className="hover:text-[#ff8784]" /></Tooltip>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-bg-1/50">
            <div className="grid gap-x-6 gap-y-3 px-11 py-4 md:grid-cols-2">
              <Field label="Title">
                <TextInput icon={null} value={d.title} onChange={(e) => set('title', e.target.value.slice(0, 64))} className="w-full" />
              </Field>
              <Field label="ID" hint="Changing it resets players' progress for this entry">
                <TextInput icon={null} mono value={d.id} onChange={(e) => set('id', slug(e.target.value))} className="w-full" />
              </Field>
              <Field label="Description" wide>
                <TextInput icon={null} value={d.description} onChange={(e) => set('description', e.target.value.slice(0, 240))} className="w-full" />
              </Field>
              <Field label="Objective">
                <Select
                  value={d.type}
                  onChange={(v) => {
                    const need = TYPES.find((t) => t.value === v)?.needs;
                    onChange({ ...d, type: v, filters: need ? { [need]: d.filters?.[need] ?? (need === 'pokemon_type' ? 'grass' : need === 'region' ? 'kanto' : '') } : {} });
                  }}
                  options={TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  width={240}
                />
              </Field>
              <Field label={needs ? `Required: ${needs.replace(/_/g, ' ')}` : 'Filter (optional)'}>
                <div className="flex items-center gap-2">
                  {!needs && (
                    <Select
                      value={filterKey || 'none'}
                      onChange={(v) => set('filters', v === 'none' ? {} : { [v]: v === 'pokemon_type' ? 'grass' : v === 'region' ? 'kanto' : v === 'distinct' ? 'true' : '' })}
                      options={[{ value: 'none', label: 'No filter' }, ...FILTERS.map((f) => ({ value: f, label: f.replace(/_/g, ' ') }))]}
                      width={150}
                    />
                  )}
                  {(needs || filterKey) && <FilterValue k={needs || filterKey} v={d.filters?.[needs || filterKey] ?? ''} onChange={(v) => set('filters', { [needs || filterKey]: v })} />}
                </div>
              </Field>
              <Field label={d.type === 'reach_pokemon_level' ? 'Level to reach' : 'Target amount'}>
                <TextInput icon={null} type="number" min={1} max={d.type === 'reach_pokemon_level' ? 100 : 1000000} value={d.target} onChange={(e) => set('target', Math.max(1, Math.min(d.type === 'reach_pokemon_level' ? 100 : 1000000, parseInt(e.target.value || '1', 10))))} className="w-[140px]" />
              </Field>
              <Field label="Reward (₽)">
                <TextInput icon={Coins} value={d.reward} onChange={(e) => set('reward', digits(e.target.value) || '0')} className="w-[180px]" />
              </Field>
              {!achievement && (
                <Field label="Repeats">
                  <Segmented size="xs" value={d.repeat} onChange={(v) => set('repeat', v)} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'progression', label: 'Once (progression)' }]} />
                </Field>
              )}
              <Field label="Category">
                <Select value={d.category} onChange={(v) => set('category', v)} options={CATEGORIES} width={180} />
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={cx('flex flex-col gap-1.5', wide && 'md:col-span-2')}>
      <span className="text-2xs font-medium tracking-wide text-fg-3 uppercase">{label}</span>
      {children}
      {hint && <span className="text-2xs text-fg-4">{hint}</span>}
    </label>
  );
}

function ObjectivesEditor({ server, achievement }: { server: Server; achievement: boolean }) {
  const name: FileName = achievement ? 'achievements.json' : 'quests.json';
  const f = useModFile<ObjectiveFile>(server, name);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(achievement ? 'all' : 'daily');
  if (!f.data) return <LoadState error={f.error} />;
  const data = f.data;
  const setDefs = (defs: Definition[]) => f.setData({ ...data, definitions: defs });
  const list = data.definitions
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => (achievement ? tab === 'all' || d.category === tab : d.repeat === tab));
  const dailyPool = data.definitions.filter((d) => d.repeat === 'daily').length;
  const add = () => {
    let id = achievement ? 'new_achievement' : 'new_quest';
    let n = 1;
    while (data.definitions.some((d) => d.id === id)) id = `${achievement ? 'new_achievement' : 'new_quest'}_${++n}`;
    const d: Definition = {
      id, title: achievement ? 'New achievement' : 'New quest', description: 'Describe the goal', type: 'catch_pokemon', filters: {}, target: 10,
      reward: '10000', repeat: achievement ? 'once' : tab === 'all' ? 'daily' : tab, category: achievement && tab !== 'all' ? tab : 'collection',
    };
    setDefs([...data.definitions, d]);
    setOpen(id);
  };
  return (
    <div>
      <ResultNote result={f.result} name={name} />
      <Panel
        title={achievement ? 'Achievements' : 'Quests'}
        icon={achievement ? Trophy : Scroll}
        meta={`${data.definitions.length} defined`}
        flush
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-3">Enabled</span>
            <Switch size="sm" checked={data.enabled} onChange={(v) => f.setData({ ...data, enabled: v })} />
            <Button size="xs" variant="secondary" icon={Plus} onClick={add}>
              Add
            </Button>
          </div>
        }
      >
        {!achievement && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-fg-2">
              Daily quests per player
              <Stepper value={data.dailyCount} onChange={(v) => f.setData({ ...data, dailyCount: v })} min={0} max={Math.min(12, dailyPool)} />
              <span className="text-2xs text-fg-4">from a pool of {dailyPool}</span>
            </span>
            <span className="flex items-center gap-2 text-fg-2">
              Bonus for finishing all dailies
              <TextInput icon={Coins} value={data.dailyBonus} onChange={(e) => f.setData({ ...data, dailyBonus: digits(e.target.value) || '0' })} className="w-[140px]" />
            </span>
          </div>
        )}
        <div className="border-b border-line px-4 py-2">
          <Segmented
            size="xs"
            value={tab}
            onChange={setTab}
            options={achievement ? [{ value: 'all', label: 'All' }, ...CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))] : [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'progression', label: 'Progression' }]}
          />
        </div>
        <div className="grid grid-cols-[18px_minmax(180px,1.4fr)_minmax(140px,1fr)_80px_110px_90px_auto] gap-3 border-b border-line px-4 py-1.5 text-2xs text-fg-4">
          <span />
          <span>Title</span>
          <span>Objective</span>
          <span className="text-right">Target</span>
          <span className="text-right">Reward</span>
          <span>{achievement ? 'Category' : 'Repeats'}</span>
          <span />
        </div>
        {list.length === 0 && <Empty icon={achievement ? Trophy : Scroll} title="Nothing here yet" desc="Add an entry with the button above." />}
        {list.map(({ d, i }) => (
          <DefinitionRow
            key={i}
            d={d}
            achievement={achievement}
            open={open === d.id}
            onToggle={() => setOpen(open === d.id ? null : d.id)}
            onChange={(nd) => {
              const defs = [...data.definitions];
              defs[i] = nd;
              setDefs(defs);
              if (open === d.id) setOpen(nd.id);
            }}
            onDelete={() => setDefs(data.definitions.filter((_, j) => j !== i))}
            onDuplicate={() => {
              let id = `${d.id}_copy`;
              let n = 1;
              while (data.definitions.some((x) => x.id === id)) id = `${d.id}_copy${++n}`;
              setDefs([...data.definitions, { ...d, id: id.slice(0, 48), title: `${d.title} (copy)`.slice(0, 64) }]);
            }}
          />
        ))}
      </Panel>
      <p className="mt-3 px-1 text-xs text-fg-4">
        Rewards are paid in CobbleDollars when a player presses Claim. Changing an objective's type, filter or target restarts unclaimed progress for that entry; claimed rewards are never paid twice.
      </p>
      <SaveBar dirty={f.dirty} saving={f.saving} onSave={() => void f.save()} onReset={f.reset} label={achievement ? 'achievements' : 'quests'} />
    </div>
  );
}

/* ═════════════════════ PRICES ═════════════════════ */

type PortalFile = { servicePrices: Record<string, string>; quoteSeconds: number; gymScaling: boolean; strongestCount: number; gymSearchRadius: number };
type Offer = { id: string; multiplier: number; seconds: number; price: string; rarityPrices: Record<string, string>; speciesPrices: Record<string, string> };
type BoostFile = { enabled: boolean; legendaryMaximum: number; species: Offer[]; shiny: Offer[]; variant: Offer[] };
type Legendary = { id: string; name: string; item: string; price: string; requiredSeries: string; description: string };

const SERVICES: { key: string; label: string; desc: string }[] = [
  { key: 'shiny', label: 'Make shiny', desc: 'Turns a Pokémon shiny' },
  { key: 'iv', label: 'IV training', desc: 'Per IV upgrade' },
  { key: 'ev', label: 'EV training', desc: 'Per EV service' },
  { key: 'nature', label: 'Nature change', desc: '' },
  { key: 'ability', label: 'Ability change', desc: '' },
  { key: 'friendship', label: 'Max friendship', desc: '' },
];
const RARITIES = ['common', 'uncommon', 'rare', 'ultra-rare', 'legendary'];

function PricesEditor({ server }: { server: Server }) {
  const portal = useModFile<PortalFile>(server, 'portal.json');
  const boosts = useModFile<BoostFile>(server, 'spawn_boosts.json');
  const shop = useModFile<Legendary[]>(server, 'legendary_shop.json');
  const anyDirty = portal.dirty || boosts.dirty || shop.dirty;
  const saving = portal.saving || boosts.saving || shop.saving;
  const saveAll = async () => {
    if (portal.dirty) await portal.save();
    if (boosts.dirty) await boosts.save();
    if (shop.dirty) await shop.save();
  };
  return (
    <div className="space-y-5">
      <ResultNote result={portal.result} name="portal.json" />
      <ResultNote result={boosts.result} name="spawn_boosts.json" />
      <ResultNote result={shop.result} name="legendary_shop.json" />

      <SettingsGroup title="Pokémon services" desc="Paid in CobbleDollars from the Services screen.">
        {!portal.data ? (
          <LoadState error={portal.error} />
        ) : (
          SERVICES.map((sv) => {
            const enabled = sv.key in portal.data!.servicePrices;
            return (
              <Row key={sv.key} label={sv.label} desc={sv.desc || undefined}>
                <div className="flex items-center gap-3">
                  <TextInput
                    icon={Coins}
                    value={portal.data!.servicePrices[sv.key] ?? ''}
                    disabled={!enabled}
                    onChange={(e) => portal.setData({ ...portal.data!, servicePrices: { ...portal.data!.servicePrices, [sv.key]: digits(e.target.value) || '1' } })}
                    className={cx('w-[160px]', !enabled && 'opacity-40')}
                  />
                  <Tooltip content={enabled ? 'Offered' : 'Disabled'}>
                    <Switch
                      size="sm"
                      checked={enabled}
                      onChange={(v) => {
                        const next = { ...portal.data!.servicePrices };
                        if (v) next[sv.key] = '10000';
                        else delete next[sv.key];
                        portal.setData({ ...portal.data!, servicePrices: next });
                      }}
                    />
                  </Tooltip>
                </div>
              </Row>
            );
          })
        )}
      </SettingsGroup>

      {boosts.data &&
        (['species', 'shiny', 'variant'] as const).map((kind) => (
          <SettingsGroup key={kind} title={kind === 'species' ? 'Spawn boosts' : kind === 'shiny' ? 'Shiny boosts' : 'Special form boosts'} desc="Player-local, timed. Legendary prices can be set separately.">
            <div className="grid grid-cols-[1fr_110px_110px_150px_150px_32px] gap-3 px-5 py-1.5 text-2xs text-fg-4">
              <span>Offer</span>
              <span>Multiplier</span>
              <span>Minutes</span>
              <span>Price ₽</span>
              <span>Legendary ₽</span>
              <span />
            </div>
            {boosts.data![kind].map((o, i) => {
              const update = (patch: Partial<Offer>) => {
                const list = [...boosts.data![kind]];
                list[i] = { ...o, ...patch };
                boosts.setData({ ...boosts.data!, [kind]: list });
              };
              return (
                <div key={i} className="grid grid-cols-[1fr_110px_110px_150px_150px_32px] items-center gap-3 px-5 py-2">
                  <span className="font-mono text-[12px] text-fg-2">{o.id}</span>
                  <TextInput icon={null} type="number" step={0.5} min={1.1} max={20} value={o.multiplier} onChange={(e) => update({ multiplier: Math.max(1.1, Math.min(20, Number(e.target.value) || 1.1)) })} />
                  <TextInput icon={null} type="number" min={1} max={1440} value={Math.round(o.seconds / 60)} onChange={(e) => update({ seconds: Math.max(1, Math.min(1440, parseInt(e.target.value || '1', 10))) * 60 })} />
                  <TextInput icon={Coins} value={o.price} onChange={(e) => update({ price: digits(e.target.value) || '0' })} />
                  <TextInput
                    icon={Coins}
                    value={o.rarityPrices?.legendary ?? ''}
                    placeholder="same"
                    onChange={(e) => {
                      const rp = { ...(o.rarityPrices ?? {}) };
                      const v = digits(e.target.value);
                      if (v) rp.legendary = v;
                      else delete rp.legendary;
                      update({ rarityPrices: rp });
                    }}
                  />
                  <IconButton
                    icon={Trash2}
                    label="Remove"
                    size="xs"
                    onClick={() => boosts.setData({ ...boosts.data!, [kind]: boosts.data![kind].filter((_, j) => j !== i) })}
                  />
                </div>
              );
            })}
            <div className="px-5 py-2.5">
              <Button
                size="xs"
                variant="ghost"
                icon={Plus}
                disabled={boosts.data![kind].length >= 12}
                onClick={() => {
                  let n = boosts.data![kind].length + 1;
                  const prefix = kind === 'species' ? 'hunt' : kind === 'shiny' ? 'shiny' : 'form';
                  while (boosts.data![kind].some((x) => x.id === `${prefix}-${n}`)) n++;
                  boosts.setData({ ...boosts.data!, [kind]: [...boosts.data![kind], { id: `${prefix}-${n}`, multiplier: 2, seconds: 1800, price: '20000', rarityPrices: {}, speciesPrices: {} }] });
                }}
              >
                Add offer
              </Button>
            </div>
          </SettingsGroup>
        ))}
      {boosts.data && (
        <SettingsGroup title="Boost rules">
          <Row label="Boosts enabled">
            <Switch checked={boosts.data.enabled} onChange={(v) => boosts.setData({ ...boosts.data!, enabled: v })} />
          </Row>
          <Row label="Highest multiplier for legendaries" desc="Caps every offer when the target is legendary.">
            <TextInput icon={null} type="number" step={0.5} min={1} max={20} value={boosts.data.legendaryMaximum} onChange={(e) => boosts.setData({ ...boosts.data!, legendaryMaximum: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} className="w-[110px]" />
          </Row>
        </SettingsGroup>
      )}

      <SettingsGroup title="Legendary shop" desc="Summoning items, unlocked by completing a region.">
        {!shop.data ? (
          <LoadState error={shop.error} />
        ) : (
          <>
            <div className="grid grid-cols-[1fr_120px_160px] gap-3 px-5 py-1.5 text-2xs text-fg-4">
              <span>Item</span>
              <span>Unlock</span>
              <span>Price ₽</span>
            </div>
            {shop.data.map((o, i) => (
              <div key={o.id} className="grid grid-cols-[1fr_120px_160px] items-center gap-3 px-5 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{o.name}</div>
                  <div className="truncate font-mono text-2xs text-fg-4">{o.item}</div>
                </div>
                <Select
                  value={o.requiredSeries}
                  onChange={(v) => {
                    const list = [...shop.data!];
                    list[i] = { ...o, requiredSeries: v };
                    shop.setData(list);
                  }}
                  options={REGIONS}
                  width={120}
                />
                <TextInput
                  icon={Coins}
                  value={o.price}
                  onChange={(e) => {
                    const list = [...shop.data!];
                    list[i] = { ...o, price: digits(e.target.value) || '1' };
                    shop.setData(list);
                  }}
                />
              </div>
            ))}
          </>
        )}
      </SettingsGroup>
      <SaveBar dirty={anyDirty} saving={saving} onSave={saveAll} onReset={() => { portal.reset(); boosts.reset(); shop.reset(); }} label="prices" />
    </div>
  );
}

/* ═════════════════════ STARTER ═════════════════════ */

type StarterFile = {
  enabled: boolean;
  shiny: boolean;
  guaranteedPerfectIvs: number;
  minimumOtherIv: number;
  maximumOtherIv: number;
  hiddenAbilityChance: number;
  rewardKit: boolean;
  kit: Record<string, number>;
  kitMoney?: string;
};

function StarterEditor({ server }: { server: Server }) {
  const f = useModFile<StarterFile>(server, 'starter.json');
  const [newItem, setNewItem] = useState('');
  if (!f.data) return <LoadState error={f.error} />;
  const s = f.data;
  const set = <K extends keyof StarterFile>(k: K, v: StarterFile[K]) => f.setData({ ...s, [k]: v });
  const kit = Object.entries(s.kit ?? {});
  return (
    <div className="space-y-5">
      <ResultNote result={f.result} name="starter.json" />
      <SettingsGroup title="First starter" desc="Applied once per account when the player picks their starter.">
        <Row label="Enhance the first starter">
          <Switch checked={s.enabled} onChange={(v) => set('enabled', v)} />
        </Row>
        <Row label="Guaranteed shiny">
          <Switch checked={s.shiny} onChange={(v) => set('shiny', v)} />
        </Row>
        <Row label="Perfect IVs (31)" desc="Random stats set to 31.">
          <Stepper value={s.guaranteedPerfectIvs} onChange={(v) => set('guaranteedPerfectIvs', v)} min={0} max={6} />
        </Row>
        <Row label="Other IVs" desc="Range for the remaining stats.">
          <div className="flex items-center gap-2">
            <Stepper value={s.minimumOtherIv} onChange={(v) => set('minimumOtherIv', Math.min(v, s.maximumOtherIv))} min={0} max={31} />
            <span className="text-fg-4">–</span>
            <Stepper value={s.maximumOtherIv} onChange={(v) => set('maximumOtherIv', Math.max(v, s.minimumOtherIv))} min={0} max={31} />
          </div>
        </Row>
        <Row label="Hidden ability chance">
          <Stepper value={Math.round(s.hiddenAbilityChance * 100)} onChange={(v) => set('hiddenAbilityChance', v / 100)} min={0} max={100} step={5} suffix="%" />
        </Row>
      </SettingsGroup>
      <SettingsGroup title="Starter kit" desc="Given once, together with the starter (in addition to Cobbleverse's own kit).">
        <Row label="Give the kit">
          <Switch checked={s.rewardKit} onChange={(v) => set('rewardKit', v)} />
        </Row>
        <Row label="CobbleDollars">
          <TextInput icon={Coins} value={s.kitMoney ?? '0'} onChange={(e) => set('kitMoney', digits(e.target.value) || '0')} className="w-[160px]" />
        </Row>
        {kit.map(([id, count]) => (
          <Row key={id} label={id}>
            <div className="flex items-center gap-2">
              <Stepper value={count} onChange={(v) => set('kit', { ...s.kit, [id]: v })} min={1} max={64} />
              <IconButton
                icon={Trash2}
                label="Remove"
                size="xs"
                onClick={() => {
                  const k = { ...s.kit };
                  delete k[id];
                  set('kit', k);
                }}
              />
            </div>
          </Row>
        ))}
        <div className="flex items-center gap-2 px-5 py-3">
          <TextInput icon={null} mono value={newItem} placeholder="cobblemon:master_ball" onChange={(e) => setNewItem(e.target.value.trim().toLowerCase())} className="w-[260px]" />
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            disabled={!/^[a-z0-9_.-]+:[a-z0-9_/.-]+$/.test(newItem) || newItem in (s.kit ?? {}) || kit.length >= 12}
            onClick={() => {
              set('kit', { ...s.kit, [newItem]: 1 });
              setNewItem('');
            }}
          >
            Add item
          </Button>
          <span className="text-2xs text-fg-4">{kit.length}/12 stacks · unknown items are rejected by the server</span>
        </div>
      </SettingsGroup>
      <SaveBar dirty={f.dirty} saving={f.saving} onSave={() => void f.save()} onReset={f.reset} label="the starter" />
    </div>
  );
}

/* ═════════════════════ ADVANCED (raw JSON) ═════════════════════ */

function AdvancedEditor({ server }: { server: Server }) {
  const [name, setName] = useState<FileName>('gym_tiers.json');
  const f = useModFile<unknown>(server, name);
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  useEffect(() => {
    if (f.data !== null) setText(JSON.stringify(f.data, null, 2));
  }, [f.data]);
  return (
    <div>
      <ResultNote result={f.result} name={name} />
      <Panel
        title="Raw JSON"
        icon={FileJson}
        flush
        actions={
          <div className="flex items-center gap-2">
            <Select
              value={name}
              onChange={(v) => setName(v as FileName)}
              options={['gym_tiers.json', 'quests.json', 'achievements.json', 'portal.json', 'starter.json', 'spawn_boosts.json', 'legendary_shop.json']}
              width={190}
            />
            <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => f.data !== null && setText(JSON.stringify(f.data, null, 2))}>
              Revert
            </Button>
            <Button
              size="xs"
              variant="primary"
              icon={Save}
              loading={f.saving}
              disabled={!!parseError}
              onClick={() => void f.save(JSON.parse(text))}
            >
              Save & apply
            </Button>
          </div>
        }
      >
        <textarea
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            try {
              JSON.parse(e.target.value);
              setParseError(null);
            } catch (err) {
              setParseError((err as Error).message);
            }
          }}
          className="h-[520px] w-full resize-y bg-[#070708] p-4 font-mono text-[12px] leading-[19px] text-fg-2 outline-none"
        />
        {parseError && <div className="border-t border-line px-4 py-2 text-xs text-[#ff8784]">{parseError}</div>}
      </Panel>
    </div>
  );
}

/* ═════════════════════ TAB ═════════════════════ */

type FileInfo = { name: string; label: string; exists: boolean; writable: boolean; status: string | null };

export function GameplayTab({ s }: { s: Server }) {
  const [section, setSection] = useState('quests');
  const [files, setFiles] = useState<FileInfo[] | null>(null);
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    api.get<{ files: FileInfo[] }>(`/api/instances/${enc(s.id)}/modconfig`).then((r) => setFiles(r.files)).catch(() => setFiles([]));
  }, [s.id]);
  const problems = useMemo(() => (files ?? []).filter((f) => f.status && f.status !== 'ok'), [files]);
  const readOnly = (files ?? []).some((f) => f.exists && !f.writable);
  if (!s.modConfig)
    return (
      <div className="surface rounded-xl">
        <Empty icon={Wand2} title="No POKÉ PORTAL config on this server" desc="This instance does not run the companion mod, or has not been started yet." />
      </div>
    );
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={section}
          onChange={setSection}
          options={[
            { value: 'quests', label: 'Quests' },
            { value: 'achievements', label: 'Achievements' },
            { value: 'prices', label: 'Prices' },
            { value: 'starter', label: 'Starter' },
            { value: 'advanced', label: 'Advanced' },
          ]}
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-fg-3">
          {problems.length ? (
            <Tooltip content={problems.map((p) => `${p.name}: ${p.status}`).join('\n')}>
              <Badge tone="red" dot>
                {problems.length} file{problems.length > 1 ? 's' : ''} rejected
              </Badge>
            </Tooltip>
          ) : (
            files && <Badge tone="mint" dot>All files valid</Badge>
          )}
          <Button
            size="xs"
            variant="ghost"
            icon={Sparkles}
            loading={reloading}
            disabled={s.status !== 'running'}
            onClick={async () => {
              setReloading(true);
              try {
                const r = await api.post<{ message: string; files: FileInfo[]; ok?: boolean }>(`/api/instances/${enc(s.id)}/modconfig/reload`);
                setFiles(r.files);
                toast(r.ok ? 'Reloaded' : 'Reloaded with errors', r.ok ? 'success' : 'warn', r.message);
              } finally {
                setReloading(false);
              }
            }}
          >
            Reload now
          </Button>
        </div>
      </div>
      {readOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-amber/25 bg-amber/[0.06] px-3 py-2 text-xs text-amber">
          <TriangleAlert size={13} /> The portal cannot write this server's config folder yet (missing directory ACL).
        </div>
      )}
      {section === 'quests' && <ObjectivesEditor server={s} achievement={false} />}
      {section === 'achievements' && <ObjectivesEditor server={s} achievement />}
      {section === 'prices' && <PricesEditor server={s} />}
      {section === 'starter' && <StarterEditor server={s} />}
      {section === 'advanced' && <AdvancedEditor server={s} />}
    </div>
  );
}
