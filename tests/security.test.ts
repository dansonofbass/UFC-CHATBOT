import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeUrl, eventSchema, rankingSchema } from '../src/lib/schemas';
import { authorized, consume, internalBudgetScope } from '../src/lib/security';
import { digest, chunks } from '../src/lib/ingestion';
import { providers } from '../src/lib/ai';
afterEach(() => vi.unstubAllEnvs());
describe('security and validation', () => {
  it('isolates preview and development budgets while retaining the production ledger', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(internalBudgetScope()).toBe('');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(internalBudgetScope()).toBe('preview:');
    vi.stubEnv('VERCEL_ENV', '');
    expect(internalBudgetScope()).toBe('development:');
  });
  it('rejects executable citations', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,x')).toBeUndefined();
    expect(safeUrl('https://ufc.com/event')).toBe('https://ufc.com/event');
  });
  it('protects diagnostics with constant-time bearer verification', () => {
    vi.stubEnv('INTERNAL_API_TOKEN', 'x'.repeat(40));
    expect(authorized(null)).toBe(false);
    expect(authorized('Bearer bad')).toBe(false);
    expect(authorized(`Bearer ${'x'.repeat(40)}`)).toBe(true);
  });
  it('fails closed without persistent usage controls', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    await expect(consume('fixture', 1, 10, new Date())).rejects.toThrow('unavailable');
  });
  it('rejects paid fallback models', () => {
    vi.stubEnv('ALLOW_OPENROUTER_FALLBACK', 'true');
    vi.stubEnv('OPENROUTER_API_KEY', 'fixture');
    vi.stubEnv('OPENROUTER_MODEL', 'paid/model');
    expect(() => providers()).toThrow('free');
  });
  it('deduplicates source identities and bounds chunks', () => {
    expect(digest('same')).toBe(digest('same'));
    expect(digest('a')).not.toBe(digest('b'));
    const parts = chunks('a'.repeat(3000));
    expect(parts.every((p) => p.length <= 1100)).toBe(true);
    expect(parts.length).toBe(4);
  });
  it('retains historical dates and rejects other promotions', () => {
    const e = {
      id: 1,
      slug: 'historical-fixture',
      title: 'Synthetic test event',
      org: 'ufc',
      starts_at: '2001-01-01T00:00:00Z',
      tz: 'America/Los_Angeles',
      status: 'completed',
    };
    expect(eventSchema.parse(e).starts_at).toBe(e.starts_at);
    expect(() => eventSchema.parse({ ...e, org: 'pfl' })).toThrow();
  });
  it('requires a ranking snapshot timestamp', () => {
    expect(() => rankingSchema.parse({ org: 'ufc', board: 'official', divisions: [] })).toThrow();
  });
});
