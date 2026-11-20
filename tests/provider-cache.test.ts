import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { cachedProvider, clearProviderCache } from '../src/lib/provider-cache';
vi.mock('../src/lib/db', () => ({ db: () => null }));
const schema = z.object({
  data: z.string(),
  meta: z.object({ fetched_at: z.string().optional() }),
});
const signal = () => new AbortController().signal;
beforeEach(() => clearProviderCache());
afterEach(() => vi.useRealTimers());
it('deduplicates concurrent lookups and reuses validated snapshots', async () => {
  const load = vi.fn(async () => ({ data: 'verified', meta: {} }));
  const result = await Promise.all(
    Array.from({ length: 50 }, () => cachedProvider('/fighters/123', schema, load, signal())),
  );
  expect(load).toHaveBeenCalledTimes(1);
  expect(result.every((r) => r.data === 'verified')).toBe(true);
  expect(result[0].meta.fetched_at).toBeTruthy();
  await cachedProvider('/fighters/123', schema, load, signal());
  expect(load).toHaveBeenCalledTimes(1);
});
it('refreshes expired snapshots and retains the actual fetched date during an outage', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01'));
  const first = await cachedProvider(
    '/fighters/123',
    schema,
    async () => ({ data: 'dated', meta: {} }),
    signal(),
  );
  vi.setSystemTime(new Date('2026-11-03'));
  const load = vi.fn().mockRejectedValue(new Error('outage'));
  const stale = await cachedProvider('/fighters/123', schema, load, signal());
  expect(load).toHaveBeenCalledTimes(1);
  expect(stale.meta.fetched_at).toBe(first.meta.fetched_at);
  expect(stale.data).toBe('dated');
});
it('does not cache invalid responses', async () => {
  const invalid = vi.fn(async () => ({ data: 123, meta: {} }) as never);
  await expect(cachedProvider('/fighters/123', schema, invalid, signal())).rejects.toThrow();
  await expect(cachedProvider('/fighters/123', schema, invalid, signal())).rejects.toThrow();
  expect(invalid).toHaveBeenCalledTimes(2);
});
it('cancels one subscriber independently of shared work', async () => {
  let finish!: (value: { data: string; meta: object }) => void;
  const load = () =>
    new Promise<{ data: string; meta: object }>((resolve) => {
      finish = resolve;
    });
  const controller = new AbortController();
  const one = cachedProvider('/fighters/1', schema, load, controller.signal);
  const two = cachedProvider('/fighters/1', schema, load, signal());
  const rejected = expect(one).rejects.toThrow();
  controller.abort();
  finish({ data: 'ok', meta: {} });
  await rejected;
  expect((await two).data).toBe('ok');
});
