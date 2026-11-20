import type { Evidence } from './retrieval';
import type { Message } from './router';
import { directory, intelligentRetrieve } from './intelligent-retrieval';
import { queryPlan } from './model-understanding';
import { cachedEvidence } from './cache';
import { retrievalConfig } from './retrieval-config';
import { retrieve } from './retrieval';
import { resolveIntent } from './router';
import { educationalQuestion } from './chat-strategy';

export async function prepareChat(
  query: string,
  history: Message[],
  signal: AbortSignal,
  requestId?: string,
): Promise<Evidence> {
  if (retrievalConfig().CHAT_INTELLIGENCE_ENABLED !== 'true')
    return retrieve(query, history, resolveIntent(query, history));
  const educational = educationalQuestion(query);
  const items = educational ? [] : await directory(signal).catch(() => []);
  const plan = await queryPlan(query, history, items, signal);
  chatDiagnostic(requestId || 'internal', 'plan', {
    intent: plan.intent,
    fighterIds: plan.fighters.map((f) => f.id).join(','),
    contextual: plan.contextual,
    topic: plan.topic || '',
    ambiguous: plan.ambiguous,
    educational: plan.educational,
  });
  if (plan.intent === 'out_of_scope')
    return {
      text: '',
      citations: [],
      cacheTtlMs: 0,
      deterministic:
        'I can help with UFC fighters, events, fight history, and MMA concepts. What would you like to explore?',
    };
  if (plan.educational) return intelligentRetrieve(query, history, items, signal, plan);
  return cachedEvidence(query, JSON.stringify(history), () =>
    intelligentRetrieve(
      query,
      history,
      items,
      AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      plan,
    ),
  );
}

export function chatDiagnostic(
  requestId: string,
  stage: string,
  fields: Record<string, string | number | boolean>,
) {
  // Deliberately excludes raw messages, provider errors and credentials.
  console.info(JSON.stringify({ component: 'chat', requestId, stage, ...fields }));
}
