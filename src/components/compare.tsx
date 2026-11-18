'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Fighter } from '@/lib/schemas';
import { Button } from './ui/button';
import { Source } from './data-ui';
export function Compare({ fighters }: { fighters: Fighter[] }) {
  const [a, setA] = useState(''),
    [b, setB] = useState(''),
    fa = fighters.find((f) => f.slug === a),
    fb = fighters.find((f) => f.slug === b);
  return (
    <>
      <div className="compare-selects">
        {[
          [a, setA, 'First fighter'],
          [b, setB, 'Second fighter'],
        ].map(([value, set, label]) => (
          <label key={label as string}>
            {label as string}
            <select
              className="field"
              value={value as string}
              onChange={(e) => (set as typeof setA)(e.target.value)}
            >
              <option value="">Select a fighter</option>
              {fighters.map((f) => (
                <option key={f.id} value={f.slug}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {fa && fb && a !== b ? (
        <>
          <div className="table-scroll panel details">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Verified metric</th>
                  <th>{fa.name}</th>
                  <th>{fb.name}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    'UFC record',
                    'Total MMA record',
                    'Height',
                    'Reach',
                    'Weight',
                    'SLpM',
                    'Striking accuracy',
                    'Takedown average',
                  ] as const
                ).map((label, i) => {
                  const values = (f: Fighter) => [
                    f.records?.ufc?.value,
                    f.records?.pro_mma?.value,
                    f.height_inches ? `${f.height_inches} in` : null,
                    f.reach_inches ? `${f.reach_inches} in` : null,
                    f.weight_lbs ? `${f.weight_lbs} lbs` : null,
                    f.stats?.slpm,
                    f.stats?.str_acc,
                    f.stats?.td_avg,
                  ];
                  return (
                    <tr key={label}>
                      <th>{label}</th>
                      <td>{values(fa)[i] || 'Unavailable'}</td>
                      <td>{values(fb)[i] || 'Unavailable'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="source">
              SLpM = significant strikes landed per minute. Statistical sample bases may differ. AI
              analysis uses server-retrieved records.
            </p>
            <Source url={fa.source_url} date={fa.updated_at} label={fa.name} />
            <Source url={fb.source_url} date={fb.updated_at} label={fb.name} />
          </div>
          <Button asChild>
            <Link
              href={`/chat?q=${encodeURIComponent(`Compare UFC fighters ${fa.name} versus ${fb.name} using verified statistics. Explain missing metrics and sample differences.`)}`}
            >
              AI Analysis
            </Link>
          </Button>
        </>
      ) : (
        <p>
          {a && a === b
            ? 'Choose two different fighters.'
            : 'Choose two fighters to compare available records.'}
        </p>
      )}
    </>
  );
}
