import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { intelligentRetrieve, fresh, publicCitation } from '../src/lib/intelligent-retrieval';
import { events, fighters, news, rankings } from '../src/lib/data';
import { liveProvider, webSearch } from '../src/lib/live-retrieval';
import type { Fighter } from '../src/lib/schemas';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/db', () => ({ db: () => null }));
vi.mock('../src/lib/live-retrieval', () => ({
  liveProvider: vi.fn(() => request),
  webSearch: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/lib/data', () => ({
  events: vi.fn(),
  fighters: vi.fn(),
  news: vi.fn(),
  rankings: vi.fn(),
}));
const jon: Fighter = {
  id: 1,
  name: 'Jon Jones',
  slug: 'jon-jones',
  nickname: 'Bones',
  nationality: null,
  source_url: 'https://api.ufcalendar.com/v1/fighters/1',
  updated_at: new Date().toISOString(),
  records: {
    mma: {
      value: 'TEST-ONLY-1-0',
      wins: 1,
      losses: 0,
      draws: 0,
      no_contests: 0,
      scope: 'mma',
      source: 'fixture',
    },
  },
};
const event = {
  id: 10,
  slug: 'fixture',
  title: 'Synthetic UFC event',
  org: 'ufc' as const,
  status: 'completed' as const,
  starts_at: new Date(Date.now() - 86400000).toISOString(),
  tz: 'UTC',
  source_url: 'https://api.ufcalendar.com/v1/events/10',
  updated_at: new Date().toISOString(),
};
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.stubEnv('CHAT_LIVE_RETRIEVAL_ENABLED', 'false');
  request.mockReset();
  vi.mocked(webSearch).mockClear().mockResolvedValue([]);
  vi.mocked(events).mockResolvedValue({ items: [], state: 'ready' });
  vi.mocked(fighters).mockResolvedValue({ items: [], state: 'ready' });
  vi.mocked(news).mockResolvedValue({ items: [], state: 'ready' });
  vi.mocked(rankings).mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
