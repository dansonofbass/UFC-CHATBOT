import { db, checked } from './db';
import {
  fighterSchema,
  eventSchema,
  rankingSchema,
  type Fighter,
  type Event,
  type News,
} from './schemas';
export type DataResult<T> = {
  items: T[];
  state: 'ready' | 'unconfigured' | 'error';
  message?: string;
};
export async function fighters(query = ''): Promise<DataResult<Fighter>> {
  const client = db();
  if (!client) return { items: [], state: 'unconfigured' };
  try {
    let q = client.from('fighters').select('*').order('name').limit(100);
    if (query) q = q.ilike('search_name', `%${query.replace(/[%_,()]/g, '').slice(0, 80)}%`);
    const rows = await checked(q);
    return {
      items: rows.map((r) => ({
        ...fighterSchema.parse(r.payload),
        source_url: r.source_url,
        updated_at: r.updated_at,
      })),
      state: 'ready',
    };
  } catch {
    return { items: [], state: 'error' };
  }
}
export async function fighter(slug: string): Promise<Fighter | null> {
  const client = db();
  if (!client) return null;
  const { data } = await client.from('fighters').select('*').eq('slug', slug).maybeSingle();
  return data
    ? {
        ...fighterSchema.parse(data.payload),
        source_url: data.source_url,
        updated_at: data.updated_at,
      }
    : null;
}
export async function events(): Promise<DataResult<Event>> {
  const client = db();
  if (!client) return { items: [], state: 'unconfigured' };
  try {
    const rows = await checked(
      client.from('events').select('*').order('starts_at', { ascending: false }).limit(100),
    );
    return {
      items: rows.map((r) => ({
        ...eventSchema.parse(r.payload),
        source_url: r.source_url,
        updated_at: r.updated_at,
      })),
      state: 'ready',
    };
  } catch {
    return { items: [], state: 'error' };
  }
}
export async function event(slug: string): Promise<Event | null> {
  const client = db();
  if (!client) return null;
  const { data } = await client.from('events').select('*').eq('slug', slug).maybeSingle();
  return data
    ? {
        ...eventSchema.parse(data.payload),
        source_url: data.source_url,
        updated_at: data.updated_at,
      }
    : null;
}
export async function news(): Promise<DataResult<News>> {
  const client = db();
  if (!client) return { items: [], state: 'unconfigured' };
  try {
    return {
      items: (await checked(
        client.from('news_items').select('*').order('published_at', { ascending: false }).limit(50),
      )) as News[],
      state: 'ready',
    };
  } catch {
    return { items: [], state: 'error' };
  }
}
export async function rankings() {
  const client = db();
  if (!client) return null;
  const { data } = await client
    .from('rankings')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data
    ? {
        ...rankingSchema.parse(data.payload),
        source_url: data.source_url,
        updated_at: data.updated_at,
      }
    : null;
}
