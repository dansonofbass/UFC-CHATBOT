import { z } from 'zod';
import { db, checked } from './db';
import { consume } from './security';
import { saveEvent } from './ingestion';
import { UFCalendar, ProviderError } from './ufcalendar';
import { envelope, eventSchema, type Event } from './schemas';

// Refresh a missing latest completed event from the authorized UFCalendar allocation.
// The shared budget, cooldown and persistent quota block prevent requests per chat message.
export async function latestCompletedEvent(): Promise<Event | null> {
  const client = db(true);
  if (!client || !process.env.UFCALENDAR_API_KEY_1) return null;
  const now = new Date();
  const cached = await client.from('query_cache').select('response,expires_at')
    .eq('key', 'ufcalendar:recent-completed-refresh').maybeSingle();
  if (cached.error) return null;
  if (cached.data && Date.parse(cached.data.expires_at) > Date.now()) return null;
  const blocked = await client.from('query_cache').select('expires_at')
    .eq('key', 'ufcalendar:quota-block').maybeSingle();
  if (blocked.error || (blocked.data && Date.parse(blocked.data.expires_at) > Date.now())) return null;
  const ceiling = Math.min(80, Number(process.env.UFCALENDAR_MONTHLY_LOCAL_LIMIT || 80));
  const month = now.toISOString().slice(0, 7);
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const cooldown = await consume('ufcalendar:recent-completed-cooldown', 1, 1,
    new Date(Date.now() + 6 * 60 * 60 * 1000));
  if (!cooldown) return null;
  // Reserve at most two attempts for list + detail under the existing shared allocation.
  const remaining = async () => consume(
    `ufcalendar:${process.env.UFCALENDAR_ACCOUNT_ID || 'primary'}:${month}`,
    1, ceiling, nextMonth,
  );
  const provider = new UFCalendar(fetch, {
    ...process.env,
    UFCALENDAR_API_KEY_2: undefined,
    UFCALENDAR_API_KEY_3: undefined,
    UFCALENDAR_ACTIVE_KEY: '1',
  }, async () => {
    if (!(await remaining())) throw new Error('UFC monthly budget reached');
  });
  try {
    const page = await provider.request(
      '/events?org=ufc&status=completed&order=desc&limit=1',
      envelope(z.array(eventSchema)),
    );
    const latest = page.data[0];
    if (!latest) return null;
    const path = `/events/${encodeURIComponent(latest.slug)}`;
    const detail = await provider.request(path, envelope(eventSchema));
    return await saveEvent(detail.data, `https://api.ufcalendar.com/v1${path}`);
  } catch (error) {
    if (error instanceof ProviderError && error.status === 429)
      await checked(client.from('query_cache').upsert({
        key: 'ufcalendar:quota-block',
        response: { reason: error.code },
        expires_at: nextMonth.toISOString(),
      }).select());
    return null;
  } finally {
    // Memoize negative results too, to avoid hammering the source.
    await client.from('query_cache').upsert({
      key: 'ufcalendar:recent-completed-refresh',
      response: { checked_at: now.toISOString() },
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    });
  }
}
