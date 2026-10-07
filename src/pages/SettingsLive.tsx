import { useState } from 'react';
import { ArrowUpRight, BellRing, KeyRound, LogOut, Shuffle } from 'lucide-react';
import { changePassword, logout, saveNotify, saveNotifySecrets, testNotify } from '../lib/live';
import { navigate } from '../lib/router';
import { isDeployed, toast, useApp } from '../lib/store';
import type { NotifyEvent } from '../lib/types';
import { Button } from '../ui/Button';
import { Select, Stepper, Switch, TextInput } from '../ui/Controls';
import { Badge } from '../ui/Status';
import { Row, SettingsGroup } from './detail/Tabs';

/* Live-mode settings sections (server-connected). Prototype mode keeps the original page. */

export function BehaviorSummary() {
  const servers = useApp((s) => s.servers.filter(isDeployed));
  return (
    <SettingsGroup title="Server behavior" desc="Configured per instance — open a server's Settings tab to change it.">
      {servers.length === 0 && <div className="px-5 py-4 text-sm text-fg-4">No deployed instances yet.</div>}
      {servers.map((s) => {
        const a = s.automation;
        return (
          <Row key={s.id} label={s.name} desc={`wyzi-mc@${s.id}`}>
            <div className="flex items-center gap-1.5">
              <Badge tone={a?.autoStop.enabled ? 'blue' : 'neutral'}>{a?.autoStop.enabled ? `Auto-stop ${a.autoStop.minutes} min` : 'Auto-stop off'}</Badge>
              <Badge tone={a?.wake.enabled ? 'blue' : 'neutral'}>{a?.wake.enabled ? 'Wake on' : 'Wake off'}</Badge>
              <Badge tone={a?.schedule.enabled ? 'blue' : 'neutral'}>{a?.schedule.enabled ? `Backup ${a.schedule.time}` : 'No schedule'}</Badge>
              <Button size="xs" variant="ghost" iconRight={ArrowUpRight} onClick={() => navigate(`/servers/${s.id}/settings`)}>
                Configure
              </Button>
            </div>
          </Row>
        );
      })}
    </SettingsGroup>
  );
}

const EVENTS: { id: NotifyEvent; label: string; desc: string }[] = [
  { id: 'crash', label: 'Server crashed', desc: 'Unexpected exit, out-of-memory kill or crash loop.' },
  { id: 'startFailed', label: 'Start failed', desc: 'The start request could not be completed.' },
  { id: 'backupFailed', label: 'Backup failed', desc: 'Manual, scheduled or pre-stop backup.' },
  { id: 'ramPressure', label: 'Low memory', desc: 'MemAvailable below the safety headroom for 1 min, or swap above 1 GB.' },
  { id: 'diskPressure', label: 'Disk nearly full', desc: 'A volume above the threshold below for 2 min.' },
  { id: 'smart', label: 'Disk health (SMART)', desc: 'SMART failure, pending/uncorrectable sectors or new reallocations.' },
  { id: 'playitOffline', label: 'Playit tunnel offline', desc: 'Agent offline or status stale for 2 min.' },
  { id: 'autoStop', label: 'Server auto-stopped', desc: 'Low priority.' },
];

