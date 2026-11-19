import { z } from 'zod';
import { db } from './db';
import { consume } from './security';
import { saveFighter } from './ingestion';
import { UFCalendar, ProviderError } from './ufcalendar';
import { envelope, fighterSchema, identitySchema, type Fighter } from './schemas';

// Misspellings that should resolve to a canonical fighter, not fabricated answers.
const aliases: Record<string, string> = {
  'john jones': 'jon-jones',
  'jon jones': 'jon-jones',
  'jon bones jones': 'jon-jones',
};
function requestedName(query: string): string | undefined {
  const q = query.toLowerCase();
  for (const [alias, slug] of Object.entries(aliases))
    if (new RegExp(`\\b${alias.replace(/ /g, '\\s+')}\\b`, 'i').test(q)) return slug;
  // Restrict public live lookups to questions naming a UFC fighter.
  const explicit = q.match(/(?:who is|tell me about|record(?:s)? of|profile of|about)\\s+([a-z]+(?:\\s+[a-z]+){1,2})/i);
  if (!explicit) return undefined;
  return explicit[1].replace(/\\s+/g, ' ').trim();
}
export async function liveFighter(query: string): Promise<Fighter | null> {
  const requested = requestedName(query);
  const client = db(true);
  if (!requested || !client || !process.env.UFCALENDAR_API_KEY_1) return null;

  const cacheKey = `ufcalendar:fighter-lookup:${requested.replace(/[^a-z0-9-]/g, '-')}`;
  const { data: prior, error: cacheError } = await client.from('query_cache')
    .select('expires_at').eq('key', cacheKey).maybeSingle();
  if (cacheError || (prior && Date.parse(prior.expires_at) > Date.now())) return null;
  const blocked = await client.from('query_cache').select('expires_at')
    .eq('key', 'ufcalendar:quota-block').maybeSingle();
  if (blocked.error || (blocked.data && Date.parse(blocked.data.expires_at) > Date.now())) return null;

  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const limit = Math.min(80, Math.max(1, Number(process.env.UFCALENDAR_MONTHLY_LOCAL_LIMIT || 80)));
  const monthlyBucket = `ufcalendar:${process.env.UFCALENDAR_ACCOUNT_ID || 'primary'}:${now.toISOString().slice(0, 7)}`;
  // One attempted resolution per slug per 10 minutes across all Vercel functions.
  if (!(await consume(`ufcalendar:fighter-gate:${requested}`, 1, 1,
    new Date(Date.now() + 10 * 60 * 1000)))) return null;

  const provider = new UFCalendar(fetch, {
    ...process.env,
    UFCALENDAR_API_KEY_2: undefined,
    UFCALENDAR_API_KEY_3: undefined,
    UFCALENDAR_ACTIVE_KEY: '1',
  }, async () => {
    if (!(await consume(monthlyBucket, 1, limit, reset)))
      throw new Error('UFC monthly request budget exhausted');
  });
  try {
    let slug = requested;
    if (!slug.includes('-')) {
      const list = await provider.request(
        `/fighters?org=ufc&q=${encodeURIComponent(slug)}&limit=5`,
        envelope(z.array(identitySchema)),
      );
      const normalized = slug.toLowerCase();
      const exact = list.data.find((f) => f.name.toLowerCase() === normalized);
      const match = exact || (list.data.length === 1 ? list.data[0] : null);
      if (!match) return null;
      slug = match.slug;
    }
    const path = `/fighters/${encodeURIComponent(slug)}`;
    const response = await provider.request(path, envelope(fighterSchema));
    return await saveFighter(response.data, `https://api.ufcalendar.com/v1${path}`);
  } catch (error) {
    if (error instanceof ProviderError && error.status === 429) {
      await client.from('query_cache').upsert({
        key: 'ufcalendar:quota-block',
        response: { reason: error.code },
        expires_at: reset.toISOString(),
      });
    }
    return null;
  } finally {
    await client.from('query_cache').upsert({
      key: cacheKey,
      response: { checked_at: now.toISOString() },
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
  }
}
