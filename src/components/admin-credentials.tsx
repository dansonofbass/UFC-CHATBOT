'use client';
import { useState } from 'react';
export function AdminCredentials({ slots }: { slots: number[] }) {
  const [result, setResult] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  async function check(slot: number) {
    setBusy(slot);
    try {
      const response = await fetch('/api/admin/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot }),
      });
      const data = await response.json();
      setResult((state) => ({
        ...state, [slot]: response.ok
          ? `${data.result?.health || 'unknown'} — HTTP ${data.result?.lastStatus || 'unknown'}`
          : (data.error || 'Test failed'),
      }));
    } catch {
      setResult((state) => ({ ...state, [slot]: 'Network error' }));
    } finally { setBusy(null); }
  }
  return (
    <div className="panel" style={{ padding: 24 }}>
      <h2>UFCalendar credentials</h2>
      <p>Test each configured key separately. Each test uses one authorized /usage request; no quotas are combined.</p>
      {slots.map((slot) => (
        <div key={slot} style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <span>Credential {slot}: configured</span>
          <button className="button button-secondary" type="button" disabled={busy !== null} onClick={() => check(slot)}>
            {busy === slot ? 'Checking…' : 'Test key'}
          </button>
          <span role="status">{result[slot] || 'Not tested in this session'}</span>
        </div>
      ))}
      {!slots.length && <p>No UFCalendar credentials configured.</p>}
    </div>
  );
}
