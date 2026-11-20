import nextEnv from '@next/env';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
nextEnv.loadEnvConfig(process.cwd());
const { UFCalendar, ProviderError } = await import('../src/lib/ufcalendar');
const { db, checked } = await import('../src/lib/db');
const { consume } = await import('../src/lib/security');
const { fighterSchema, eventSchema, rankingSchema, envelope, historySchema, fightStatSchema } =
  await import('../src/lib/schemas');
const { saveFighter, saveEvent, saveRankings, indexDocument, digest } =
  await import('../src/lib/ingestion');
const args = process.argv.slice(2);
const arg = (key: string) =>
  args
    .find((x) => x.startsWith(`--${key}=`))
    ?.split('=')
    .slice(1)
    .join('=');
const kind = z
  .enum([
    'events',
    'fighters',
    'rankings',
    'news',
    'index',
    'licensed',
    'fighter-history',
    'fight-stats',
  ])
  .parse(arg('kind') || 'events');
const dry = args.includes('--dry-run'),
  limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(25)
    .parse(arg('limit') || 5),
  maxRequests = z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .parse(process.env.UFCALENDAR_MAX_REQUESTS_PER_RUN || 3);
const client = db(true);
let requests = 0,
  runId: string | undefined;
const provider = new UFCalendar(fetch, process.env, async () => {
  if (requests >= maxRequests) throw new Error('LOCAL_RUN_LIMIT');
  const month = new Date().toISOString().slice(0, 7),
    ceiling = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(process.env.UFCALENDAR_MONTHLY_LOCAL_LIMIT || 80);
  const blocked = await client!
    .from('query_cache')
    .select('expires_at')
    .eq('key', 'ufcalendar:quota-block')
    .maybeSingle();
  if (blocked.error) throw new Error('Quota controls unavailable');
  if (blocked.data && Date.parse(blocked.data.expires_at) > Date.now())
    throw new Error('LOCAL_QUOTA_BLOCK');
  if (
    !(await consume(
      `ufcalendar:${process.env.UFCALENDAR_ACCOUNT_ID || 'primary'}:${month}`,
      1,
      ceiling,
      new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)),
    ))
  )
    throw new Error('LOCAL_MONTHLY_LIMIT');
  requests++;
});
type State = Record<string, { cursor?: string; pending?: string[] }>;
let state: State = {};
if (args.includes('--resume'))
  try {
    state = JSON.parse(await readFile('.sync-state.json', 'utf8'));
  } catch {}
