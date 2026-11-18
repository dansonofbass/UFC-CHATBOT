import { db, checked } from './db';
import { fighters, events, news, rankings } from './data';
import { identifyFighters, type Message, type Intent } from './router';
import type { Citation } from './schemas';
import { queryEmbedding } from './embeddings';
import { latestCompletedEvent } from './latest-completed';
export type Evidence = { text: string; citations: Citation[]; deterministic?: string };
export async function retrieve(
  query: string,
  history: Message[],
  intent: Intent,
): Promise<Evidence> {
  const citations: Citation[] = [];
  const pieces: string[] = [];
  const fs = await fighters();
  const matched = identifyFighters(
    [
      ...history
        .filter((m) => m.role === 'user')
        .slice(-2)
        .map((m) => m.content),
      query,
    ].join(' '),
    fs.items,
  );
  for (const f of matched.slice(0, 2)) {
    pieces.push(JSON.stringify(f));
    citations.push({ title: f.name, url: f.source_url, updated_at: f.updated_at });
  }
  if (intent === 'fighter_history' && matched.length) {
    const client = db();
    if (client) {
      const rows = await checked(
        client
          .from('fighter_history')
          .select('payload,source_url,updated_at')
          .in(
            'fighter_id',
            matched.map((f) => f.id),
          )
          .order('event_date', { ascending: false })
          .limit(16),
      );
      for (const h of rows) {
        pieces.push(JSON.stringify(h.payload));
        citations.push({
          title: 'Verified UFC career history',
          url: h.source_url,
          updated_at: h.updated_at,
        });
      }
    }
  }
  if (intent === 'fighter_history' || intent === 'fight_result' || intent === 'fight_statistics') {
    const client = db();
    if (client && matched.length) {
      const ids = matched.map((f) => f.id);
      const bouts = await checked(
        client
          .from('fights')
          .select('id,payload,source_url,updated_at,events(title,starts_at)')
          .or(`fighter_a_id.in.(${ids.join(',')}),fighter_b_id.in.(${ids.join(',')})`)
          .limit(12),
      );
      for (const b of bouts) {
        pieces.push(JSON.stringify(b));
        citations.push({ title: `Fight ${b.id}`, url: b.source_url, updated_at: b.updated_at });
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
            .limit(12),
        );
        pieces.push(JSON.stringify(stats));
      }
    }
  }
  if (['upcoming_event', 'completed_event', 'fight_result'].includes(intent)) {
    const result = await events();
    // When the initial import contains only future cards, fetch the latest
    // completed event once using a shared, quota-limited server-side refresh.
    if (intent === 'completed_event' && !result.items.some((e) => e.status === 'completed')) {
      const fresh = await latestCompletedEvent();
      if (fresh) result.items.push(fresh);
    }
    const selected = result.items
      .filter((e) =>
        intent === 'upcoming_event'
          ? ['announced', 'scheduled', 'live'].includes(e.status)
          : e.status === 'completed',
      )
      .sort((a, b) =>
        intent === 'upcoming_event'
          ? a.starts_at.localeCompare(b.starts_at)
          : b.starts_at.localeCompare(a.starts_at),
      )
      .slice(0, 4);
    for (const e of selected) {
      pieces.push(JSON.stringify(e));
      citations.push({ title: e.title, url: e.source_url, updated_at: e.updated_at });
    }
    // Straightforward latest-event questions need no generative model.
    // Compound questions still use full evidence synthesis.
    if (
      intent === 'completed_event' &&
      selected[0] &&
      /\b(last|latest|most recent)\b|آخرین/i.test(query) &&
      !/\b(and|between|versus|vs|fight between|compare)\b|\bو\b|بین/i.test(query)
    ) {
      const e = selected[0];
      const headliner = e.card?.find((bout) => bout.is_main);
      const names = headliner && [headliner.fighter_a?.name, headliner.fighter_b?.name]
        .filter(Boolean).join(' vs ');
      const winner = headliner?.result?.winner_fighter_id;
      const winnerName = winner === headliner?.fighter_a?.id
        ? headliner?.fighter_a?.name
        : winner === headliner?.fighter_b?.id
          ? headliner?.fighter_b?.name
          : null;
      const result = winnerName
        ? ` Main-event winner: ${winnerName} (${headliner?.result?.method || 'method unavailable'}).`
        : '';
      const date = new Date(e.starts_at).toLocaleDateString('en-US', {
        timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
      });
      return {
        text: pieces.join('\n'),
        citations,
        deterministic: `The latest completed UFC event in the verified records is **${e.title}** (${date}, UTC).${names ? ` Main event: ${names}.` : ''}${result}\n\nSource: UFCalendar.`,
      };
    }
    if (intent === 'upcoming_event' && selected[0]) {
      const e = selected[0];
      return {
        text: pieces.join('\n'),
        citations,
        deterministic: `${e.title}\n\n${e.starts_at} (UTC) · ${e.status}\n\nVerified in the cached source at ${e.updated_at}. Schedules may change.`,
      };
    }
  }
  if (intent === 'recent_news') {
    const result = await news();
    const relevant = result.items
      .filter(
        (n) =>
          !matched.length ||
          matched.some((f) => n.title.toLowerCase().includes(f.name.toLowerCase())),
      )
      .slice(0, 6);
    for (const n of relevant) {
      pieces.push(JSON.stringify(n));
      citations.push({ title: n.title, url: n.url, updated_at: n.updated_at });
    }
  }
  if (intent === 'rankings') {
    const r = await rankings();
    if (r) {
      pieces.push(JSON.stringify(r));
      citations.push({
        title: `Official rankings snapshot ${r.snapshot_date}`,
        url: r.source_url,
        updated_at: r.updated_at,
      });
    }
  }
  const client = db();
  if (client) {
    let vector: number[] | undefined;
    try {
      vector = await queryEmbedding(query);
    } catch {
      /* Full-text retrieval remains available if the local model cannot load. */
    }
    const { data, error } = await client.rpc('search_knowledge', {
      query_text: query,
      ...(vector ? { query_embedding: JSON.stringify(vector) } : {}),
    });
    if (error) throw new Error('Knowledge retrieval unavailable');
    for (const row of data || []) {
      pieces.push(row.content);
      citations.push({ title: row.title, url: row.source_url, updated_at: row.updated_at });
    }
  }
  return {
    text: pieces.join('\n').slice(0, 18000),
    citations: Array.from(new Map(citations.map((c) => [c.url, c])).values()).slice(0, 12),
  };
}
