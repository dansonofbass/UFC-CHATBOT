import type { Message, Intent } from './router';

// These describe domain vocabulary, not individual questions or fighter identities.
const concepts =
  /\b(mma|ufc|scoring|judg\w*|rounds?|rules?|weight classes|rankings?|championship|champion|decisions?|knockouts?|ko|tko|submissions?|strik\w*|slpm|sapm|takedowns?|grappling|control time|statistics|stats|accuracy|defen[cs]e|techniques?|records?)\b/i;
const explanation =
  /\b(explain|meaning|mean|difference|define|definition|work|determined|important|basics|what is|what are|how are|how does|why)\b/i;
const references = /\b(he|she|his|her|him|they|their|them|that|those|both|it)\b/i;

export function educationalQuestion(query: string, hasEntity = false) {
  return (
    !hasEntity &&
    !references.test(query) &&
    concepts.test(query) &&
    explanation.test(query) &&
    !/['’]\s*(?:s\b|mma\b|ufc\b)/i.test(query) &&
    !/\b(latest|recent|next|current|today|yesterday|last fight|who won|who is|tell me about)\b/i.test(
      query,
    ) &&
    !/\b(record|statistics|stats) (of|for)\b/i.test(query)
  );
}

export function conversationTopic(history: Message[]) {
  for (const message of history
    .filter((m) => m.role === 'user')
    .slice(-8)
    .reverse()) {
    const match = message.content.match(
      /takedown defen[cs]e|takedown accuracy|takedowns?|submission attempts?|control time|striking accuracy|striking defen[cs]e|significant strikes?|total strikes?|slpm|sapm|statistics|stats|records?/i,
    );
    if (match) return match[0];
  }
}

export function topicIntent(topic?: string): Intent | undefined {
  if (!topic) return;
  return /record/i.test(topic) ? 'fighter_history' : 'fight_statistics';
}

export function synthesisEvidence(text: string, educational = false) {
  return `${educational ? 'ANSWER_MODE: educational. Explain stable MMA concepts in original language. Never add fighter-specific or current facts without evidence.' : 'ANSWER_MODE: sourced. Exact numerical and historical claims require the evidence below.'}\n${text}`;
}
