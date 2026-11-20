import { z } from 'zod';
import { isGeneralStatisticsQuestion, statisticsGuide } from './statistics-guide';
import { retrieveKnowledge } from './knowledge-retrieval';
import { localKnowledge } from './knowledge';
import { eventEvidence } from './event-resolution';
import { historySummary } from './history-summary';
import { fighterFacts } from './fighter-evidence';
import { synthesisEvidence } from './chat-strategy';
import { resolveFighterEvidence } from './fighter-resolution';
import { db, checked } from './db';
import { fighters, events, news, rankings } from './data';
import { understand } from './understanding';
import { retrievalConfig } from './retrieval-config';
import { liveProvider, webSearch } from './live-retrieval';
import {
  fighterSchema,
  eventSchema,
  rankingSchema,
  historySchema,
  fightSchema,
  fightStatSchema,
  envelope,
  type Citation,
  type Fighter,
  safeUrl,
} from './schemas';
import type { Message, Intent } from './router';
import type { Evidence } from './retrieval';

export async function directory(signal?: AbortSignal) {
  const client = db();
  if (!client) return (await fighters()).items;
  // Bounded directory and imported aliases; never infer identity from model memory.
  const query = client
    .from('fighters')
    .select('payload,source_url,updated_at')
    .order('id')
    .limit(2000);
  const response = await (signal ? query.abortSignal(signal) : query);
  if (response.error) return (await fighters()).items;
  const rows = response.data || [];
  const aliases = await client.from('fighter_aliases').select('fighter_id,alias').limit(4000);
  return rows.flatMap((r) => {
    const f = fighterSchema.safeParse(r.payload);
    return f.success
      ? [
          {
            ...f.data,
            aliases: (aliases.data || [])
              .filter((a) => a.fighter_id === f.data.id)
              .map((a) => a.alias as string),
            source_url: r.source_url,
            updated_at: r.updated_at,
          },
        ]
      : [];
  });
}
export const fresh = (date: string, ttl: number, now = Date.now()) =>
  Number.isFinite(Date.parse(date)) &&
  Date.parse(date) <= now + 60000 &&
  now - Date.parse(date) <= ttl;
const ttl = (intent: Intent) =>
  ['recent_news', 'upcoming_event', 'completed_event', 'fight_result', 'rankings'].includes(intent)
    ? 15 * 60000
    : 24 * 3600000;
export function publicCitation(c: Citation): Citation | undefined {
  const url = safeUrl(c.url);
  if (!url) return;
  const u = new URL(url);
  if (u.username || u.password) return;
  return {
    ...c,
    url: u.hostname === 'api.ufcalendar.com' ? 'https://www.ufcalendar.com' : url,
    title: c.title.slice(0, 200),
  };
}

