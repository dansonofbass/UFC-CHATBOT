import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { cachedEvidence } from '../src/lib/cache';
const state = vi.hoisted(() => ({
  cached: null as null | { response: unknown; expires_at: string },
  key: '',
  write: vi.fn(),
}));
vi.mock('../src/lib/db', () => ({
  db: () => ({
    from: () => ({
      select: () => ({
        eq: (_: string, key: string) => {
          state.key = key;
          return { maybeSingle: async () => ({ data: state.cached }) };
        },
      }),
      upsert: state.write,
    }),
  }),
}));
beforeEach(() => {
  state.cached = null;
  state.write.mockReset();
  vi.stubEnv('CHAT_INTELLIGENCE_ENABLED', 'false');
});
afterEach(() => vi.unstubAllEnvs());
describe('persistent evidence cache', () => {
  it('serves unexpired evidence without retrieval', async () => {
    const evidence = { text: 'fixture', citations: [] };
    state.cached = { response: evidence, expires_at: new Date(Date.now() + 60000).toISOString() };
    const load = vi.fn();
    expect(await cachedEvidence('q', 'h', load)).toEqual(evidence);
    expect(load).not.toHaveBeenCalled();
  });
  it('reloads expired evidence and writes bounded expiry', async () => {
    state.cached = { response: { text: 'old', citations: [] }, expires_at: '2020-01-01' };
    const load = vi.fn().mockResolvedValue({ text: 'fresh', citations: [], cacheTtlMs: 15000 });
    await cachedEvidence('q', 'h', load);
    expect(load).toHaveBeenCalledOnce();
    expect(Date.parse(state.write.mock.calls[0][0].expires_at) - Date.now()).toBeLessThanOrEqual(
      15000,
    );
  });
  it('separates history and feature-flag modes', async () => {
    const load = async () => ({ text: '', citations: [] });
    await cachedEvidence('q', 'h', load);
    const first = state.key;
    await cachedEvidence('q', 'other', load);
    expect(state.key).not.toBe(first);
    vi.stubEnv('CHAT_INTELLIGENCE_ENABLED', 'true');
    await cachedEvidence('q', 'h', load);
    expect(state.key).not.toBe(first);
  });
  it('does not cache unavailable, ambiguous or degraded evidence', async () => {
    await cachedEvidence('q', 'h', async () => ({ text: 'partial', citations: [], cacheTtlMs: 0 }));
    await cachedEvidence('q', 'h', async () => ({
      text: '',
      citations: [],
      deterministic: 'Which fighter?',
    }));
    expect(state.write).not.toHaveBeenCalled();
  });
});
