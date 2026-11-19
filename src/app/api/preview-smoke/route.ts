import { NextRequest } from 'next/server';
import { POST as chatPOST } from '@/app/api/chat/route';
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
  chat: 'Who is Jon Jons and what is his record?',
  followup: 'Who did he fight last?',
};
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') return new Response('Not found', { status: 404 });
  const chatCase = ['chat','followup'].includes(request.nextUrl.searchParams.get('case') || 'typo');
  if (!chatCase && !(await clientLimit(request))) return new Response('Rate limited', { status: 429 });
  const selected = request.nextUrl.searchParams.get('case') || 'typo';
  if (!Object.hasOwn(questions, selected)) return new Response('Unknown test', { status: 400 });
  const started = Date.now();
  try {
    const question = questions[selected];
    if (selected === 'chat' || selected === 'followup') {
      const messages: Array<{role:'user'|'assistant'; content:string}> = selected === 'chat'
        ? [{role:'user',content:question}]
        : [{role:'user',content:'Who is Jon Jones?'},{role:'assistant',content:'Jon Jones is an MMA fighter.'},{role:'user',content:question}];
      const synthetic = new Request(new URL('/api/chat', request.url), {
        method:'POST', headers:{'Content-Type':'application/json',...(request.headers.get('x-vercel-forwarded-for') ? {'x-vercel-forwarded-for':request.headers.get('x-vercel-forwarded-for')!} : {})},body:JSON.stringify({messages})
      });
      const result = await chatPOST(synthetic);
      const body = await result.text();
      const frames = body.trim().split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}});
      const answer = frames.filter((f:{type?:string;text?:string})=>f.type==='text').map((f:{text?:string})=>f.text||'').join('');
      return Response.json({case:selected,status:result.status,frame_types:[...new Set(frames.map((f:{type?:string})=>f.type))],answer_excerpt:answer.slice(0,450),answer_length:answer.length,body_length:body.length,raw_excerpt:frames.length?undefined:body.slice(0,160),forwarded_header_present:!!request.headers.get('x-vercel-forwarded-for'),elapsed_ms:Date.now()-started}, {headers:{'Cache-Control':'no-store'}});
    }
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
