import { z } from 'zod';
import { UFCalendar, ProviderError } from './ufcalendar';
import { db, checked } from './db';
import { consume, internalBudgetScope } from './security';
import { retrievalConfig } from './retrieval-config';
import { cachedProvider } from './provider-cache';
import { saveFighter } from './ingestion';
import { fighterSchema } from './schemas';

// One shared account bucket and quota block across ingestion and request-time retrieval.
export function liveProvider(signal: AbortSignal) {
  let attempts = 0;
  const client = db(true);
  const provider = new UFCalendar(
    fetch,
    {
      ...process.env,
      UFCALENDAR_API_KEY_2: undefined,
      UFCALENDAR_API_KEY_3: undefined,
      UFCALENDAR_ACTIVE_KEY: '1',
    },
    async () => {
      if (!client || attempts >= retrievalConfig().CHAT_PROVIDER_REQUEST_LIMIT)
        throw new Error('Retrieval request budget unavailable');
      const now = new Date(),
        month = now.toISOString().slice(0, 7);
      const expiry = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const block = await client
        .from('query_cache')
        .select('expires_at')
        .eq('key', 'ufcalendar:quota-block')
        .maybeSingle();
      if (block.error || (block.data && Date.parse(block.data.expires_at) > Date.now()))
        throw new Error('Provider quota blocked');
      const rateBlock = await client
        .from('query_cache')
        .select('expires_at')
        .eq('key', 'ufcalendar:rate-block')
        .maybeSingle();
      if (rateBlock.error || (rateBlock.data && Date.parse(rateBlock.data.expires_at) > Date.now()))
        throw new ProviderError(429, 'rate_limited');
      const ceiling = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(process.env.UFCALENDAR_MONTHLY_LOCAL_LIMIT || 80);
      if (
        !(await consume(
          `ufcalendar:${process.env.UFCALENDAR_ACCOUNT_ID || 'primary'}:${month}`,
          1,
          ceiling,
          expiry,
        ))
      )
        throw new Error('Provider monthly limit');
      const day = now.toISOString().slice(0, 10);
      if (
        !(await consume(
          `chat:retrieval:${internalBudgetScope()}${day}`,
          1,
          retrievalConfig().CHAT_RETRIEVAL_DAILY_LIMIT,
          new Date(`${day}T23:59:59.999Z`),
        ))
      )
        throw new Error('Retrieval daily limit');
      attempts++;
    },
  );
  return async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
    try {
      return await cachedProvider(
        path,
        schema,
        async () => {
          const result = await provider.request(path, schema, AbortSignal.timeout(20000));
          if (
            /^\/fighters\/[^/?]+$/.test(path) &&
            result &&
            typeof result === 'object' &&
            'data' in result
          ) {
            const fighter = fighterSchema.safeParse(result.data);
            if (fighter.success)
              await saveFighter(fighter.data, `https://api.ufcalendar.com/v1${path}`).catch(
                () => undefined,
              );
          }
          return result;
        },
        signal,
      );
    } catch (error) {
      if (client && error instanceof ProviderError && error.code === 'rate_limited') {
        await client.from('query_cache').upsert({
          key: 'ufcalendar:rate-block',
          response: { reason: 'rate_limited' },
          expires_at: new Date(Date.now() + (error.retryAfterSeconds || 60) * 1000).toISOString(),
        });
      }
      if (client && error instanceof ProviderError && error.code === 'quota_exceeded') {
        const now = new Date();
        await checked(
          client
            .from('query_cache')
            .upsert({
              key: 'ufcalendar:quota-block',
              response: { reason: 'quota_exceeded' },
              expires_at: new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
              ).toISOString(),
            })
            .select(),
        );
      }
      throw error;
    }
  };
}

const searchSchema = z.object({
  web: z
    .object({
      results: z
        .array(
          z.object({
            title: z.string().max(1000),
            url: z.url(),
            description: z.string().max(10000),
          }),
        )
        .max(20),
    })
    .optional(),
});
export async function webSearch(query: string, signal: AbortSignal) {
  const c = retrievalConfig();
  if (
    c.CHAT_WEB_SEARCH_ENABLED !== 'true' ||
    c.WEB_SEARCH_PROVIDER !== 'brave' ||
    !c.BRAVE_SEARCH_API_KEY
  )
    return [];
  const day = new Date().toISOString().slice(0, 10);
  if (
    !(await consume(
      `web:brave:${day}`,
      1,
      c.WEB_SEARCH_DAILY_LIMIT,
      new Date(`${day}T23:59:59.999Z`),
    ))
  )
    return [];
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', `UFC ${query}`.slice(0, 500));
  url.searchParams.set('count', '5');
  const response = await fetch(url, {
    headers: { 'X-Subscription-Token': c.BRAVE_SEARCH_API_KEY },
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    redirect: 'error',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Web search unavailable');
  const body = await response.text();
  if (body.length > 150000) throw new Error('Search response too large');
  return (searchSchema.parse(JSON.parse(body)).web?.results || [])
    .filter((r) => {
      const u = new URL(r.url);
      return (
        u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        ['ufc.com', 'www.ufc.com', 'ufcstats.com', 'www.ufcstats.com'].includes(u.hostname)
      );
    })
    .map((r) => ({ ...r, description: r.description.replace(/<[^>]*>/g, '').slice(0, 1200) }));
}
