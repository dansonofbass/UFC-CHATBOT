import { createHash } from 'node:crypto';
import { db, checked } from './db';
import { fighterSchema, eventSchema, rankingSchema, type Fighter, type Event } from './schemas';
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export function chunks(text: string) {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += 900) parts.push(text.slice(i, i + 1100));
  return parts;
}
export async function indexDocument(input: {
  id: string;
  title: string;
  body: string;
  source_url: string;
  source_id?: string;
  published_at?: string;
}) {
  const client = db(true);
  if (!client) throw new Error('Database not configured');
  const { data: old } = await client
    .from('knowledge_documents')
    .select('body')
    .eq('id', input.id)
    .maybeSingle();
  if (old?.body === input.body) return;
  await checked(
    client
      .from('knowledge_documents')
      .upsert({ ...input, updated_at: new Date().toISOString() })
      .select(),
  );
  await checked(client.from('document_chunks').delete().eq('document_id', input.id).select());
  for (const [order, content] of chunks(input.body).entries())
    await checked(
      client
        .from('document_chunks')
        .upsert({ id: `${input.id}:${order}`, document_id: input.id, content })
        .select(),
    );
}
export async function saveFighter(raw: unknown, url: string) {
  const f = fighterSchema.parse(raw),
    client = db(true);
  if (!client) throw new Error('Database not configured');
  const row = {
    id: f.id,
    slug: f.slug,
    name: f.name,
    search_name: [f.name, f.nickname].filter(Boolean).join(' ').toLowerCase(),
    payload: f,
    source_url: url,
    updated_at: new Date().toISOString(),
  };
  await checked(client.from('fighters').upsert(row).select());
  if (f.nickname)
    await checked(
      client
        .from('fighter_aliases')
        .upsert({ fighter_id: f.id, alias: f.nickname }, { onConflict: 'fighter_id,alias' })
        .select(),
    );
  return { ...f, source_url: url, updated_at: row.updated_at } as Fighter;
}
export async function saveEvent(raw: unknown, url: string) {
  const e = eventSchema.parse(raw),
    client = db(true);
  if (!client) throw new Error('Database not configured');
  const updated_at = new Date().toISOString();
  await checked(
    client
      .from('events')
      .upsert({
        id: e.id,
        slug: e.slug,
        title: e.title,
        starts_at: e.starts_at,
        status: e.status,
        payload: e,
        source_url: url,
        updated_at,
      })
      .select(),
  );
  for (const fight of e.card || []) {
    for (const f of [fight.fighter_a, fight.fighter_b]) {
      if (!f) continue;
      const { data } = await client.from('fighters').select('id').eq('id', f.id).maybeSingle();
      if (!data) await saveFighter(f, `https://api.ufcalendar.com/v1/fighters/${f.id}`);
    }
    await checked(
      client
        .from('fights')
        .upsert({
          id: fight.id,
          event_id: e.id,
          fighter_a_id: fight.fighter_a?.id,
          fighter_b_id: fight.fighter_b?.id,
          status: fight.status,
          payload: fight,
          source_url: `https://api.ufcalendar.com/v1/fights/${fight.id}`,
          updated_at,
        })
        .select(),
    );
  }
  return { ...e, source_url: url, updated_at } as Event;
}
export async function saveRankings(raw: unknown, url: string) {
  const r = rankingSchema.parse(raw),
    client = db(true);
  if (!client) throw new Error('Database not configured');
  await checked(
    client
      .from('rankings')
      .upsert(
        {
          snapshot_date: r.snapshot_date,
          payload: r,
          source_url: url,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'snapshot_date' },
      )
      .select(),
  );
}
