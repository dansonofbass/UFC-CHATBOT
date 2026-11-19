// Opt-in live smoke check. Uses real HTTP requests and existing quotas; no mocks.
// Run: npx tsx scripts/verify-chat.ts http://localhost:3100
import { writeFile } from 'node:fs/promises';
const base = new URL(process.argv[2] || 'http://localhost:3100');
if (!['http:', 'https:'].includes(base.protocol)) throw new Error('HTTP URL required');
const questions = process.argv.includes('--full')
  ? [
      'Who is Jon Jones?',
      'Tell me about John Jones.',
      'Who is Jon Jons?',
      "What is Bones' MMA record?",
      'What happened at the latest UFC event?',
      'Tell me about Unknown Fixture Fighter',
    ]
  : ['Who is Jon Jons?', 'What happened at the latest UFC event?'];
const results = [];
for (const question of questions) {
  const started = performance.now();
  const response = await fetch(new URL('/api/chat', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.text();
  const frames: { type: string; text?: string; sources?: unknown[] }[] = response.headers
    .get('content-type')
    ?.includes('ndjson')
    ? body
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  const result = {
    question,
    status: response.status,
    duration_ms: Math.round(performance.now() - started),
    frame_types: Array.from(new Set(frames.map((f) => f.type))),
    frame_count: frames.length,
    sources: frames.find((f) => f.type === 'sources')?.sources || [],
    answer: frames
      .filter((f) => f.type === 'text')
      .map((f) => f.text)
      .join(''),
    error: frames.some((f) => f.type === 'error') || !response.ok,
  };
  results.push(result);
  console.log(JSON.stringify({ ...result, frame_types: Array.from(new Set(result.frame_types)) }));
}
const unauthorized = await fetch(new URL('/api/internal/credentials', base), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slot: 1 }),
});
console.log(JSON.stringify({ diagnostics_unauthorized_status: unauthorized.status }));
if (process.argv.includes('--save'))
  await writeFile(
    'docs/chat-live-results.json',
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        target: base.origin,
        results,
        diagnostics_unauthorized_status: unauthorized.status,
      },
      null,
      2,
    ) + '\n',
  );
if (results.some((r) => r.error) || unauthorized.status !== 401) process.exitCode = 1;
