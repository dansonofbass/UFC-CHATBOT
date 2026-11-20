import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';

const snapshot = z.object({
  value: z.unknown(),
  fetched_at: z.string(),
  source_updated_at: z.string().nullable(),
});
type Snapshot = z.infer<typeof snapshot>;
const memory = new Map<string, Snapshot>();
const pending = new Map<string, Promise<Snapshot>>();
export function clearProviderCache() {
  memory.clear();
  pending.clear();
}
export function providerTtl(path: string) {
  if (/\/history|\/fights\/\d+/.test(path)) return 7 * 86400000;
  if (/\/fighters\?/.test(path)) return 7 * 86400000;
  if (/\/fighters\//.test(path)) return 86400000;
  return 15 * 60000;
}

// Validate on cache reads as well as network reads. A cache write is best effort.
// Shared work has its own bounded lifetime: cancelling one subscriber cannot cancel another.
export async function cachedProvider<T>(
  path: string,
  schema: z.ZodType<T>,
  load: () => Promise<NoInfer<T>>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  const key = `provider:v1:${createHash('sha256').update(path).digest('hex')}`;
  const client = db(true);
  let prior = memory.get(key);
  if (!prior && client) {
    try {
      const { data } = await client
        .from('query_cache')
        .select('response')
        .eq('key', key)
        .maybeSingle();
      const parsed = snapshot.safeParse(data?.response);
      if (parsed.success) prior = parsed.data;
    } catch {
      /* Cache availability does not invalidate a provider response. */
    }
  }
  const valid = prior && schema.safeParse(prior.value);
  const age = prior ? Date.now() - Date.parse(prior.fetched_at) : Infinity;
  if (valid?.success && age >= 0 && age < providerTtl(path)) return valid.data;
  let work = pending.get(key);
  if (!work) {
    work = (async () => {
      const raw = schema.parse(await load());
      const fetched_at = new Date().toISOString();
      const value =
        raw && typeof raw === 'object' && 'meta' in raw
          ? { ...raw, meta: { ...(raw as { meta: object }).meta, fetched_at } }
          : raw;
      const row = { value, fetched_at: new Date().toISOString(), source_updated_at: null };
      if (memory.size >= 256) memory.delete(memory.keys().next().value!);
      memory.set(key, row);
      if (client) {
        try {
          await client
            .from('query_cache')
            .upsert({
              key,
              response: row,
              expires_at: new Date(Date.now() + providerTtl(path)).toISOString(),
            });
        } catch {
          /* Answer using the validated network result. */
        }
      }
      return row;
    })().finally(() => pending.delete(key));
    pending.set(key, work);
  }
  // Subscribers cancel independently without abandoning the shared cache fill.
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    work!
      .then(
        (row) => {
          if (signal.aborted) return reject(signal.reason);
          try {
            resolve(schema.parse(row.value));
          } catch (error) {
            reject(error);
          }
        },
        (error) => {
          if (signal.aborted) return reject(signal.reason);
          // A bounded historical snapshot is usable during an outage; callers must retain its date.
          if (valid?.success && age >= 0 && age < 30 * 86400000) resolve(valid.data);
          else reject(error);
        },
      )
      .finally(() => signal.removeEventListener('abort', abort));
  });
}
