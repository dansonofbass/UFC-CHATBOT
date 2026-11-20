import nextEnv from '@next/env';
import { writeFile } from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd());
const { db } = await import('../src/lib/db');
const { queryEmbedding } = await import('../src/lib/embeddings');
const tests = [
  ['slpm significant strikes', 'mma-statistics'],
  ['successful grappling damage scoring', 'mma-scoring'],
  ['media panel rankings', 'ufc-rankings'],
  ['chokes armbars submissions', 'mma-basics'],
];
const results = [];
for (const [query, expected] of tests) {
  const vector = await queryEmbedding(query);
  for (const mode of ['lexical', 'hybrid']) {
    const { data, error } = await db()!.rpc('search_knowledge', {
      query_text: query,
      query_embedding: mode === 'hybrid' && vector ? JSON.stringify(vector) : null,
    });
    const expectedTitle = {
      'mma-statistics': 'Interpreting MMA statistics',
      'mma-scoring': 'Judging and scoring rounds',
      'ufc-rankings': 'Rankings and championship terminology',
      'mma-basics': 'MMA fundamentals and techniques',
    }[expected]!;
    const pass =
      !error && (data || []).slice(0, 3).some((r: { title: string }) => r.title === expectedTitle);
    results.push({
      query,
      mode,
      dimensions: vector?.length || 0,
      pass,
      titles: (data || []).map((r: { title: string }) => r.title),
    });
  }
}
await writeFile(
  'docs/conversational-retrieval-results.json',
  JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2) + '\n',
);
console.log(JSON.stringify(results));
if (results.some((r) => !r.pass)) process.exitCode = 1;
