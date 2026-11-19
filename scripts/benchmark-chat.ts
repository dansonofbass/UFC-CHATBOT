// Reproducible offline understanding benchmark; synthetic facts are not real fighter records.
import { writeFile, readFile } from 'node:fs/promises';
import { understand } from '../src/lib/understanding';
const directory = [
  { id: 1, name: 'Jon Jones', slug: 'jon-jones', nickname: 'Bones' },
  { id: 2, name: 'Tom Aspinall', slug: 'tom-aspinall', nickname: null },
];
const fixtures = [
  { query: 'Who is Jon Jones?', ids: [1], intent: 'fighter_profile' },
  { query: 'Tell me about John Jones.', ids: [1], intent: 'fighter_profile' },
  { query: 'Who is Jon Jons?', ids: [1], intent: 'fighter_profile' },
  { query: 'What is Bones’ MMA record?', ids: [1], intent: 'fighter_history' },
  { query: 'Compare Jon Jones and Tom Aspinall', ids: [1, 2], intent: 'fighter_comparison' },
  { query: 'What happened at the latest UFC event?', ids: [], intent: 'completed_event' },
  { query: 'Unknown Person UFC record', ids: [], intent: 'fighter_history' },
];
const latencies: number[] = [];
let correct = 0;
for (let round = 0; round < 100; round++)
  for (const f of fixtures) {
    const started = performance.now();
    const p = understand(f.query, [], directory);
    latencies.push(performance.now() - started);
    if (
      JSON.stringify(p.fighters.map((x) => x.id)) === JSON.stringify(f.ids) &&
      p.intent === f.intent
    )
      correct++;
  }
latencies.sort((a, b) => a - b);
const live = JSON.parse(await readFile('docs/chat-live-results.json', 'utf8'));
const liveRows = live.results as {
  duration_ms: number;
  sources: unknown[];
  answer: string;
  error: boolean;
}[];
const report = {
  checked_at: new Date().toISOString(),
  fixture_cases: fixtures.length,
  fixture_iterations: latencies.length,
  fixture_identity_and_intent_accuracy: correct / latencies.length,
  understanding_p50_ms: latencies[Math.floor(latencies.length * 0.5)],
  understanding_p95_ms: latencies[Math.floor(latencies.length * 0.95)],
  live_cases: liveRows.length,
  live_sourced_answers: liveRows.filter((r) => r.sources.length && !r.error).length,
  live_safe_fallbacks: liveRows.filter((r) => !r.sources.length && r.answer && !r.error).length,
  live_latency_ms: liveRows.map((r) => r.duration_ms),
  limitations:
    'Synthetic identity/intent accuracy is not a real-world factual accuracy score. Live checks verify source presence and safe failure, not independent publisher truth. No comprehensive accuracy claim is made.',
};
await writeFile('docs/chat-benchmark.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
