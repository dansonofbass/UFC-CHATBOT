import { z } from 'zod';
import { answer, resolvedProviders } from '@/lib/ai';
import { clientLimit, reserveAI } from '@/lib/security';
import { prepareChat, chatDiagnostic } from '@/lib/chat-orchestration';
import { groundedCitations } from '@/lib/citation-guard';
export const runtime = 'nodejs';
export const maxDuration = 60;
const schema = z.object({
  messages: z
    .array(
      z
        .object({
          role: z.enum(['user', 'assistant']),
          content: z.string().trim().min(1).max(10000),
        })
        .refine((message) => message.role === 'assistant' || message.content.length <= 2500),
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
    const requestId = crypto.randomUUID();
    const started = performance.now();
    const encoder = new TextEncoder();
    const record = (data: unknown) => encoder.encode(JSON.stringify(data) + '\n');
    const evidence = await prepareChat(query, messages.slice(0, -1), requestSignal, requestId);
    chatDiagnostic(requestId, 'retrieval', {
      sources: evidence.citations.length,
      hasEvidence: !!evidence.text,
      latencyMs: Math.round(performance.now() - started),
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
    const selectedProviders = evidence.text
      ? await resolvedProviders().catch(() => {
          chatDiagnostic(requestId, 'provider_resolution', { status: 'unavailable' });
          return [];
        })
      : [];
    let generate = !!evidence.text && selectedProviders.length > 0;
    if (generate) {
      const reserved = await reserveAI(
        Buffer.byteLength(evidence.text + JSON.stringify(messages), 'utf8'),
        (selectedProviders.length || 1) * 2,
      ).catch(() => false);
      if (!reserved) {
        if (evidence.deterministic) generate = false;
        else
          return Response.json(
            { error: 'AI usage allowance is temporarily unavailable. Please retry later.' },
            { status: 429 },
          );
      }
    }
    const generation = new AbortController();
    const signal = AbortSignal.any([requestSignal, generation.signal]);
    let cancelled = false;
    const stream = new ReadableStream({
      async start(controller) {
        let emitted = false;
        try {
          controller.enqueue(record({ type: 'sources', sources: evidence.citations }));
          if (!generate && evidence.deterministic)
            controller.enqueue(record({ type: 'text', text: evidence.deterministic }));
          else
            for await (const text of groundedCitations(
              answer(messages, evidence.text, signal, selectedProviders),
              evidence.citations.map((c) => c.url),
              evidence.text.includes('ANSWER_MODE: educational') ? undefined : evidence.text,
            )) {
              if (cancelled) break;
              if (!text) continue;
              if (text.trim()) emitted = true;
              controller.enqueue(record({ type: 'text', text }));
            }
          if (generate && !emitted && !cancelled)
            controller.enqueue(
              record({
                type: 'text',
                text:
                  evidence.deterministic ||
                  'The available sources did not support a reliable explanation. Please ask for a specific statistic or bout.',
              }),
            );
          chatDiagnostic(requestId, 'generation', {
            status: generate ? 'generated' : 'fallback',
            latencyMs: Math.round(performance.now() - started),
          });
          if (!cancelled) controller.enqueue(record({ type: 'done' }));
        } catch {
          chatDiagnostic(requestId, 'generation', { status: 'error', emitted });
          if (!cancelled && !emitted && evidence.deterministic) {
            controller.enqueue(record({ type: 'text', text: evidence.deterministic }));
            controller.enqueue(record({ type: 'done' }));
          } else if (!cancelled)
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
