import { NextRequest } from 'next/server';
import { clientLimit } from '@/lib/security';
import { directory, intelligentRetrieve } from '@/lib/intelligent-retrieval';
import { understand } from '@/lib/understanding';

// TEMPORARY PREVIEW ONLY. Remove before any production release.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const questions: Record<string, string> = {
  typo: 'Who is Jon Jons and what is his MMA record?',
  comparison: 'Compare Jon Jones and Tom Aspinall records',
  event: 'What happened at the latest UFC event?',
};
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') return new Response('Not found', { status: 404 });
  if (!(await clientLimit(request))) return new Response('Rate limited', { status: 429 });
  const selected = request.nextUrl.searchParams.get('case') || 'typo';
  if (!Object.hasOwn(questions, selected)) return new Response('Unknown test', { status: 400 });
  const started = Date.now();
  try {
    const question = questions[selected];
    const signal = AbortSignal.timeout(28000);
    const fighters = await directory(signal);
    const plan = understand(question, [], fighters);
    const evidence = await intelligentRetrieve(question, [], fighters, signal, plan);
    return Response.json({
      case: selected,
      enabled: process.env.CHAT_INTELLIGENCE_ENABLED === 'true',
      live_enabled: process.env.CHAT_LIVE_RETRIEVAL_ENABLED === 'true',
      model_enabled: process.env.CHAT_MODEL_UNDERSTANDING_ENABLED === 'true',
      intent: plan.intent,
      selected: plan.fighters.map(f => f.name),
      evidence_found: evidence.text.length > 0,
      answer_ready: Boolean(evidence.deterministic || evidence.text),
      answer_excerpt: (evidence.deterministic || '').slice(0, 400),
      citation_count: evidence.citations.length,
      elapsed_ms: Date.now()-started
    }, {headers: {'Cache-Control':'no-store'}});
  } catch(e) {
    return Response.json({case:selected, error:e instanceof Error ? e.name : 'unknown', elapsed_ms:Date.now()-started}, {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
