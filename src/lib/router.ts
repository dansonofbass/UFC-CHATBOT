export type Intent =
  | 'fighter_profile'
  | 'fighter_history'
  | 'fight_result'
  | 'fight_statistics'
  | 'upcoming_event'
  | 'completed_event'
  | 'fighter_comparison'
  | 'rankings'
  | 'rules'
  | 'historical_context'
  | 'recent_news'
  | 'followup'
  | 'out_of_scope'
  | 'unknown';
export type Message = { role: 'user' | 'assistant'; content: string };
const topics =
  /\b(ufc|mma|octagon|fighter|fight|champion|takedown|submission|knockout|grappling|jones|mcgregor|makhachev|pereira|nurmagomedov|volkanovski|adesanya|holloway|poirier|aspinall)\b|یو\s?اف\s?سی|مبارز|مبارزه|قهرمان|رنکینگ|اسلام ماخاچف|جونز|پریرا/i;
export function classify(text: string, history: Message[] = [], knownNames: string[] = []): Intent {
  if (
    /ignore.{0,30}(instruction|system)|reveal.{0,20}(key|secret)|system prompt|نادیده بگیر/i.test(
      text,
    )
  )
    return 'out_of_scope';
  const follow =
    /^(and |what about|how about|why|when|who did|his |her |their |او |و |چرا|کی )/i.test(text);
  const scoped =
    topics.test(text) ||
    knownNames.some((n) => n.length > 2 && text.toLowerCase().includes(n.toLowerCase()));
  if (!scoped) {
    if (follow && history.some((m) => m.role === 'user' && topics.test(m.content)))
      return 'followup';
    return 'out_of_scope';
  }
  const patterns: [Intent, RegExp][] = [
    ['recent_news', /news|latest|announc|today|خبر|اخبار|امروز|تغییر/i],
    ['fighter_comparison', /compar|versus|\bvs\b|مقایسه/i],
    ['rankings', /rank|champion|رنک|قهرمان/i],
    ['upcoming_event', /next|upcoming|schedule|آینده|بعدی/i],
    ['fight_result', /result|who won|نتیجه|برنده/i],
    ['fight_statistics', /stat|accuracy|strike|آمار/i],
    ['fighter_history', /history|record|career|رکورد|سابقه/i],
    ['rules', /rule|technique|takedown|submission|قانون|قوانین|تکنیک/i],
    ['completed_event', /past event|completed event/i],
    ['historical_context', /milestone|first ever|تاریخ/i],
  ];
  return patterns.find(([, r]) => r.test(text))?.[0] || 'fighter_profile';
}
export function identifyFighters<
  T extends { id: number; name: string; slug: string; nickname?: string | null },
>(text: string, items: T[]) {
  const normalized = text.toLowerCase();
  return items.filter((f) =>
    [f.name, f.slug.replaceAll('-', ' '), f.nickname].some(
      (n) => n && n.length > 2 && normalized.includes(n.toLowerCase()),
    ),
  );
}
export function resolveIntent(query: string, history: Message[], names: string[] = []): Intent {
  const intent = classify(query, history, names);
  if (intent !== 'followup') return intent;
  const specific = classify(`UFC ${query}`, [], names);
  if (specific !== 'fighter_profile') return specific;
  const previous = history.findLast((m) => m.role === 'user');
  return previous ? classify(previous.content, [], names) : 'unknown';
}
