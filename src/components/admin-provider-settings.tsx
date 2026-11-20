'use client';
import { useEffect, useState } from 'react';
import type { ProviderSettings, settingsView, AIName } from '@/lib/provider-settings';
type View = ReturnType<typeof settingsView>;
export function AdminProviderSettings() {
  const [view, setView] = useState<View | null>(null),
    [draft, setDraft] = useState<ProviderSettings | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [results, setResults] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/provider-settings', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load provider settings');
        if (!cancelled) {
          setView(data);
          setDraft(data.settings);
        }
      })
      .catch(() => {
        if (!cancelled) setMessage('Provider settings unavailable. Refresh to retry.');
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function send(body: unknown, resultKey?: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/provider-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      if (resultKey) setResults((previous) => ({ ...previous, [resultKey]: data.result.message }));
      else {
        setView(data);
        setDraft(data.settings);
        setMessage('Provider settings saved. Subsequent requests use this selection.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel"
      style={{ padding: 24, marginTop: 24, minWidth: 0, overflowWrap: 'anywhere' }}
      aria-label="Provider settings"
    >
      <h2>AI Provider Settings</h2>
      <p>
        Switch configured server-side keys. Replace secret values in Vercel Environment Variables or
        .env.local; this form does not edit secrets.
      </p>
      {draft && view ? (
        <>
          <label>
            Active AI Provider{' '}
            <select
              style={{ maxWidth: '100%' }}
              aria-label="Active AI Provider"
              value={draft.activeAI}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, activeAI: e.target.value as AIName })}
            >
              <option value="openrouter">OpenRouter</option>
              <option value="groq">Groq</option>
            </select>
          </label>
          {(['openrouter', 'groq'] as const).map((name) => (
            <fieldset
              key={name}
              disabled={busy}
              style={{ marginTop: 16, padding: 16, minWidth: 0 }}
            >
              <legend>{name === 'groq' ? 'Groq' : 'OpenRouter'}</legend>
              {view.ai[name].slots.map((slot) => (
                <div
                  key={slot.slot}
                  style={{
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <span>
                    {slot.slot === 1 ? 'Primary' : 'Secondary'} key slot:{' '}
                    {slot.configured ? 'Configured' : 'Missing'} · ****
                  </span>
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ maxWidth: '100%', whiteSpace: 'normal' }}
                    disabled={!slot.configured}
                    onClick={() =>
                      send(
                        {
                          action: 'test_ai',
                          provider: name,
                          slot: slot.slot,
                          model: draft[name].model,
                        },
                        `${name}:${slot.slot}`,
                      )
                    }
                  >
                    Test {name === 'groq' ? 'Groq' : 'OpenRouter'} Key {slot.slot}
                  </button>
                  <span role="status">{results[`${name}:${slot.slot}`] || 'Not tested'}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <label>
                  Active {name} key slot{' '}
                  <select
                    style={{ maxWidth: '100%' }}
                    aria-label={`Active ${name} key slot`}
                    value={draft[name].slot}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [name]: { ...draft[name], slot: Number(e.target.value) },
                      })
                    }
                  >
                    {view.ai[name].slots.map((slot) => (
                      <option key={slot.slot} value={slot.slot} disabled={!slot.configured}>
                        Key {slot.slot}
                        {slot.configured ? '' : ' (missing)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {name} model{' '}
                  <select
                    style={{ maxWidth: '100%' }}
                    aria-label={`${name} model`}
                    value={draft[name].model}
                    onChange={(e) =>
                      setDraft({ ...draft, [name]: { ...draft[name], model: e.target.value } })
                    }
                  >
                    {view.ai[name].models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>
          ))}
          <p>{view.fallback}</p>
          <h2>UFC Data Provider Settings</h2>
          <p>
            UFCalendar ·{' '}
            {view.data.slots.some((s) => s.configured) ? 'Configured' : 'Missing API key'} ·
            Connection: {results[`data:${draft.data.slot}`] || 'Not tested'}
          </p>
          <label>
            Active UFCalendar credential{' '}
            <select
              style={{ maxWidth: '100%' }}
              aria-label="Active UFCalendar credential"
              value={draft.data.slot}
              disabled={busy || view.data.slots.filter((s) => s.configured).length < 2}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  data: { provider: 'ufcalendar', slot: Number(e.target.value) },
                })
              }
            >
              {view.data.slots.map((slot) => (
                <option key={slot.slot} value={slot.slot} disabled={!slot.configured}>
                  Credential {slot.slot}
                  {slot.configured ? ' · configured' : ' · missing'}
                </option>
              ))}
            </select>
          </label>
          <p>
            Each UFCalendar test consumes one authorized /usage request within the shared account
            quota.
          </p>
          {view.data.slots
            .filter((s) => s.configured)
            .map((slot) => (
              <button
                key={slot.slot}
                type="button"
                className="button button-secondary"
                style={{
                  marginRight: 12,
                  marginBottom: 12,
                  maxWidth: '100%',
                  whiteSpace: 'normal',
                }}
                disabled={busy}
                onClick={() =>
                  send(
                    { action: 'test_data', provider: 'ufcalendar', slot: slot.slot },
                    `data:${slot.slot}`,
                  )
                }
              >
                Test UFCalendar Credential {slot.slot}
              </button>
            ))}
          {view.data.slots
            .filter((s) => s.configured)
            .map((slot) => (
              <p role="status" key={slot.slot}>
                Credential {slot.slot}:{' '}
                {results[`data:${slot.slot}`] || 'Not tested in this session'}
              </p>
            ))}
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => send({ action: 'save', settings: draft })}
            >
              {busy ? 'Working…' : 'Save provider settings'}
            </button>
          </div>
        </>
      ) : (
        <p>Loading configured slots…</p>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
