import { classify, resolveIntent, type Intent, type Message } from './router';
import { conversationTopic, educationalQuestion, topicIntent } from './chat-strategy';

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
        // A clearly named fighter may be referenced by one given name or surname.
        // Preserve ambiguity when multiple roster entries share that token.
        if (tokens.length >= 2 && words.some((w) => w.length >= 4 && tokens.some((t) => t === w))) {
          confidence = Math.max(confidence, 0.86);
        }
        // Full multi-token fuzzy matching keeps small spelling errors tolerable.
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
  const explicitMatches = matches.length > 0;
  const topic = conversationTopic([{ role: 'user', content: query }]) || conversationTopic(history);
  const contextual =
    /\b(he|she|his|her|they|their|him|them|that|those|both|its|it)\b|^(and|what about|how about)\b/i.test(
      query,
    ) ||
    (/\bbetter\b/i.test(query) &&
      history
        .filter((m) => m.role === 'user')
        .slice(-3)
        .some((m) => /compar|versus|\bvs\b/i.test(m.content)));
  if (!matches.length && contextual) {
    for (const m of history
      .filter((m) => m.role === 'user')
      .slice(-4)
      .reverse()) {
      matches = candidates(m.content, directory);
      if (matches.length) break;
    }
  }
  // A comparison keeps its previous subject alongside the explicitly new one.
  if (explicitMatches && contextual && /compar|\bwith\b|\bversus\b/i.test(query)) {
    for (const m of history
      .filter((m) => m.role === 'user')
      .slice(-6)
      .reverse()) {
      const previous = candidates(m.content, directory);
      if (previous.length) {
        matches = [
          ...matches,
          ...previous.filter((p) => !matches.some((c) => c.fighter.id === p.fighter.id)),
        ];
        break;
      }
    }
  }
  // A bare fighter name after a statistics question refers to the same topic.
  // Structured retrieval must still independently verify the named fighter.
  const bareName =
    /^[\p{L}'’]+(?:[ -][\p{L}'’]+){0,3}$/u.test(query.trim()) &&
    !/\b(?:explain|what|how|why|when|give|show|stats|statistics|record|fight|ufc|mma|compare|tell|latest|next|rules|are|is)\b/i.test(
      query,
    );
  const precedingUserQuestion =
    history.filter((message) => message.role === 'user').at(-1)?.content || '';
  const statsFollowup =
    bareName && classify(precedingUserQuestion, [], names) === 'fight_statistics';
  const multiple =
    /\b(and|versus|vs|compare|both|better)\b/i.test(query) ||
    (contextual &&
      /\b(that|both|them|they|their|those)\b/i.test(query) &&
      history
        .filter((m) => m.role === 'user')
        .slice(-3)
        .some((m) => /compar|versus|\bvs\b/i.test(m.content)));
  // An exact full identity outranks incidental shared-name tokens. Keep ties ambiguous.
  if (!multiple && matches[0]?.confidence === 1)
    matches = matches.filter((m) => m.confidence === 1);
  const ambiguous = matches.length > 1 && !multiple;
  const selected = ambiguous ? [] : matches.slice(0, 3).map((m) => m.fighter);
  const eventSubject =
    query.match(/\bUFC\s+\d{1,4}\b/i)?.[0] ||
    (!explicitMatches && contextual
      ? history
          .filter((m) => m.role === 'user')
          .slice(-6)
          .reverse()
          .map((m) => m.content.match(/\bUFC\s+\d{1,4}\b/i)?.[0])
          .find(Boolean)
      : undefined);
  let intent = resolveIntent(query, history, names);
  if (intent === 'out_of_scope' && matches.length && !/ignore|reveal|system prompt/i.test(query))
    intent = classify(`UFC ${query}`, [], names);
  if (/\b(last|latest|recent)\b.*\b(event|card)\b|what happened.*\bufc\b/i.test(query))
    intent = 'completed_event';
  if (/\bwho did\b.*\bfight\b|\blast (fight|opponent)\b/i.test(query)) intent = 'fighter_history';
  if (statsFollowup) intent = 'fight_statistics';
  if (
    selected.length &&
    /\b(win|wins|won|loss|losses|lost|victories|victory|opponents?|finished)\b/i.test(query) &&
    /submission|knockout|\btko\b|\bko\b|decision|method/i.test(query)
  )
    intent = 'fighter_history';
  if (eventSubject)
    intent = /\b(next|upcoming)\b/i.test(query) ? 'upcoming_event' : 'completed_event';
  const educational = educationalQuestion(query, explicitMatches || !!eventSubject);
  if (educational) intent = 'rules';
  if (
    !educational &&
    selected.length &&
    /takedown|defen[cs]e|slpm|sapm|control time|submission attempts/i.test(query)
  )
    intent = 'fight_statistics';
  if (contextual && selected.length && /compar|\bthat\b|\bboth\b|\bbetter\b/i.test(query))
    intent = selected.length > 1 ? 'fighter_comparison' : topicIntent(topic) || intent;
  // Bare names may be resolved by the provider even with an empty local directory.
  if (bareName && intent === 'out_of_scope' && !/^(hello|hi|thanks|thank you)$/i.test(query.trim()))
    intent = 'unknown';
  const intents: Intent[] = [intent];
  if (contextual && topicIntent(topic) && !intents.includes(topicIntent(topic)!))
    intents.push(topicIntent(topic)!);
  if (
    intent === 'fighter_comparison' &&
    /takedown|strik|defen[cs]e|grappl|stats|statistics/i.test(query) &&
    !intents.includes('fight_statistics')
  )
    intents.push('fight_statistics');
  if (/\brecord|career|history\b/i.test(query) && !intents.includes('fighter_history'))
    intents.push('fighter_history');
  if (/\bnews\b/i.test(query) && !intents.includes('recent_news')) intents.push('recent_news');
  if (
    !educational &&
    /\bstats|statistics|accuracy\b/i.test(query) &&
    !intents.includes('fight_statistics')
  )
    intents.push('fight_statistics');
  const subject =
    query
      .match(
        /(?:who is|tell me about|about|records? of|records? for|records? does|profile of|stats of|stats for)\s+([\p{L}'’ -]{3,65})/iu,
      )?.[1]
      ?.replace(/\b(mma record|record|ufc|fighter|have|has|and|what|his|her|their)\b.*$/i, '')
      .trim() ||
    (bareName && !educational && (statsFollowup || matches.length > 0 || intent !== 'out_of_scope')
      ? query.trim()
      : undefined);
  const pair = query.match(
    /(?:compare\s+)?(.+?)\s+(?:and|versus|vs\.?)\s+(.+?)(?:\s+(?:records?|stats|statistics)\b.*|[?.]|$)/i,
  );
  const subjects =
    intent === 'fighter_comparison' && pair
      ? pair
          .slice(1)
          .map((name) => name.replace(/^compare\s+/i, '').trim())
          .filter((name) => !/^(him|her|them|that|both)$/i.test(name))
      : subject
        ? [subject]
        : [];
  if (contextual && !selected.length) {
    for (const message of history
      .filter((m) => m.role === 'user')
      .slice(-6)
      .reverse()) {
      if (/\b(he|she|his|her|him|that|both|them|their)\b/i.test(message.content)) continue;
      const previous = understand(message.content, [], directory);
      if (previous.subjects.length) {
        if (/compar|\bwith\b/i.test(query) && subject) subjects.push(...previous.subjects);
        else if (!subject) subjects.push(...previous.subjects);
        break;
      }
    }
  }
  // A name-shaped question is unresolved, not automatically outside UFC scope.
  // Provider matching still has to establish an actual identity before any facts are used.
  if (
    intent === 'out_of_scope' &&
    subject &&
    /\b(who is|tell me about|records? of|records? for|profile of|stats of|stats for)\b/i.test(
      query,
    ) &&
    !/ignore|reveal|system prompt/i.test(query)
  ) {
    intent = /\brecords?\s+(?:of|for)\b/i.test(query) ? 'fighter_history' : 'unknown';
    intents.splice(
      0,
      intents.length,
      ...new Set([intent, ...intents.filter((i) => i !== 'out_of_scope')]),
    );
  }
  return {
    intent,
    intents,
    fighters: selected,
    candidates: matches,
    ambiguous,
    contextual: contextual || statsFollowup,
    educational,
    topic: contextual || bareName ? topic : undefined,
    subject,
    eventSubject,
    subjects: [...new Set(subjects)],
    query: selected.length
      ? `${query}\nSubjects: ${selected.map((f) => f.name).join(', ')}${contextual && topic ? `\nTopic: ${topic}` : ''}`
      : query,
  };
}
