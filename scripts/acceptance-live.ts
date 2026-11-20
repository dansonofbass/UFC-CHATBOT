import { writeFile } from 'node:fs/promises';
const base = new URL(process.argv[2] || 'http://localhost:3100');
const questions = [
  'Explain UFC fight statistics.',
  'What is SLpM?',
  'What is takedown defense?',
  'Tell me about Islam Makhachev.',
  'islam makhachev',
  'Give me the record of Khabib.',
  'Who is Khabib Nurmagomedov?',
  'Tell me about Jon Jones.',
  'Compare Jon Jones and Tom Aspinall.',
  'Compare Khabib and Islam Makhachev.',
  'How does UFC scoring work?',
  'What is the difference between a TKO and a KO?',
  'Explain the difference between striking accuracy and striking defense.',
  'What does control time mean?',
  'How are UFC rankings determined?',
  "What happened in Islam Makhachev's last fight?",
  'Who did Khabib fight last?',
  'What is the next UFC event?',
  'What was the latest completed UFC event?',
  'Why is grappling important in MMA?',
];
const conversations = [
  ['Explain UFC fight statistics.', 'islam makhachev'],
  [
    'Tell me about Islam Makhachev.',
    'What about his takedown defense?',
    'Compare that with Khabib.',
  ],
  ['Tell me about Khabib.', 'What was his record?', 'How many submissions did he win by?'],
  ['Compare Khabib and Islam Makhachev.', 'Who was better at takedowns?'],
  ['Tell me about Khabib.', 'Tell me about Jon Jones.', 'What was his record?'],
];
type Message = { role: 'user' | 'assistant'; content: string };
type Frame = {
  type: string;
  text?: string;
  sources?: { url: string; title: string }[];
  error?: string;
};
const results: {
  group: string;
  question: string;
  status: number;
  latency_ms: number;
  checks: Record<string, boolean>;
  automatedPass: boolean;
  sources: { url: string; title: string }[];
  answer: string;
}[] = [];
async function ask(question: string, history: Message[], group: string) {
  await new Promise((resolve) =>
    setTimeout(resolve, Number(process.env.ACCEPTANCE_DELAY_MS || 12000)),
  );
  const started = performance.now();
  const response = await fetch(new URL('/api/chat', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [...history, { role: 'user', content: question }] }),
    signal: AbortSignal.timeout(60000),
  });
  const raw = await response.text();
  const frames: Frame[] = response.headers.get('content-type')?.includes('ndjson')
    ? raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  const answer = frames
    .filter((f) => f.type === 'text')
    .map((f) => f.text || '')
    .join('');
  const sources = frames.find((f) => f.type === 'sources')?.sources || [];
  const urls = [...answer.matchAll(/https?:\/\/[^\s)\]>\u3011]+/g)].map((m) => m[0]);
  const checks = {
    http: response.ok,
    complete: frames.some((f) => f.type === 'done'),
    noError: !frames.some((f) => f.type === 'error'),
    meaningful: answer.split(/\s+/).length >= 25,
    noGenericRefusal: !/not enough verified evidence|please name the fighter or event/i.test(
      answer,
    ),
    suppliedCitations: urls.every((url) => sources.some((s) => s.url === url)),
    noFalseRetirement: !/Jon Jones.{0,20}(?:is retired|has retired)/i.test(answer),
  };
  const result = {
    group,
    question,
    status: response.status,
    latency_ms: Math.round(performance.now() - started),
    checks,
    automatedPass: Object.values(checks).every(Boolean),
    sources,
    answer,
  };
  results.push(result);
  console.log(JSON.stringify({ group, question, checks, latency_ms: result.latency_ms }));
  await writeFile(
    process.env.ACCEPTANCE_REPORT || 'docs/conversational-live-results.json',
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        target: base.origin,
        note: 'Content gates do not establish independent factual accuracy. Dynamic coverage gaps require review.',
        results,
      },
      null,
      2,
    ) + '\n',
  );
  return answer;
}
for (const question of process.argv.includes('--conversations') ? [] : questions)
  await ask(
    question,
    question === 'islam makhachev'
      ? [{ role: 'user', content: 'Explain UFC fight statistics.' }]
      : [],
    'single',
  );
for (const [index, turns] of conversations.entries()) {
  const groups = process.argv
    .filter((arg) => arg.startsWith('--group='))
    .map((arg) => Number(arg.split('=')[1]));
  if (groups.length && !groups.includes(index + 1)) continue;
  const history: Message[] = [];
  for (const question of turns) {
    const answer = await ask(question, history, `conversation-${index + 1}`);
    history.push({ role: 'user', content: question });
    if (answer) history.push({ role: 'assistant', content: answer });
  }
}
if (results.some((r) => !r.automatedPass)) process.exitCode = 1;
