import { clearProviderCache } from '../src/lib/provider-cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { liveProvider, webSearch } from '../src/lib/live-retrieval';
import { consume } from '../src/lib/security';
const state = vi.hoisted(() => ({
  block: null as null | { expires_at: string },
  error: null as null | object,
  writes: vi.fn(),
}));
vi.mock('../src/lib/security', () => ({ consume: vi.fn().mockResolvedValue(true) }));
vi.mock('../src/lib/db', () => ({
  db: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.block, error: state.error }) }),
      }),
      upsert: (value: unknown) => {
        state.writes(value);
        return { select: async () => ({ data: [], error: null }) };
      },
    }),
  }),
  checked: async (p: Promise<{ data: unknown }>) => (await p).data,
}));
const fetcher = vi.fn<typeof fetch>();
const signal = () => new AbortController().signal;
const schema = z.object({ data: z.array(z.string()), meta: z.object({}) });
beforeEach(() => {
  clearProviderCache();
  vi.stubEnv('CHAT_PROVIDER_REQUEST_LIMIT', '3');
  vi.stubEnv('UFCALENDAR_API_KEY_1', 'fixture-one');
  vi.stubEnv('UFCALENDAR_API_KEY_2', 'fixture-two');
  vi.stubEnv('UFCALENDAR_API_KEY_3', '');
  vi.stubEnv('CHAT_WEB_SEARCH_ENABLED', 'false');
  vi.stubEnv('WEB_SEARCH_PROVIDER', '');
  vi.stubEnv('BRAVE_SEARCH_API_KEY', '');
  vi.stubGlobal('fetch', fetcher);
  fetcher
    .mockReset()
    .mockImplementation(async () => Response.json({ data: ['fixture'], meta: {} }));
  state.block = null;
  state.error = null;
  state.writes.mockReset();
  vi.mocked(consume).mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('live adapters with mocked network and persistent quota controls', () => {
  it('caps each retrieval to three attempted provider calls', async () => {
    const get = liveProvider(signal());
    for (let i = 0; i < 3; i++) await get(`/events?limit=${i+1}`, schema);
    await expect(get('/events', schema)).rejects.toThrow('budget');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(consume).toHaveBeenCalledWith(
      expect.stringMatching(/^ufcalendar:primary:/),
      1,
      80,
      expect.any(Date),
    );
  });
  it('does not contact a provider with a persistent quota block', async () => {
    state.block = { expires_at: new Date(Date.now() + 60000).toISOString() };
    await expect(liveProvider(signal())('/events', schema)).rejects.toThrow('blocked');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('fails closed on quota-control errors and exhausted local budgets', async () => {
    state.error = {};
    await expect(liveProvider(signal())('/events', schema)).rejects.toThrow();
    state.error = null;
    vi.mocked(consume).mockResolvedValue(false);
    await expect(liveProvider(signal())('/events', schema)).rejects.toThrow('limit');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('persists provider exhaustion and never rotates accounts on 429', async () => {
    fetcher.mockResolvedValue(
      Response.json({ error: { code: 'quota_exceeded' } }, { status: 429 }),
    );
    await expect(liveProvider(signal())('/events', schema)).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.writes).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'ufcalendar:quota-block' }),
    );
  });
  it('preserves the existing request-time restriction to credential slot one', async () => {
    fetcher
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ data: ['fixture'], meta: {} }));
    await expect(liveProvider(signal())('/events', schema)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledTimes(2);
  });
  it('does not invent web access without explicit configuration', async () => {
    expect(await webSearch('UFC news', signal())).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });
  it('validates and restricts configured search results to public primary-source links', async () => {
    vi.stubEnv('CHAT_WEB_SEARCH_ENABLED', 'true');
    vi.stubEnv('WEB_SEARCH_PROVIDER', 'brave');
    vi.stubEnv('BRAVE_SEARCH_API_KEY', 'fixture-search');
    fetcher.mockResolvedValue(
      Response.json({
        web: {
          results: [
            {
              title: 'Official',
              url: 'https://www.ufc.com/news/fixture',
              description: '<b>Fixture</b>',
            },
            { title: 'Private', url: 'https://127.0.0.1/admin', description: 'bad' },
            { title: 'Credentials', url: 'https://secret@www.ufc.com/', description: 'bad' },
          ],
        },
      }),
    );
    expect(await webSearch('UFC news', signal())).toEqual([
      { title: 'Official', url: 'https://www.ufc.com/news/fixture', description: 'Fixture' },
    ]);
    expect(String(fetcher.mock.calls[0][0])).toMatch(/^https:\/\/api.search.brave.com\//);
  });
  it('makes no web call after budget exhaustion', async () => {
    vi.stubEnv('CHAT_WEB_SEARCH_ENABLED', 'true');
    vi.stubEnv('WEB_SEARCH_PROVIDER', 'brave');
    vi.stubEnv('BRAVE_SEARCH_API_KEY', 'fixture-search');
    vi.mocked(consume).mockResolvedValue(false);
    expect(await webSearch('UFC news', signal())).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
