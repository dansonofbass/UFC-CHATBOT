import { beforeEach, describe, it, expect, vi } from 'vitest';
import { retrieve } from '../src/lib/retrieval';
import { resolveIntent } from '../src/lib/router';
import { fighters, events, news, rankings } from '../src/lib/data';
vi.mock('../src/lib/db', () => ({ db: () => null }));
vi.mock('../src/lib/data', () => ({
  fighters: vi.fn(),
  events: vi.fn(),
  news: vi.fn(),
  rankings: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(fighters).mockResolvedValue({ items: [], state: 'ready' });
  vi.mocked(events).mockResolvedValue({ items: [], state: 'ready' });
  vi.mocked(news).mockResolvedValue({ items: [], state: 'ready' });
  vi.mocked(rankings).mockResolvedValue(null);
});
describe('structured retrieval — synthetic fixtures only', () => {
  it('does not invent context when tables are empty', async () => {
    expect(await retrieve('UFC news', [], 'recent_news')).toEqual({ text: '', citations: [] });
  });
  it('chooses the earliest scheduled event and preserves source timestamps', async () => {
    const base = {
      id: 1,
      org: 'ufc' as const,
      status: 'scheduled' as const,
      tz: 'UTC',
      slug: 'fixture',
      title: 'Synthetic fixture',
      source_url: 'https://example.com/event',
      updated_at: '2026-01-01T00:00:00Z',
    };
    vi.mocked(events).mockResolvedValue({
      items: [
        { ...base, starts_at: '2026-12-03T02:00:00Z' },
        { ...base, id: 2, starts_at: '2026-12-01T02:00:00Z' },
      ],
      state: 'ready',
    });
    const r = await retrieve('next UFC event', [], 'upcoming_event');
    expect(r.deterministic).toContain('2026-12-01');
    expect(r.citations[0].updated_at).toBe(base.updated_at);
  });
  it('retains ranking snapshot dates instead of asserting current status', async () => {
    vi.mocked(rankings).mockResolvedValue({
      org: 'ufc',
      board: 'official',
      snapshot_date: '2020-01-01',
      divisions: [],
      source_url: 'https://example.com/rankings',
      updated_at: '2026-01-01',
    });
    const r = await retrieve('UFC rankings', [], 'rankings');
    expect(r.text).toContain('2020-01-01');
    expect(r.citations[0].title).toContain('2020-01-01');
  });
  it('preserves stale news publication and import timestamps', async () => {
    vi.mocked(news).mockResolvedValue({
      items: [
        {
          id: 'fixture',
          title: 'Synthetic UFC report',
          url: 'https://example.com/news',
          published_at: '2020-01-01',
          updated_at: '2020-01-02',
          source: 'fixture',
          excerpt: 'Fixture only',
          confirmation: 'report',
        },
      ],
      state: 'ready',
    });
    const r = await retrieve('latest UFC news', [], 'recent_news');
    expect(r.text).toContain('2020-01-01');
    expect(r.citations[0].updated_at).toBe('2020-01-02');
  });
  it('resolves an event followup and a specific career followup', () => {
    expect(
      resolveIntent('And when is it?', [{ role: 'user', content: 'What is the next UFC event?' }]),
    ).toBe('upcoming_event');
    expect(
      resolveIntent('What about his record?', [
        { role: 'user', content: 'Tell me about UFC fighter Jones' },
      ]),
    ).toBe('fighter_history');
  });
});
