import nextEnv from '@next/env';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
nextEnv.loadEnvConfig(process.cwd());
const { liveProvider } = await import('../src/lib/live-retrieval');
const { envelope, identitySchema, fighterSchema } = await import('../src/lib/schemas');
const { saveFighter } = await import('../src/lib/ingestion');
const args = process.argv.slice(2);
const names = args.filter((a) => !a.startsWith('--'));
if (names.length > 1)
  throw new Error(
    'Use one quoted fighter search per selected-profile run, or omit it for resumable roster synchronization.',
  );
const max = z.coerce
  .number()
  .int()
  .min(1)
  .max(12)
  .parse(process.env.UFCALENDAR_MAX_REQUESTS_PER_RUN || 3);
const path = '.fighter-sync-state.json';
const stateSchema = z.object({
  cursor: z.string().nullable(),
  pending: z.array(z.number()),
  complete: z.boolean(),
});
let state: z.infer<typeof stateSchema> = { cursor: null, pending: [], complete: false };
if (args.includes('--resume')) {
  try {
    state = stateSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    /* first run */
  }
}
if (args.includes('--dry-run')) {
  console.log(JSON.stringify({ maxRequests: max, names, state, providerRequests: 0 }));
} else {
  process.env.CHAT_PROVIDER_REQUEST_LIMIT = String(max);
  const get = liveProvider(AbortSignal.timeout(120000));
  let requests = 0;
  if (!state.pending.length && !state.complete) {
    const query = names.length ? `&q=${encodeURIComponent(names.join(' '))}` : '';
    const page = await get(
      `/fighters?org=ufc&limit=10${query}${state.cursor ? `&cursor=${encodeURIComponent(state.cursor)}` : ''}`,
      envelope(z.array(identitySchema)),
    );
    requests++;
    state.pending = page.data.map((f) => f.id);
    state.cursor = page.meta.pagination?.next_cursor || null;
    state.complete = !page.meta.pagination?.has_more;
    await writeFile(path, JSON.stringify(state));
  }
  while (state.pending.length && requests < max) {
    const id = state.pending[0];
    const detail = await get(`/fighters/${id}`, envelope(fighterSchema));
    requests++;
    if (detail.data.id !== id) throw new Error('Provider identity mismatch');
    await saveFighter(detail.data, `https://api.ufcalendar.com/v1/fighters/${id}`);
    state.pending.shift();
    await writeFile(path, JSON.stringify(state));
    console.log(JSON.stringify({ id, status: 'written', requests }));
  }
  console.log(
    JSON.stringify({
      remaining: state.pending.length,
      rosterComplete: state.complete && !state.pending.length,
    }),
  );
}
