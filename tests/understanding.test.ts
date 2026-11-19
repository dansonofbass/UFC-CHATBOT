import { describe, it, expect } from 'vitest';
import { candidates, understand } from '../src/lib/understanding';
const jon = { id: 1, name: 'Jon Jones', slug: 'jon-jones', nickname: 'Bones' };
const tom = { id: 2, name: 'Tom Aspinall', slug: 'tom-aspinall', nickname: null };
describe('query understanding using directory identities', () => {
  it.each([
    'Who is Jon Jones?',
    'Who is Jon Jons?',
    'Tell me about John Jones.',
    'What is Bones’ MMA record?',
  ])('resolves %s', (q) => {
    const p = understand(q, [], [jon, tom]);
    expect(p.fighters.map((f) => f.id)).toEqual([1]);
    expect(p.intent).not.toBe('out_of_scope');
  });
  it('treats a record request about a first-name fighter as UFC-related', () => {
    const khabib = { id: 7, name: 'Khabib Nurmagomedov', slug: 'khabib-nurmagomedov', nickname: 'The Eagle' };
    const plan = understand('give me the record of khabib', [], [jon, tom, khabib]);
    expect(plan.intent).toBe('fighter_history');
    expect(plan.fighters.map(f => f.id)).toEqual([7]);
    expect(plan.ambiguous).toBe(false);
  });
  it('recognizes a named fighter record request even if the local directory is empty', () => {
    const plan = understand('give me the record of khabib', [], []);
    expect(plan.intent).not.toBe('out_of_scope');
    expect(plan.subject).toBe('khabib');
    expect(plan.intents).toContain('fighter_history');
  });
  it('keeps genuinely ambiguous first-name references ambiguous', () => {
    const fighters = [
      { id: 7, name: 'Khabib Nurmagomedov', slug: 'khabib-nurmagomedov' },
      { id: 8, name: 'Khabib Khabibov', slug: 'khabib-khabibov' },
    ];
    expect(understand('khabib record', [], fighters).ambiguous).toBe(true);
  });
  it('works for arbitrary imported names, diacritics and aliases', () => {
    const f = { id: 3, name: 'José Alvarex', slug: 'jose-alvarex', aliases: ['El Ejemplo'] };
    expect(candidates('Jose Alvarez record', [f])[0].fighter).toBe(f);
    expect(candidates('El Ejemplo', [f])[0].confidence).toBe(1);
  });
  it('does not match nickname substrings, unrelated or unknown fighters', () => {
    expect(candidates('bonesaw recipes', [jon])).toEqual([]);
    expect(candidates('Unknown Person', [jon, tom])).toEqual([]);
    expect(candidates('Jon Smith', [jon])).toEqual([]);
  });
  it('uses the nearest user subject, ignoring assistant suggestions', () => {
    const p = understand(
      'Who did he fight last?',
      [
        { role: 'user', content: 'Jon Jones' },
        { role: 'user', content: 'Tell me about Tom Aspinall' },
        { role: 'assistant', content: 'Jon Jones is also an option.' },
      ],
      [jon, tom],
    );
    expect(p.fighters).toEqual([tom]);
    expect(p.intent).toBe('fighter_history');
  });
  it('does not carry a prior subject into an explicit new question', () => {
    expect(
      understand('Tell me about Unknown Person', [{ role: 'user', content: 'Jon Jones' }], [jon])
        .fighters,
    ).toEqual([]);
  });
  it('supports comparisons and multiple intents', () => {
    const p = understand('Compare Jon Jones and Tom Aspinall records and news', [], [jon, tom]);
    expect(p.fighters).toHaveLength(2);
    expect(p.intents).toContain('fighter_history');
    expect(p.intents).toContain('recent_news');
  });
  it('asks rather than silently resolving colliding nicknames or pronouns', () => {
    expect(understand('Bones record', [], [jon, { ...tom, nickname: 'Bones' }]).ambiguous).toBe(
      true,
    );
    expect(
      understand(
        'Who did he fight last?',
        [{ role: 'user', content: 'Compare Jon Jones and Tom Aspinall' }],
        [jon, tom],
      ).ambiguous,
    ).toBe(true);
  });
  it('routes latest event to results rather than news', () => {
    expect(understand('What happened at the latest UFC event?', [], []).intent).toBe(
      'completed_event',
    );
  });
});