async function checkpoint(cursor?: string, pending?: string[]) {
  state[kind] = { cursor, pending };
  if (!dry) await writeFile('.sync-state.json', JSON.stringify(state));
}
async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  if (dry) throw new Error('Dry run does not contact quota APIs');
  try {
    return await provider.request(path, schema);
  } catch (e) {
    if (e instanceof ProviderError && e.status === 429) {
      await checked(
        client!
          .from('query_cache')
          .upsert({
            key: 'ufcalendar:quota-block',
            response: { reason: e.code },
            expires_at: new Date(
              Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
            ).toISOString(),
          })
          .select(),
      );
    }
    throw e;
  }
}
async function importNews() {
  const Parser = (await import('rss-parser')).default;
  const feeds = z
    .array(z.object({ url: z.url(), license: z.string().min(10) }))
    .max(10)
    .parse(JSON.parse(process.env.NEWS_FEEDS || '[]'));
  if (!feeds.length) {
    console.log('No permitted NEWS_FEEDS configured; no news imported.');
    return;
  }
  for (const feed of feeds) {
    if (new URL(feed.url).protocol !== 'https:') throw new Error('HTTPS feed required');
    if (dry) {
      console.log('Would ingest configured permitted feed metadata');
      continue;
    }
    const response = await fetch(feed.url, {
      signal: AbortSignal.timeout(12000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Feed unavailable');
    const xml = await response.text();
    if (xml.length > 2000000) throw new Error('Feed too large');
    const parsed = await new Parser().parseString(xml),
      source = digest(feed.url);
    await checked(
      client!
        .from('data_sources')
        .upsert({
          id: source,
          name: parsed.title || new URL(feed.url).hostname,
          url: feed.url,
          license: feed.license,
        })
        .select(),
    );
    const fs = await checked(client!.from('fighters').select('id,name').limit(2000));
    const es = await checked(client!.from('events').select('id,title').limit(1000));
    for (const item of parsed.items.slice(0, limit)) {
      if (!item.link || !item.title || !item.isoDate || !Number.isFinite(Date.parse(item.isoDate)))
        continue;
      const url = new URL(item.link);
      if (url.protocol !== 'https:') continue;
      url.hash = '';
      for (const key of [...url.searchParams.keys()])
        if (key.startsWith('utm_')) url.searchParams.delete(key);
      const id = digest(url.href),
        excerpt = (item.contentSnippet || '').replace(/<[^>]*>/g, '').slice(0, 240);
      const text = `${item.title} ${excerpt}`.toLowerCase();
      if (!/ufc|یو\s?اف\s?سی/i.test(text)) continue;
      await checked(
        client!
          .from('news_items')
          .upsert({
            id,
            title: item.title.slice(0, 300),
            url: url.href,
            published_at: new Date(item.isoDate).toISOString(),
            excerpt,
            source,
            confirmation: 'report',
            fighter_ids: fs.filter((f) => text.includes(f.name.toLowerCase())).map((f) => f.id),
            event_ids: es.filter((e) => text.includes(e.title.toLowerCase())).map((e) => e.id),
            updated_at: new Date().toISOString(),
          })
          .select(),
      );
      await indexDocument({
        id,
        title: item.title,
        body: excerpt,
        source_url: url.href,
        source_id: source,
        published_at: item.isoDate,
      });
      console.log('Imported news metadata', id.slice(0, 10));
    }
  }
}
async function run() {
  if (dry) {
    console.log(
      JSON.stringify({
        dryRun: true,
        kind,
        limit,
        maxRequests,
        providerRequests: 0,
        resume: state[kind] || null,
      }),
    );
    if (kind === 'news') await importNews();
    return;
  }
  if (!client) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  const row = await checked(client.from('sync_runs').insert({ kind }).select('id').single());
  runId = z.object({ id: z.string() }).parse(row).id;
  if (kind === 'news') {
    await importNews();
    return;
  }
  if (kind === 'index') {
    if (process.env.ENABLE_EMBEDDINGS !== 'true') {
      console.log('Embedding indexing disabled; full-text search remains available');
      return;
    }
    const { queryEmbedding } = await import('../src/lib/embeddings');
    const rows = await checked(
      args.includes('--reindex')
        ? client
            .from('document_chunks')
            .select('id,content')
            .gt('id', state.index?.cursor || '')
            .order('id')
            .limit(limit)
        : client.from('document_chunks').select('id,content').is('embedding', null).limit(limit),
    );
    for (const r of rows) {
      const vector = await queryEmbedding(r.content);
      if (!vector) throw new Error('Embedding model unavailable');
      if (vector.length !== 384) throw new Error('Unexpected embedding dimensions');
      await checked(
        client
          .from('document_chunks')
          .update({
            embedding: JSON.stringify(vector),
            embedding_model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
            embedding_dimensions: 384,
          })
          .eq('id', r.id)
          .select(),
      );
      await checkpoint(r.id);
      console.log(JSON.stringify({ chunk: r.id, dimensions: vector.length, status: 'indexed' }));
    }
    return;
  }
  if (kind === 'licensed') {
    const file = arg('file'),
      license = arg('license');
    if (!file || !license) throw new Error('--file and --license required');
    const docs = z
      .array(z.object({ title: z.string(), body: z.string().max(100000), source_url: z.url() }))
      .parse(JSON.parse(await readFile(file, 'utf8')));
    for (const d of docs.slice(0, limit)) await indexDocument({ id: digest(d.source_url), ...d });
    console.log('Imported licensed documents under operator-supplied license', license);
    return;
  }
  if (!provider.status().length) throw new Error('Missing UFCALENDAR_API_KEY_1 (or _2 / _3)');
  if (kind === 'fighter-history') {
    const slug = z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .parse(arg('fighter'));
    const f = await checked(client.from('fighters').select('id').eq('slug', slug).single());
    const fighterId = z.object({ id: z.number() }).parse(f).id;
    const path = `/fighters/${slug}/history`;
    const page = await get(path, envelope(z.array(historySchema)));
    for (const h of page.data.filter((h) => h.org_slug === 'ufc')) {
      const id = digest(
        `${fighterId}:${h.fight_id ?? `${h.date}:${h.opponent_name}:${h.event_title}`}`,
      );
      await checked(
        client
          .from('fighter_history')
          .upsert({
            id,
            fighter_id: fighterId,
            event_date: h.date,
            payload: h,
            source_url: `https://api.ufcalendar.com/v1${path}`,
            updated_at: new Date().toISOString(),
          })
          .select(),
      );
    }
    return;
  }
  if (kind === 'fight-stats') {
    const fightId = z.coerce.number().int().positive().parse(arg('fight'));
    const path = `/fights/${fightId}/stats`;
    const result = await get(path, envelope(z.array(fightStatSchema)));
    await checked(
      client
        .from('fight_stats')
        .upsert(
          {
            fight_id: fightId,
            scope: 'totals',
            payload: result.data,
            source_url: `https://api.ufcalendar.com/v1${path}`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'fight_id,scope' },
        )
        .select(),
    );
    return;
  }
  if (kind === 'rankings') {
    const path = '/rankings/ufc';
    const r = await get(path, envelope(rankingSchema));
    await saveRankings(r.data, `https://api.ufcalendar.com/v1${path}`);
    return;
  }
  // Resume pending details before requesting another page. One list plus details, bounded by maxRequests.
  let pending = state[kind]?.pending || [],
    cursor = state[kind]?.cursor;
  if (!pending.length) {
    const filter = kind === 'events' ? `org=ufc&status=${arg('status') || 'upcoming'}` : 'org=ufc';
    const path = `/${kind}?${filter}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page =
      kind === 'events'
        ? await get(path, envelope(z.array(eventSchema)))
        : await get(path, envelope(z.array(fighterSchema)));
    pending = page.data.map((r) => r.slug);
    cursor = page.meta.pagination?.next_cursor || undefined;
    await checkpoint(cursor, pending);
  }
  while (pending.length && requests < maxRequests) {
    const slug = pending[0],
      path = `/${kind}/${encodeURIComponent(slug)}`;
    if (kind === 'fighters') {
      const detail = await get(path, envelope(fighterSchema));
      await saveFighter(detail.data, `https://api.ufcalendar.com/v1${path}`);
    } else {
      const detail = await get(path, envelope(eventSchema));
      await saveEvent(detail.data, `https://api.ufcalendar.com/v1${path}`);
    }
    pending.shift();
    await checkpoint(cursor, pending);
    console.log(`Imported ${kind} ${slug}; provider calls ${requests}/${maxRequests}`);
  }
  if (pending.length) console.log('Run cap reached. Resume pending details with --resume.');
}
try {
  await run();
  if (runId)
    await checked(
      client!
        .from('sync_runs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          requests,
          cursor: JSON.stringify(state[kind] || {}),
        })
        .eq('id', runId)
        .select(),
    );
} catch (e) {
  const code =
    e instanceof ProviderError
      ? e.code
      : e instanceof Error && /^(LOCAL_|Missing |--)/.test(e.message)
        ? e.message
        : 'IMPORT_FAILED';
  if (runId)
    await client!
      .from('sync_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        requests,
        error_code: code,
      })
      .eq('id', runId);
  console.error(code);
  process.exitCode = 1;
}
