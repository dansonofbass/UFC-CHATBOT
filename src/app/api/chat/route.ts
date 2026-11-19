import { z } from 'zod';
import { resolveIntent } from '@/lib/router';
import { retrieve } from '@/lib/retrieval';
import { answer, providers } from '@/lib/ai';
import { clientLimit, reserveAI } from '@/lib/security';
import { fighters } from '@/lib/data';
import { cachedEvidence } from '@/lib/cache';
import { retrievalConfig } from '@/lib/retrieval-config';
import { directory as fighterDirectory, intelligentRetrieve } from '@/lib/intelligent-retrieval';
import { queryPlan } from '@/lib/model-understanding';
import { understand } from '@/lib/understanding';
export const runtime = 'nodejs';
export const maxDuration = 60;
const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2500),
      }),
    )
    .min(1)
    .max(16),
});
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 45000)
    return Response.json({ error: 'Request too large' }, { status: 413 });
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 45000) return Response.json({ error: 'Request too large' }, { status: 413 });
  let parsed;
  try {
    parsed = schema.safeParse(JSON.parse(raw));
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user')
    return Response.json({ error: 'Invalid conversation' }, { status: 400 });
  const messages = parsed.data.messages,
    query = messages.at(-1)!.content,
    fa = /[\u0600-\u06ff]/.test(query);
  const requestSignal = AbortSignal.any([request.signal, AbortSignal.timeout(55000)]);
  try {
    if (!(await clientLimit(request)))
      return Response.json(
        { error: 'Hourly request limit reached. Try again later.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    const intelligence = retrievalConfig().CHAT_INTELLIGENCE_ENABLED === 'true';
    const history = messages.slice(0, -1);
    const directory = intelligence ? { items: await fighterDirectory() } : await fighters();
    const plan = intelligence ? understand(query, history, directory.items) : undefined;
    const intent =
      plan?.intent ||
      resolveIntent(
        query,
        messages.slice(0, -1),
        directory.items.flatMap((f) => [f.name, f.slug.replaceAll('-', ' '), f.nickname || '']),
      );
    const encoder = new TextEncoder();
    const record = (data: unknown) => encoder.encode(JSON.stringify(data) + '\n');
    if (
      intent === 'out_of_scope' &&
      (!intelligence ||
        retrievalConfig().CHAT_MODEL_UNDERSTANDING_ENABLED !== 'true' ||
        /ignore|reveal|system prompt/i.test(query))
    )
      return new Response(
        record({
          type: 'text',
          text: fa
            ? 'من فقط درباره UFC، مبارزان، مسابقات و قوانین مرتبط پاسخ می‌دهم.'
            : 'I can help with UFC fighters, events, fight history, and relevant MMA rules. Please ask a UFC question.',
        }),
        { headers: { 'Content-Type': 'application/x-ndjson' } },
      );
    const evidence = await cachedEvidence(query, JSON.stringify(history), async () => {
      if (!intelligence) return retrieve(query, history, intent);
      const prepared = await queryPlan(query, history, directory.items, requestSignal);
      if (prepared.intent === 'out_of_scope')
        return {
          text: '',
          citations: [],
          deterministic:
            'I can help with UFC fighters, events, fight history, and relevant MMA rules.',
          cacheTtlMs: 0,
        };
      return intelligentRetrieve(
        query,
        history,
        directory.items,
        AbortSignal.any([requestSignal, AbortSignal.timeout(20000)]),
        prepared,
      );
    });
    if (!evidence.text && !evidence.deterministic)
      return new Response(
        record({
          type: 'text',
          text: fa
            ? 'برای این پرسش دادهٔ تأییدشده‌ای در دسترس نیست. لطفاً وضعیت منابع را بررسی کنید.'
            : 'I don’t have verified data for this question yet. Check Data status for source availability. I won’t guess statistics or news.',
        }),
        { headers: { 'Content-Type': 'application/x-ndjson' } },
      );
    if (
      (!evidence.deterministic || (fa && evidence.text)) &&
      !(await reserveAI(
        Buffer.byteLength(evidence.text + JSON.stringify(messages), 'utf8'),
        providers().length || 1,
      ))
    )
      return Response.json(
        { error: 'Daily AI budget reached. Verified records remain available in the directory.' },
        { status: 429 },
      );
    const generation = new AbortController();
    const signal = AbortSignal.any([requestSignal, generation.signal]);
    let cancelled = false;
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(record({ type: 'sources', sources: evidence.citations }));
          if (evidence.deterministic && (!fa || !evidence.text))
            controller.enqueue(record({ type: 'text', text: evidence.deterministic }));
          else
            for await (const text of answer(messages, evidence.text, signal)) {
              if (cancelled) break;
              controller.enqueue(record({ type: 'text', text }));
            }
          if (!cancelled) controller.enqueue(record({ type: 'done' }));
        } catch {
          if (!cancelled)
            controller.enqueue(
              record({
                type: 'error',
                error: 'Generation interrupted. Please retry when the provider is available.',
              }),
            );
        } finally {
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
        generation.abort();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    return Response.json(
      { error: 'Verified retrieval and usage controls are unavailable. Check /status.' },
      { status: 503 },
    );
  }
}
