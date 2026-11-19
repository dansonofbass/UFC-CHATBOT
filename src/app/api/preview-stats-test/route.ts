import { NextRequest } from 'next/server';
import { POST as chatPOST } from '@/app/api/chat/route';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Temporary Preview-only regression diagnostic; remove before Production.
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') return new Response('Not found', {status:404});
  const c = request.nextUrl.searchParams.get('case');
  if (c !== 'guide' && c !== 'followup') return new Response('Unknown case', {status:400});
  const messages: {role:'user'|'assistant',content:string}[] = [
    {role:'user', content:'Explain UFC fight statistics'},
  ];
  if (c === 'followup') {
    messages.push({role:'assistant',content:'SLpM is significant strikes landed per minute. Please name a fighter.'});
    messages.push({role:'user', content:'islam makhachev'});
  }
  const response = await chatPOST(new Request(new URL('/api/chat', request.url), {
    method:'POST',
    headers: {
      'Content-Type':'application/json',
      ...(request.headers.get('x-vercel-forwarded-for')
        ? {'x-vercel-forwarded-for':request.headers.get('x-vercel-forwarded-for')!}
        : {}),
    },
    body:JSON.stringify({messages})
  }));
  const raw = await response.text();
  const frames = raw.trim().split('\n').flatMap((line)=>{try{return [JSON.parse(line)]}catch{return []}});
  const answer = frames.filter(f=>f.type==='text').map(f=>f.text || '').join('');
  return Response.json({case:c,innerStatus:response.status,answer:answer.slice(0,1100),frames:frames.map(f=>f.type),
    sources:frames.find(f=>f.type==='sources')?.sources?.map((x:{title:string})=>x.title) || [],
    error: response.ok ? frames.find(f=>f.type==='error')?.error : raw.slice(0,200)},
    {headers:{'Cache-Control':'no-store'}});
}
