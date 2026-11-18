import { createHash } from 'node:crypto';
import { db } from './db';
import type { Evidence } from './retrieval';
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
      .update(query + history)
      .digest('hex');
  const { data } = await client
    .from('query_cache')
    .select('response,expires_at')
    .eq('key', key)
    .maybeSingle();
  if (data && Date.parse(data.expires_at) > Date.now()) return data.response as Evidence;
  const value = await load();
  if (value.text)
    await client
      .from('query_cache')
      .upsert({ key, response: value, expires_at: new Date(Date.now() + 60000).toISOString() });
  return value;
}
