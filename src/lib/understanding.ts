import { classify, resolveIntent, type Intent, type Message } from './router';

export type Identity = {
  id: number;
  name: string;
  slug: string;
  nickname?: string | null;
  aliases?: string[];
};
export const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++)
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(a[i] !== b[j])));
    row = next;
  }
  return row[b.length];
}
export function candidates<T extends Identity>(text: string, directory: T[]) {
  const words = normalize(text).split(' ').slice(0, 100);
  return directory
    .flatMap((f) => {
      let confidence = 0;
      for (const alias of [
        f.name,
        f.slug.replaceAll('-', ' '),
        f.nickname || '',
        ...(f.aliases || []),
      ]) {
        const name = normalize(alias);
        if (name.length < 3) continue;
        if (` ${words.join(' ')} `.includes(` ${name} `)) {
          confidence = 1;
          break;
        }
        const tokens = name.split(' ');
        // Fuzzy matching requires the full multi-token name; single nicknames remain exact.
        if (tokens.length < 2) continue;
        for (let i = 0; i <= words.length - tokens.length; i++) {
          const window = words.slice(i, i + tokens.length);
          if (window.some((w, j) => w[0] !== tokens[j][0])) continue;
          const edits = distance(window.join(' '), name);
          if (edits <= 2)
            confidence = Math.max(
              confidence,
              1 - edits / Math.max(name.length, window.join(' ').length),
            );
        }
      }
      return confidence >= 0.78 ? [{ fighter: f, confidence }] : [];
    })
    .sort((a, b) => b.confidence - a.confidence);
}
export function understand<T extends Identity>(query: string, history: Message[], directory: T[]) {
  const names = directory.flatMap((f) => [f.name, f.nickname || '']);
  let matches = candidates(query, directory);
  const contextual =
    /\b(he|she|his|her|they|their|him|last|it)\b|^(and|what about|how about)\b/i.test(query);
  if (!matches.length && contextual) {
    for (const m of history
      .filter((m) => m.role === 'user')
      .slice(-4)
      .reverse()) {
      matches = candidates(m.content, directory);
      if (matches.length) break;
    }
  }
  const multiple = /\b(and|versus|vs|compare|both)\b/i.test(query);
  const ambiguous = matches.length > 1 && !multiple;
  const selected = ambiguous ? [] : matches.slice(0, 3).map((m) => m.fighter);
  let intent = resolveIntent(query, history, names);
  if (intent === 'out_of_scope' && matches.length && !/ignore|reveal|system prompt/i.test(query))
    intent = classify(`UFC ${query}`, [], names);
  if (/\b(last|latest|recent)\b.*\b(event|card)\b|what happened.*\bufc\b/i.test(query))
    intent = 'completed_event';
  if (/\bwho did\b.*\bfight\b|\blast (fight|opponent)\b/i.test(query)) intent = 'fighter_history';
  const intents: Intent[] = [intent];
  if (/\brecord|career|history\b/i.test(query) && !intents.includes('fighter_history'))
    intents.push('fighter_history');
  if (/\bnews\b/i.test(query) && !intents.includes('recent_news')) intents.push('recent_news');
  if (/\bstats|statistics|accuracy\b/i.test(query) && !intents.includes('fight_statistics'))
    intents.push('fight_statistics');
  const subject = query
    .match(/(?:who is|tell me about|about|record of)\s+([\p{L}'’ -]{3,65})/iu)?.[1]
    ?.replace(/\b(mma record|record|ufc|fighter)\b.*$/i, '')
    .trim();
  // A name-shaped question is unresolved, not automatically outside UFC scope.
  // Provider matching still has to establish an actual identity before any facts are used.
  if (
    intent === 'out_of_scope' &&
    subject &&
    /^(who is|tell me about)\b/i.test(query) &&
    !/ignore|reveal|system prompt/i.test(query)
  ) {
    intent = 'unknown';
    intents[0] = intent;
  }
  return {
    intent,
    intents,
    fighters: selected,
    candidates: matches,
    ambiguous,
    contextual,
    subject,
    query: selected.length
      ? `${query}\nSubjects: ${selected.map((f) => f.name).join(', ')}`
      : query,
  };
}