function randomTopic() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return 'wyzi-' + Array.from(b, (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
}

export function NotificationsLive() {
  const n = useApp((s) => s.notify);
  const [topic, setTopic] = useState('');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  if (!n) return null;

  return (
    <>
      <SettingsGroup title="Push notifications" desc="Sent with ntfy over outbound HTTPS. The portal stays LAN-only.">
        <Row label="Enable notifications" desc={n.configured ? 'A topic is configured on the server.' : 'Set a topic first.'}>
          <Switch checked={n.enabled} disabled={!n.configured} onChange={(v) => saveNotify({ enabled: v })} />
        </Row>
        <div className="space-y-2 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">Topic</div>
              <div className="text-xs text-fg-3">
                Write-only: it is stored on the server and never shown again. Subscribe to the same topic in the ntfy app.
              </div>
            </div>
            <Badge tone={n.configured ? 'mint' : 'neutral'} dot>
              {n.configured ? 'Configured' : 'Not set'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <TextInput icon={null} mono value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={n.configured ? 'Enter a new topic to replace it' : 'wyzi-…'} className="flex-1" />
            <Button size="sm" variant="ghost" icon={Shuffle} onClick={() => setTopic(randomTopic())}>
              Generate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!topic}
              onClick={async () => {
                if (await saveNotifySecrets({ topic })) {
                  toast('Topic saved', 'success', `Subscribe to “${topic}” in the ntfy app`);
                  setTopic('');
                }
              }}
            >
              Save
            </Button>
          </div>
          {topic && <div className="text-2xs text-fg-4">Copy it now — after saving it can only be replaced, not viewed.</div>}
        </div>
        <Row label="Access token" desc="Optional, for a reserved ntfy topic (starts with tk_).">
          <div className="flex items-center gap-2">
            <TextInput icon={null} mono type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={n.hasToken ? 'stored · enter to replace' : 'tk_…'} className="w-[200px]" />
            <Button size="sm" variant="secondary" disabled={!token} onClick={async () => (await saveNotifySecrets({ token })) && setToken('')}>
              Save
            </Button>
            {n.hasToken && (
              <Button size="sm" variant="ghost" onClick={() => saveNotifySecrets({ clearToken: true })}>
                Remove
              </Button>
            )}
          </div>
        </Row>
        <Row label="ntfy server" desc="https only.">
          <Select value={n.server} onChange={(v) => saveNotify({ server: v })} options={['https://ntfy.sh']} width={180} />
        </Row>
        <Row label="Send a test" desc="Works even while notifications are disabled.">
          <Button
            size="sm"
            variant="secondary"
            icon={BellRing}
            loading={testing}
            disabled={!n.configured}
            onClick={async () => {
              setTesting(true);
              const err = await testNotify();
              setTesting(false);
              toast(err ? 'Test failed' : 'Test sent', err ? 'error' : 'success', err ?? 'Check your phone');
            }}
          >
            Send test
          </Button>
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Alerts" desc={`Repeats of the same alert are held back for ${n.cooldownMinutes} min; conditions also send “Resolved”.`}>
        {EVENTS.map((e) => (
          <Row key={e.id} label={e.label} desc={e.desc}>
            <Switch checked={n.events[e.id]} onChange={(v) => saveNotify({ events: { [e.id]: v } })} />
          </Row>
        ))}
        <Row label="Disk threshold" desc="Percent used before a disk alert.">
          <Stepper value={n.diskPercent} onChange={(v) => saveNotify({ diskPercent: v })} min={70} max={98} suffix="%" />
        </Row>
        <Row label="Repeat cooldown">
          <Select
            value={`${n.cooldownMinutes} minutes`}
            onChange={(v) => saveNotify({ cooldownMinutes: parseInt(v, 10) })}
            options={['15 minutes', '30 minutes', '60 minutes', '180 minutes']}
            width={140}
          />
        </Row>
      </SettingsGroup>
    </>
  );
}

export function AccountLive() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [rep, setRep] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mismatch = !!rep && next !== rep;
  return (
    <>
      <SettingsGroup title="Admin password" desc="Argon2id hash on the server. Changing it signs out every browser.">
        <div className="space-y-2.5 px-5 py-4">
          <TextInput icon={KeyRound} type="password" autoComplete="current-password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} />
          <TextInput icon={KeyRound} type="password" autoComplete="new-password" placeholder="New password (min. 10 characters)" value={next} onChange={(e) => setNext(e.target.value)} />
          <TextInput icon={KeyRound} type="password" autoComplete="new-password" placeholder="Repeat new password" value={rep} onChange={(e) => setRep(e.target.value)} />
          {(err || mismatch) && <div className="text-xs text-[#ff8784]">{mismatch ? 'Passwords do not match' : err}</div>}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              disabled={!cur || next.length < 10 || next !== rep}
              onClick={async () => {
                setBusy(true);
                setErr(await changePassword(cur, next));
                setBusy(false);
              }}
            >
              Change password
            </Button>
          </div>
        </div>
      </SettingsGroup>
      <SettingsGroup title="Sessions">
        <Row label="Sign out everywhere" desc="Ends all portal sessions, including this one.">
          <Button size="sm" variant="danger" icon={LogOut} onClick={() => logout(true)}>
            Sign out all
          </Button>
        </Row>
      </SettingsGroup>
    </>
  );
}
