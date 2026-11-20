import { createHash } from 'node:crypto';
import { db } from './db';
import type { Evidence } from './retrieval';
import { retrievalConfig } from './retrieval-config';
export async function cachedEvidence(
  query: string,
  history: string,
  load: () => Promise<Evidence>,
) {
  const client = db(true);
  if (!client) return load();
  const key =
    'retrieval:' +
    createHash('sha256')
      .update(
        JSON.stringify({
          version: 3,
          query,
          history,
          config: {
            ...retrievalConfig(),
            webConfigured: !!retrievalConfig().BRAVE_SEARCH_API_KEY,
            BRAVE_SEARCH_API_KEY: undefined,
          },
        }),
      )
      .digest('hex');
  const { data } = await client
    .from('query_cache')
    .select('response,expires_at')
    .eq('key', key)
    .maybeSingle();
  if (data && Date.parse(data.expires_at) > Date.now()) return data.response as Evidence;
  const value = await load();
  const ttl = value.cacheTtlMs ?? 60000;
  if (value.text && ttl > 0)
    await client
      .from('query_cache')
      .upsert({ key, response: value, expires_at: new Date(Date.now() + ttl).toISOString() });
  return value;
}
