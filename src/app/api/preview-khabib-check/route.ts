import { NextRequest } from 'next/server';
import { POST as chatPOST } from '@/app/api/chat/route';
import { directory } from '@/lib/intelligent-retrieval';
import { liveProvider } from '@/lib/live-retrieval';
import { identitySchema, envelope } from '@/lib/schemas';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Preview-only throwaway diagnostic. Remove before production deployment.
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') return new Response('Not found', { status: 404 });
  const q = 'give me the record of khabib';
  const candidates = await directory(AbortSignal.timeout(8000));
  const localMatches = candidates.filter(f=>f.name.toLowerCase().includes('khabib')).map(f=>f.name);
  let provider: unknown;
  try {
    const out = await liveProvider(AbortSignal.timeout(8000))('/fighters?org=ufc&q=khabib&limit=10', envelope(z.array(identitySchema)));
    provider = { matched:out.data.map(f=>({name:f.name,slug:f.slug})) };
  } catch (e) {
    provider = { error:e instanceof Error ? e.name : 'unknown', reason:e instanceof Error ? e.message.slice(0,140) : '' };
  }
  const response = await chatPOST(new Request(new URL('/api/chat', request.url), {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      ...(request.headers.get('x-vercel-forwarded-for') ? {'x-vercel-forwarded-for':request.headers.get('x-vercel-forwarded-for')!} : {}),
    },
    body: JSON.stringify({messages:[{role:'user',content:q}]}),
  }));
  const body = await response.text();
  const frames = body.trim().split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}});
  const answer = frames.filter(f=>f.type==='text').map(f=>f.text).join('');
  return Response.json({localMatches,provider,http_status:response.status,frame_types:frames.map(f=>f.type),answer:answer.slice(0,700),has_sources:frames.some(f=>f.type==='sources'),error:frames.find(f=>f.type==='error')?.error || (!response.ok ? body.slice(0,160) : null)},{headers:{'Cache-Control':'no-store'}});
}