describe('intelligent evidence pipeline — synthetic integrations', () => {
  it('retrieves a missing comparison participant instead of discarding the named opponent', async () => {
    vi.stubEnv('CHAT_LIVE_RETRIEVAL_ENABLED', 'true');
    const tom = { ...jon, id: 2, name: 'Tom Aspinall', slug: 'tom-aspinall', nickname: null };
    request.mockResolvedValueOnce({ data: [tom] }).mockResolvedValueOnce({ data: tom });
    const result = await intelligentRetrieve(
      'Compare Jon Jones and Tom Aspinall records',
      [],
      [jon],
      signal(),
    );
    expect(request.mock.calls[0][0]).toContain('q=Tom%20Aspinall');
    expect(result.deterministic).toContain('Jon Jones');
    expect(result.deterministic).toContain('Tom Aspinall');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('withholds conflicting numerical records for the same scope', async () => {
    const conflicting = {
      ...jon,
      records: {
        ...jon.records,
        other: { ...jon.records!.mma, value: 'CONFLICTING', scope: 'mma' },
      },
    };
    const r = await intelligentRetrieve('Jon Jones record', [], [conflicting], signal());
    expect(r.deterministic).toBeUndefined();
    expect(r.text).toContain('numerical record is withheld');
    expect(r.text).not.toContain('CONFLICTING');
    expect(r.cacheTtlMs).toBe(0);
  });
  it('does not let the model reinterpret profile statistics or null record counts', async () => {
    const r = await intelligentRetrieve('Who is Jon Jons?', [], [jon], signal());
    expect(r.deterministic).toContain('Jon Jones');
    expect(r.deterministic).not.toContain('no-contests');
    expect(r.text).not.toContain('slpm');
  });
  it('returns a deterministic scoped record with human-facing sources', async () => {
    const r = await intelligentRetrieve("What is Bones' MMA record?", [], [jon], signal());
    expect(r.deterministic).toContain('TEST-ONLY-1-0');
    expect(r.citations[0].url).toBe('https://www.ufcalendar.com');
    expect(r.text).not.toContain('api.ufcalendar.com');
    expect(request).not.toHaveBeenCalled();
  });
  it('continues from a missing local record to validated provider evidence', async () => {
    vi.stubEnv('CHAT_LIVE_RETRIEVAL_ENABLED', 'true');
    request
      .mockResolvedValue({ data: [jon] })
      .mockResolvedValueOnce({ data: [jon] })
      .mockResolvedValueOnce({ data: jon });
    const r = await intelligentRetrieve('Who is Jon Jons?', [], [], signal());
    expect(r.text).toContain('Jon Jones');
    expect(request.mock.calls[0][0]).toContain('/fighters?org=ufc&q=Jon%20Jons');
    expect(request.mock.calls[1][0]).toBe('/fighters/1');
  });
  it('uses completed event details for recent results', async () => {
    vi.stubEnv('CHAT_LIVE_RETRIEVAL_ENABLED', 'true');
    request
      .mockResolvedValueOnce({ data: [event] })
      .mockResolvedValueOnce({ data: { ...event, card: [] } });
    const r = await intelligentRetrieve('What happened at the latest UFC event?', [], [], signal());
    expect(request.mock.calls.map((c) => c[0])).toEqual([
      '/events?org=ufc&status=completed&order=desc&limit=1',
      '/events/10',
    ]);
    expect(r.text).toContain('Synthetic UFC event');
  });
  it('withholds stale events when refresh and web search are unavailable', async () => {
    vi.mocked(events).mockResolvedValue({
      items: [{ ...event, updated_at: '2020-01-01' }],
      state: 'ready',
    });
    const r = await intelligentRetrieve('latest UFC event', [], [], signal());
    expect(r.text).toBe('');
    expect(r.deterministic).toContain('verified');
    expect(r.cacheTtlMs).toBe(0);
  });
  it('retains dated fighter snapshots during credential failure without claiming current facts', async () => {
    vi.stubEnv('CHAT_LIVE_RETRIEVAL_ENABLED', 'true');
    request.mockRejectedValue(new Error('credentials unavailable'));
    const r = await intelligentRetrieve(
      'Jon Jones record',
      [],
      [{ ...jon, updated_at: '2020-01-01' }],
      signal(),
    );
    expect(r.text).toContain('2020-01-01');
    expect(r.text).toContain('unavailable');
    expect(r.deterministic).toBeUndefined();
    expect(r.cacheTtlMs).toBe(0);
  });
  it('does not mistake missing data for fighter nonexistence', async () => {
    const r = await intelligentRetrieve('Tell me about Unknown Fighter', [], [], signal());
    expect(r.deterministic).toContain('confirm the spelling');
    expect(r.deterministic).not.toContain('does not exist');
  });
  it('asks for clarification before retrieving conflicting identities', async () => {
    const r = await intelligentRetrieve(
      'Bones record',
      [],
      [jon, { ...jon, id: 2, name: 'Another Fighter' }],
      signal(),
    );
    expect(r.deterministic).toContain('Which fighter');
    expect(request).not.toHaveBeenCalled();
  });
  it('keeps multiple fighters and their source dates', async () => {
    const other = { ...jon, id: 2, name: 'Tom Aspinall', slug: 'tom-aspinall', nickname: null };
    const r = await intelligentRetrieve(
      'Compare Jon Jones and Tom Aspinall',
      [],
      [jon, other],
      signal(),
    );
    expect(r.text).toContain('Jon Jones');
    expect(r.text).toContain('Tom Aspinall');
    expect(r.deterministic).toBeUndefined();
  });
  it('rejects executable citations and invalid/future freshness', () => {
    expect(
      publicCitation({ title: 'bad', url: 'javascript:alert(1)', updated_at: '' }),
    ).toBeUndefined();
    expect(fresh('invalid', 1000)).toBe(false);
    expect(fresh('2099-01-01', 1000)).toBe(false);
    expect(fresh(new Date().toISOString(), 1000)).toBe(true);
  });
  it('does not claim a search excerpt establishes a record', async () => {
    vi.mocked(webSearch).mockResolvedValue([
      {
        title: 'Fixture',
        url: 'https://www.ufc.com/athlete/fixture',
        description: 'Unverified snippet',
      },
    ]);
    const r = await intelligentRetrieve('Unknown UFC fighter', [], [], signal());
    expect(r.text).toContain('discovery_only');
    expect(r.text).toContain('Do not use it to assert records');
  });
  it('handles search provider failure without exposing errors', async () => {
    vi.mocked(webSearch).mockRejectedValue(new Error('private-secret'));
    const r = await intelligentRetrieve('Unknown UFC fighter', [], [], signal());
    expect(JSON.stringify(r)).not.toContain('private-secret');
    expect(r.deterministic).toBeTruthy();
  });
  it('creates provider controls even when the live flag is disabled, without issuing calls', async () => {
    await intelligentRetrieve('Jon Jones profile', [], [jon], signal());
    expect(liveProvider).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
