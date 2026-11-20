import { z } from 'zod';
import { candidates, type understand } from './understanding';
import { envelope, fighterSchema, identitySchema, type Fighter } from './schemas';
import { ProviderError } from './ufcalendar';

type Get = <T>(path: string, schema: z.ZodType<T>) => Promise<T>;
export function failureCategory(error: unknown) {
  if (error instanceof ProviderError) return error.code;
  if (error instanceof z.ZodError) return 'invalid_source_data';
  if (error instanceof DOMException) return error.name === 'TimeoutError' ? 'timeout' : 'cancelled';
  return 'source_unavailable';
}

export async function resolveFighterEvidence(
  plan: ReturnType<typeof understand<Fighter>>,
  live: boolean,
  get: Get,
) {
  let selected = [...plan.fighters];
  const missing: string[] = [];
  let clarification: string | undefined;
  if (!live) return { selected, missing, clarification };
  const names = plan.subjects.length ? plan.subjects : plan.subject ? [plan.subject] : [];
  for (const name of names.slice(0, 3)) {
    if (candidates(name, selected).length) continue;
    try {
      const result = await get(
        `/fighters?org=ufc&q=${encodeURIComponent(name)}&limit=10`,
        envelope(z.array(identitySchema)),
      );
      const ranked = candidates(name, result.data);
      const matches =
        ranked[0]?.confidence === 1 ? ranked.filter((m) => m.confidence === 1) : ranked;
      if (matches.length > 1) {
        clarification = `Which fighter do you mean: ${matches.map((m) => m.fighter.name).join(', ')}?`;
        break;
      }
      if (!matches.length) {
        missing.push(`No verified provider identity match for ${name}.`);
        continue;
      }
      const detail = await get(`/fighters/${matches[0].fighter.id}`, envelope(fighterSchema));
      if (detail.data.id !== matches[0].fighter.id) throw new Error('Identity mismatch');
      selected.push({
        ...detail.data,
        source_url: 'https://www.ufcalendar.com',
        updated_at: detail.meta?.fetched_at || new Date().toISOString(),
      });
    } catch (error) {
      missing.push(`Fighter lookup ${failureCategory(error)}; no facts inferred.`);
    }
  }
  for (const fighter of [...selected]) {
    if (
      Date.now() - Date.parse(fighter.updated_at) < 86400000 &&
      (!plan.intents.includes('fight_statistics') || fighter.stats) &&
      (!plan.intents.includes('fighter_history') || Object.keys(fighter.records || {}).length)
    )
      continue;
    try {
      const result = await get(`/fighters/${fighter.id}`, envelope(fighterSchema));
      if (result.data.id !== fighter.id) throw new Error('Identity mismatch');
      selected = selected.map((f) =>
        f.id === fighter.id
          ? {
              ...result.data,
              source_url: 'https://www.ufcalendar.com',
              updated_at: result.meta?.fetched_at || new Date().toISOString(),
            }
          : f,
      );
    } catch (error) {
      missing.push(
        `Fighter refresh ${failureCategory(error)}; retained records are dated snapshots.`,
      );
    }
  }
  return { selected, missing, clarification };
}
