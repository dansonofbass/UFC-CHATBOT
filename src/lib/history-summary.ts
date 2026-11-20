import type { z } from 'zod';
import type { historySchema } from './schemas';
export function historySummary(rows: z.infer<typeof historySchema>[]) {
  const wins = rows.filter((r) => r.status === 'win');
  return {
    scope: 'Only the supplied history rows; not a claim of complete career coverage.',
    observed_bouts: rows.length,
    observed_wins: wins.length,
    wins_by_method: {
      submission: wins.filter((r) => /submission|\bsub\b/i.test(r.method || '')).length,
      knockout_or_tko: wins.filter((r) => /\b(?:ko|tko)\b|knockout/i.test(r.method || '')).length,
      decision: wins.filter((r) => /decision/i.test(r.method || '')).length,
      unknown: wins.filter((r) => !r.method).length,
    },
  };
}
