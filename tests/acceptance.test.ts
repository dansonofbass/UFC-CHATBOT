import { afterEach, describe, expect, it, vi } from 'vitest';
import { understand } from '../src/lib/understanding';
import { intelligentRetrieve } from '../src/lib/intelligent-retrieval';
import type { Fighter } from '../src/lib/schemas';
vi.mock('../src/lib/db', () => ({ db: () => null }));
vi.mock('../src/lib/data', () => ({
  fighters: async () => ({ items: [] }),
  events: async () => ({ items: [] }),
  news: async () => ({ items: [] }),
  rankings: async () => null,
}));
const get = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/live-retrieval', () => ({
  liveProvider: () => get,
  webSearch: async () => [],
}));
const directory: Fighter[] = [
  ['Islam Makhachev', ''],
  ['Khabib Nurmagomedov', 'The Eagle'],
  ['Jon Jones', 'Bones'],
  ['Tom Aspinall', ''],
].map(([name, nickname], i) => ({
  id: i + 1,
  name,
  nickname,
  nationality: null,
  slug: name.toLowerCase().replaceAll(' ', '-'),
  source_url: 'https://www.ufcalendar.com',
  updated_at: new Date().toISOString(),
  records: {
    mma: {
      value: `SYNTHETIC-${i + 1}-0`,
      wins: i + 1,
      losses: 0,
      draws: 0,
      no_contests: 0,
      scope: 'mma',
      source: 'fixture',
    },
  },
  stats: {
    slpm: '2.00',
    sapm: '1.00',
    str_acc: '50%',
    str_def: '60%',
    td_avg: '3.00',
    td_acc: '45%',
    td_def: `${80 + i}%`,
    sub_avg: '1.00',
    basis: { scope: 'ufc-only', bouts: 5 },
  },
}));
const cases: [string, string, number[]][] = [
  ['Explain UFC fight statistics.', 'rules', []],
  ['What is SLpM?', 'rules', []],
  ['What is takedown defense?', 'rules', []],
  ['Tell me about Islam Makhachev.', 'fighter_profile', [1]],
  ['islam makhachev', 'fighter_profile', [1]],
  ['Give me the record of Khabib.', 'fighter_history', [2]],
  ['Who is Khabib Nurmagomedov?', 'fighter_profile', [2]],
  ['Tell me about Jon Jones.', 'fighter_profile', [3]],
  ['Compare Jon Jones and Tom Aspinall.', 'fighter_comparison', [3, 4]],
  ['Compare Khabib and Islam Makhachev.', 'fighter_comparison', [1, 2]],
  ['How does UFC scoring work?', 'rules', []],
  ['What is the difference between a TKO and a KO?', 'rules', []],
  ['Explain the difference between striking accuracy and striking defense.', 'rules', []],
  ['What does control time mean?', 'rules', []],
  ['How are UFC rankings determined?', 'rules', []],
  ["What happened in Islam Makhachev's last fight?", 'fighter_history', [1]],
  ['Who did Khabib fight last?', 'fighter_history', [2]],
  ['What is the next UFC event?', 'upcoming_event', []],
  ['What was the latest completed UFC event?', 'completed_event', []],
  ['Why is grappling important in MMA?', 'rules', []],
];
afterEach(() => {
  vi.unstubAllEnvs();
  get.mockReset();
});
describe('twenty representative acceptance plans', () => {
  it.each(cases)('%s', (query, intent, ids) => {
    const plan = understand(query, [], directory);
    expect(plan.intent).toBe(intent);
    expect(plan.fighters.map((f) => f.id).sort()).toEqual(ids);
    expect(plan.ambiguous).toBe(false);
  });
});
describe('five multi-turn conversations', () => {
  it('keeps a numbered event across a follow-up without carrying it into a new fighter question', () => {
    expect(
      understand(
        'What about its fight card?',
        [{ role: 'user', content: 'Tell me about UFC 300' }],
        directory,
      ).eventSubject,
    ).toBe('UFC 300');
    expect(
      understand(
        'Tell me about Jon Jones',
        [{ role: 'user', content: 'Tell me about UFC 300' }],
        directory,
      ).eventSubject,
    ).toBeUndefined();
  });
  it('resolves an event through the documented global search and verifies its details', async () => {
    vi.stubEnv('CHAT_LIVE_RETRIEVAL_ENABLED', 'true');
    const event = {
      id: 300,
      slug: 'synthetic-event',
      title: 'UFC 300: Synthetic event',
      org: 'ufc',
      starts_at: '2024-04-14T00:00:00Z',
      tz: 'UTC',
      status: 'completed',
      card: [],
    };
    get.mockImplementation(async (path, schema) =>
      schema.parse({ data: path.startsWith('/search') ? { events: [event] } : event, meta: {} }),
    );
    const result = await intelligentRetrieve(
      'Tell me about UFC 300',
      [],
      [],
      new AbortController().signal,
    );
    expect(get.mock.calls.map((c) => c[0])).toEqual(['/search?q=UFC%20300', '/events/300']);
    expect(result.text).toContain('Synthetic event');
    expect(result.text).toContain('never infer winners');
  });
  it('prefers an exact full identity over an incidental shared first name', () => {
    const plan = understand(
      'Tell me about Islam Makhachev.',
      [],
      [...directory, { ...directory[0], id: 99, name: 'Islam Mamedov', slug: 'islam-mamedov' }],
    );
    expect(plan.fighters.map((f) => f.id)).toEqual([1]);
    expect(plan.ambiguous).toBe(false);
  });
  const conversations: [string[], number[], string][] = [
    [['Explain UFC fight statistics.', 'islam makhachev'], [1], 'fight_statistics'],
    [
      [
        'Tell me about Islam Makhachev.',
        'What about his takedown defense?',
        'Compare that with Khabib.',
      ],
      [1, 2],
      'fighter_comparison',
    ],
    [['Tell me about Khabib.', 'What was his record?'], [2], 'fighter_history'],
    [
      ['Compare Khabib and Islam Makhachev.', 'Who was better at takedowns?'],
      [1, 2],
      'fighter_comparison',
    ],
    [
      ['Tell me about Khabib.', 'Tell me about Jon Jones.', 'What was his record?'],
      [3],
      'fighter_history',
    ],
  ];
  it.each(conversations)('resolves %j', (turns, ids, intent) => {
    const plan = understand(
      turns.at(-1)!,
      turns.slice(0, -1).map((content) => ({ role: 'user' as const, content })),
      directory,
    );
    expect(plan.fighters.map((f) => f.id).sort()).toEqual(ids);
    expect(plan.intent).toBe(intent);
    expect(plan.ambiguous).toBe(false);
  });
  it('answers educational questions during structured-provider outage', async () => {
    vi.stubEnv('CHAT_LIVE_RETRIEVAL_ENABLED', 'true');
    get.mockRejectedValue(new Error('outage'));
    for (const [query, intent] of cases.filter((c) => c[1] === 'rules')) {
      expect(intent).toBe('rules');
      const result = await intelligentRetrieve(query, [], [], new AbortController().signal);
      expect(result.text).toContain('educational');
      expect(result.deterministic?.length).toBeGreaterThan(100);
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.text).not.toContain('not enough verified');
    }
    expect(get).not.toHaveBeenCalled();
  });
  it('resolves both comparison participants with an empty database', async () => {
    vi.stubEnv('CHAT_LIVE_RETRIEVAL_ENABLED', 'true');
    get.mockImplementation(async (path, schema) => {
      const fighter =
        path.includes('q=Khabib') || path === '/fighters/2' ? directory[1] : directory[0];
      return schema.parse({ data: path.includes('?') ? [fighter] : fighter, meta: {} });
    });
    const result = await intelligentRetrieve(
      'Compare Khabib and Islam Makhachev.',
      [],
      [],
      new AbortController().signal,
    );
    expect(result.text).toContain('Khabib Nurmagomedov');
    expect(result.text).toContain('Islam Makhachev');
    expect(result.text).toContain('SYNTHETIC-1-0');
    expect(get).toHaveBeenCalledTimes(4);
  });
});