export async function intelligentRetrieve(
  query: string,
  history: Message[],
  items: Fighter[],
  signal: AbortSignal,
  preparedPlan?: ReturnType<typeof understand<Fighter>>,
): Promise<Evidence> {
  const plan = preparedPlan || understand(query, history, items);
  if (plan.eventSubject) return eventEvidence(plan.eventSubject, signal);
  if (isGeneralStatisticsQuestion(query) || plan.educational) {
    const docs = await retrieveKnowledge(query, signal);
    return {
      text: synthesisEvidence(docs.map((d) => JSON.stringify(d)).join('\n'), true),
      citations: docs.map((d) => ({ title: d.title, url: d.source_url, updated_at: d.updated_at })),
      deterministic: isGeneralStatisticsQuestion(query)
        ? statisticsGuide
        : localKnowledge(query)[0]?.body || docs[0]?.content,
      cacheTtlMs: 86400000,
    };
  }
  if (plan.ambiguous)
    return {
      text: '',
      citations: [],
      deterministic: plan.candidates.length
        ? `Which fighter do you mean: ${plan.candidates
            .slice(0, 4)
            .map((c) => c.fighter.name)
            .join(', ')}?`
        : 'Which fighter or event do you mean?',
      cacheTtlMs: 0,
    };
  const pieces: string[] = [],
    citations: Citation[] = [],
    missing: string[] = [];
  let selected = plan.fighters;
  let uncertain = false;
  const add = (
    title: string,
    payload: unknown,
    url: string,
    updated_at: string,
    origin: string,
  ) => {
    const citation = publicCitation({ title, url, updated_at });
    if (!citation || !Number.isFinite(Date.parse(updated_at))) return false;
    pieces.push(
      JSON.stringify(
        { origin, observed_at: updated_at, facts: payload, source: citation.url },
        (_key, value) =>
          typeof value === 'string' && value.startsWith('https://api.ufcalendar.com/')
            ? 'https://www.ufcalendar.com'
            : value,
      ),
    );
    citations.push(citation);
    return true;
  };
  const provider = liveProvider(signal);
  const live = retrievalConfig().CHAT_LIVE_RETRIEVAL_ENABLED === 'true';
  const resolution = await resolveFighterEvidence(plan, live, provider);
  selected = resolution.selected;
  missing.push(...resolution.missing);
  uncertain = resolution.missing.length > 0;
  if (resolution.clarification)
    return { text: '', citations: [], deterministic: resolution.clarification, cacheTtlMs: 0 };
  if (plan.intent === 'fighter_comparison' && selected.length < 2)
    return {
      text: '',
      citations: [],
      cacheTtlMs: 0,
      deterministic: `I ${selected[0] ? `identified ${selected[0].name}, but could not verify the other fighter` : 'could not verify both comparison participants'}. Please confirm the names or share the event.`,
    };
  selected = selected
    .filter(
      (f) =>
        publicCitation({ title: f.name, url: f.source_url, updated_at: f.updated_at }) &&
        Number.isFinite(Date.parse(f.updated_at)),
    )
    .map((f) => {
      const values = new Map<string, string>();
      for (const record of Object.values(f.records || {})) {
        if (values.has(record.scope) && values.get(record.scope) !== record.value) {
          uncertain = true;
          missing.push(
            `Conflicting ${record.scope} records for ${f.name}; the numerical record is withheld.`,
          );
          return { ...f, records: undefined };
        }
        values.set(record.scope, record.value);
      }
      return f;
    });
  for (const f of selected)
    add(
      f.name,
      fighterFacts(f, plan),
      f.source_url,
      f.updated_at,
      'supabase-or-validated-provider',
    );
  if (
    plan.intent === 'fighter_profile' &&
    plan.intents.length === 1 &&
    selected.length === 1 &&
    /^(who is|tell me about)\b/i.test(query)
  ) {
    const f = selected[0];
    const records = Object.values(f.records || {}).filter(
      (r) => r.value && r.scope && !/grappling/i.test(r.scope),
    );
    return {
      text: pieces.join('\n'),
      citations,
      deterministic: `${f.name}${f.nickname ? ` (“${f.nickname}”)` : ''}${f.nationality ? ` · ${f.nationality}` : ''}.${records.length ? `\n\n${records.map((r) => `${r.scope}: ${r.value}`).join('; ')}.` : '\n\nA verified record is not available in this profile.'}\n\nSource: [UFCalendar](https://www.ufcalendar.com). Snapshot: ${f.updated_at.slice(0, 10)} (UTC).`,
      cacheTtlMs: uncertain ? 0 : 60000,
    };
  }
  // Source-backed profile statistics can be rendered directly, avoiding a
  // costly synthesis call and remaining usable when the AI budget is exhausted.
  if (plan.intent === 'fight_statistics' && plan.intents.length === 1 && selected.length === 1) {
    const fighter = selected[0];
    const stats = fighter.stats;
    const labels: [keyof NonNullable<typeof stats>, string][] = [
      ['slpm', 'Significant strikes landed per minute'],
      ['sapm', 'Significant strikes absorbed per minute'],
      ['str_acc', 'Significant striking accuracy'],
      ['str_def', 'Significant strike defense'],
      ['td_avg', 'Takedowns per 15 minutes'],
      ['td_acc', 'Takedown accuracy'],
      ['td_def', 'Takedown defense'],
      ['sub_avg', 'Submission attempts per 15 minutes'],
    ];
    const known = stats
      ? labels.flatMap(([key, title]) => {
          const value = stats[key];
          return typeof value === 'string' && value.trim() ? [`- **${title}:** ${value}`] : [];
        })
      : [];
    if (known.length)
      return {
        text: pieces.join('\n'),
        citations,
        deterministic: `**${fighter.name} — verified profile statistics**\n\n${known.join('\n')}\n\nThese are the source's available career-profile statistics, not an invented current fight result.\n\nSource: [UFCalendar](https://www.ufcalendar.com). Profile snapshot: ${fighter.updated_at.slice(0, 10)} (UTC).`,
        cacheTtlMs: uncertain ? 0 : 60000,
      };
    return {
      text: pieces.join('\n'),
      citations,
      deterministic: `**${fighter.name}** was identified in a sourced fighter profile, but that profile does not currently provide verified numerical striking or grappling averages. I won't invent them.\n\nYou can ask about a specific fight, or request an explanation of SLpM, striking accuracy, takedown accuracy and defense.\n\nSource: [UFCalendar](https://www.ufcalendar.com). Profile snapshot: ${fighter.updated_at.slice(0, 10)} (UTC).`,
      cacheTtlMs: 0,
    };
  }
  const recordOnly =
    plan.intents.length === 1 &&
    plan.intent === 'fighter_history' &&
    /\brecord\b/i.test(query) &&
    !/last|opponent|fight|news/i.test(query.replace(/fighter/gi, ''));
  if (
    selected.length === 2 &&
    /\bcompare\b/i.test(query) &&
    /\brecords?\b/i.test(query) &&
    !/history|last|news|stats/i.test(query) &&
    selected.every((f) => fresh(f.updated_at, 86400000) && Object.keys(f.records || {}).length)
  ) {
    return {
      text: pieces.join('\n'),
      citations,
      deterministic:
        selected
          .map(
            (f) =>
              `${f.name}: ${Object.values(f.records || {})
                .filter((r) => !/grappling/i.test(r.scope))
                .map((r) => `${r.value} (${r.scope})`)
                .join('; ')}. Snapshot: ${f.updated_at.slice(0, 10)} (UTC).`,
          )
          .join('\n\n') + '\n\nSource: [UFCalendar](https://www.ufcalendar.com).',
      cacheTtlMs: uncertain ? 0 : 60000,
    };
  }
  if (recordOnly && selected.length === 1 && fresh(selected[0].updated_at, 86400000)) {
    const f = selected[0];
    const records = Object.entries(f.records || {}).filter(
      ([, r]) =>
        r.value &&
        r.scope &&
        r.source &&
        (/\bmma\b/i.test(query)
          ? /mma/i.test(r.scope)
          : /\bufc\b/i.test(query)
            ? /ufc/i.test(r.scope)
            : !/grappling/i.test(r.scope)),
    );
    if (records.length)
      return {
        text: pieces.join('\n'),
        citations,
        deterministic: `${f.name}: ${records.map(([, r]) => `${r.value} (${r.scope})`).join('; ')}.\n\nSource: [UFCalendar](https://www.ufcalendar.com). Snapshot: ${f.updated_at.slice(0, 10)} (UTC).`,
        cacheTtlMs: 60000,
      };
  }
  if (
    plan.intents.includes('fighter_history') &&
    selected.some((f) => !Object.keys(f.records || {}).length)
  )
    missing.push('One or more requested fighter records are unavailable.');
  for (const intent of plan.intents) {
    if (intent === 'out_of_scope') continue;
    try {
      if (
        ['fighter_history', 'fight_result', 'fight_statistics'].includes(intent) &&
        selected.length
      ) {
        const client = db();
        let historyFound = false;
        if (client) {
          const rows = await checked(
            client
              .from('fighter_history')
              .select('fighter_id,payload,source_url,updated_at')
              .in(
                'fighter_id',
                selected.map((f) => f.id),
              )
              .order('event_date', { ascending: false })
              .limit(16)
              .abortSignal(signal),
          );
          for (const r of rows) {
            const h = historySchema.safeParse(r.payload);
            if (h.success) {
              add(
                'Career history snapshot',
                { fighter_id: r.fighter_id, ...h.data },
                r.source_url,
                r.updated_at,
                'supabase',
              );
              historyFound =
                historyFound ||
                fresh(r.updated_at, /last|latest|recent/i.test(query) ? 900000 : 86400000);
            }
          }
          for (const f of selected) {
            const histories = rows
              .filter((r) => r.fighter_id === f.id)
              .flatMap((r) => {
                const h = historySchema.safeParse(r.payload);
                return h.success ? [h.data] : [];
              });
            if (histories.length)
              add(
                `${f.name} supplied-history summary`,
                { fighter_id: f.id, ...historySummary(histories) },
                'https://www.ufcalendar.com',
                rows.find((r) => r.fighter_id === f.id)!.updated_at,
                'computed-from-validated-history',
              );
          }
          const bouts = await checked(
            client
              .from('fights')
              .select('id,payload,source_url,updated_at,events(title,starts_at)')
              .or(
                `fighter_a_id.in.(${selected.map((f) => f.id).join(',')}),fighter_b_id.in.(${selected.map((f) => f.id).join(',')})`,
              )
              .limit(12)
              .abortSignal(signal),
          );
          for (const b of bouts) {
            const f = fightSchema.safeParse(b.payload);
            if (f.success)
              add(
                'Verified bout snapshot',
                { ...f.data, event: b.events },
                b.source_url,
                b.updated_at,
                'supabase',
              );
          }
          if (intent === 'fight_statistics' && bouts.length) {
            const stats = await checked(
              client
                .from('fight_stats')
                .select('*')
                .in(
                  'fight_id',
                  bouts.map((b) => b.id),
                )
                .limit(24)
                .abortSignal(signal),
            );
            for (const s of stats) {
              const bout = bouts.find((b) => b.id === s.fight_id);
              const parsed = z.array(fightStatSchema).safeParse(s.payload);
              if (parsed.success && bout)
                add(
                  'Verified fight statistics',
                  { fighters: parsed.data, fight_id: s.fight_id },
                  s.source_url,
                  s.updated_at,
                  'supabase',
                );
            }
            if (!stats.length && live) {
              const result = await provider(
                `/fights/${bouts[0].id}/stats`,
                envelope(z.array(fightStatSchema)),
              );
              add(
                'Verified fight statistics',
                { fight_id: bouts[0].id, fighters: result.data },
                'https://www.ufcalendar.com',
                new Date().toISOString(),
                'ufcalendar',
              );
            }
          }
        }
        if (!historyFound && live && intent !== 'fight_statistics')
          for (const f of selected.slice(0, 2)) {
            const result = await provider(
              `/fighters/${f.id}/history`,
              envelope(z.array(historySchema)),
            );
            add(
              `${f.name} career history`,
              { rows: result.data, summary: historySummary(result.data) },
              'https://www.ufcalendar.com',
              new Date().toISOString(),
              'ufcalendar',
            );
          }
        // Profiles do not establish an opponent, last fight, or per-fight statistics.
        missing.push(
          'Only explicitly dated history rows establish opponents; do not infer last fight or missing statistics from a profile.',
        );
      }
      if (
        ['upcoming_event', 'completed_event'].includes(intent) ||
        (intent === 'fight_result' && !selected.length)
      ) {
        let list = (await events()).items.filter((e) =>
          intent === 'upcoming_event'
            ? ['announced', 'scheduled', 'live'].includes(e.status)
            : e.status === 'completed',
        );
        const current = list
          .filter((e) => fresh(e.updated_at, ttl(intent)))
          .sort((a, b) =>
            intent === 'upcoming_event'
              ? a.starts_at.localeCompare(b.starts_at)
              : b.starts_at.localeCompare(a.starts_at),
          );
        list = current;
        if (!list.length && live) {
          const result = await provider(
            `/events?org=ufc&status=${intent === 'upcoming_event' ? 'upcoming' : 'completed'}&order=${intent === 'upcoming_event' ? 'asc' : 'desc'}&limit=1`,
            envelope(z.array(eventSchema)),
          );
          list = result.data.map((e) => ({
            ...e,
            source_url: 'https://www.ufcalendar.com',
            updated_at: result.meta?.fetched_at || new Date().toISOString(),
          }));
          if (list[0] && intent !== 'upcoming_event') {
            const detail = await provider(`/events/${list[0].id}`, envelope(eventSchema));
            if (detail.data.id !== list[0].id || detail.data.status !== 'completed')
              throw new Error('Event mismatch');
            list = [{ ...list[0], ...detail.data }];
          }
        }
        for (const e of list.slice(0, 2))
          add(e.title, e, e.source_url, e.updated_at, 'structured-event');
        if (
          list[0] &&
          plan.intents.length === 1 &&
          citations.length &&
          !/\b(and|compare|between)\b/i.test(query)
        ) {
          const e = list[0];
          const main = e.card?.find(
            (b) => b.is_main && ['completed', 'no_contest'].includes(b.status || ''),
          );
          const winner = main?.result?.winner_fighter_id;
          const winnerName =
            winner != null
              ? [main?.fighter_a, main?.fighter_b].find((f) => f?.id === winner)?.name
              : undefined;
          const summary = main
            ? ` Main event: ${[main.fighter_a?.name, main.fighter_b?.name].filter(Boolean).join(' vs ')}.${winnerName ? ` ${winnerName} won${main.result?.method ? ` by ${main.result.method}` : ''}.` : main.result?.method ? ` Reported result: ${main.result.method}.` : ' A verified winner is not available.'}`
            : intent === 'upcoming_event'
              ? ' Schedules may change.'
              : ' Detailed results are not available in this record.';
          return {
            text: pieces.join('\n'),
            citations,
            deterministic: `${intent === 'upcoming_event' ? 'Next scheduled UFC event' : 'Latest completed UFC event'} in the available records: **${e.title}** (${e.starts_at.slice(0, 10)}, UTC).${summary}\n\nSource: [UFCalendar](https://www.ufcalendar.com). Snapshot: ${e.updated_at.slice(0, 10)} (UTC).`,
            cacheTtlMs: uncertain ? 0 : 60000,
          };
        }
        if (!list.length) missing.push('No fresh verified event available.');
      }
      if (intent === 'rankings') {
        let r = await rankings();
        if (
          (!r || !fresh(r.updated_at, ttl(intent)) || !fresh(r.snapshot_date, 7 * 86400000)) &&
          live
        ) {
          const result = await provider('/rankings/ufc', envelope(rankingSchema));
          r = {
            ...result.data,
            source_url: 'https://www.ufcalendar.com',
            updated_at: result.meta?.fetched_at || new Date().toISOString(),
          };
        }
        if (r)
          add(
            `Rankings snapshot ${r.snapshot_date}`,
            r,
            r.source_url,
            r.updated_at,
            'rankings-snapshot',
          );
      }
      if (intent === 'recent_news') {
        const rows = (await news()).items.filter(
          (n) =>
            fresh(n.published_at, 7 * 86400000) &&
            (!selected.length ||
              selected.some((f) => n.title.toLowerCase().includes(f.name.toLowerCase()))),
        );
        for (const n of rows.slice(0, 5))
          add(n.title, n, n.url, n.updated_at, 'news-report-not-necessarily-confirmed');
        if (!rows.length) missing.push('No recent verified news available.');
      }
    } catch {
      uncertain = true;
      missing.push(`Additional ${intent.replaceAll('_', ' ')} evidence unavailable.`);
    }
  }
  if (['rules', 'historical_context'].includes(plan.intent) || !pieces.length) {
    for (const row of await retrieveKnowledge(
      plan.query,
      signal,
      ['rules', 'historical_context'].includes(plan.intent),
    ))
      add(row.title, row.content, row.source_url, row.updated_at, 'knowledge-snapshot');
  }
  if (!pieces.length || missing.length) {
    try {
      for (const r of await webSearch(plan.query, signal))
        add(
          r.title,
          {
            discovery_only: true,
            excerpt: r.description,
            warning:
              'Search excerpt is not independently verified. Do not use it to assert records, results, rankings, or confirmed news.',
          },
          r.url,
          new Date().toISOString(),
          'web-search-discovery',
        );
    } catch {
      uncertain = true;
      missing.push('Configured web search unavailable.');
    }
  }
  // A missing database record is an evidence gap, not a claim of nonexistent fighters.
  if (!pieces.length)
    return {
      text: '',
      citations: [],
      deterministic: plan.subject
        ? `I couldn’t verify ${plan.subject} from the available sources. Could you confirm the spelling or share the event or opponent?`
        : 'I don’t have enough verified evidence for that yet. Please name the fighter or event, or ask about a specific date.',
      cacheTtlMs: 0,
    };
  return {
    text: `${pieces.join('\n').slice(0, 18000)}\nMETRIC CONVENTIONS: SLpM and SApM are per minute; TD Avg and Sub Avg are per 15 minutes. Accuracy and defense are percentages out of 100, not rates per fight.\nLIMITATIONS: ${missing.join(' ')}\nNever resolve conflicting facts by guessing. Use source dates; snapshots do not prove current completeness. Cached events and bouts establish only the latest in the available records, not global completeness.`,
    citations: Array.from(new Map(citations.map((c) => [c.url + c.title, c])).values()).slice(
      0,
      12,
    ),
    cacheTtlMs: uncertain ? 0 : Math.min(...plan.intents.map(ttl), 60000),
  };
}
