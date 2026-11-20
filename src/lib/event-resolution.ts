import { z } from 'zod';
import { events } from './data';
import { liveProvider } from './live-retrieval';
import { retrievalConfig } from './retrieval-config';
import { eventSchema, envelope } from './schemas';
import type { Evidence } from './retrieval';

const searchSchema = envelope(
  z.object({
    events: z.array(
      z.object({
        id: z.number().int(),
        slug: z.string(),
        title: z.string(),
        org: z.string(),
        starts_at: z.iso.datetime(),
      }),
    ),
  }),
);
export async function eventEvidence(subject: string, signal: AbortSignal): Promise<Evidence> {
  const matches = (title: string) => {
    const label = subject.toLowerCase().replace(/\s+/g, ' ').trim();
    return new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title);
  };
  let selected = (await events().catch(() => ({ items: [] }))).items.filter((e) =>
    matches(e.title),
  );
  if (selected.length > 1)
    return {
      text: '',
      citations: [],
      deterministic: `Which event do you mean: ${selected.map((e) => e.title).join(', ')}?`,
      cacheTtlMs: 0,
    };
  const get = liveProvider(signal);
  if (
    retrievalConfig().CHAT_LIVE_RETRIEVAL_ENABLED === 'true' &&
    (!selected.length ||
      !selected[0].card ||
      Date.now() - Date.parse(selected[0].updated_at) > 900000)
  ) {
    try {
      let id = selected[0]?.id;
      if (!id) {
        const result = await get(`/search?q=${encodeURIComponent(subject)}`, searchSchema);
        const found = result.data.events.filter((e) => e.org === 'ufc' && matches(e.title));
        if (found.length !== 1)
          return {
            text: '',
            citations: [],
            deterministic: found.length
              ? `Which event: ${found.map((e) => e.title).join(', ')}?`
              : `No verified event match for ${subject}. Please provide the event title or date.`,
            cacheTtlMs: 0,
          };
        id = found[0].id;
      }
      const detail = await get(`/events/${id}`, envelope(eventSchema));
      if (detail.data.id !== id || !matches(detail.data.title))
        throw new Error('Event identity mismatch');
      selected = [
        {
          ...detail.data,
          source_url: 'https://www.ufcalendar.com',
          updated_at: detail.meta?.fetched_at || new Date().toISOString(),
        },
      ];
    } catch {
      /* A dated cached event can still answer historical questions. */
    }
  }
  const event = selected[0];
  if (!event)
    return {
      text: '',
      citations: [],
      deterministic: `No verified cached event details are available for ${subject}. Please confirm the event title or date.`,
      cacheTtlMs: 0,
    };
  return {
    text: JSON.stringify({
      event: { ...event, source_url: 'https://www.ufcalendar.com' },
      observed_at: event.updated_at,
      limitation:
        'Only the listed bouts and explicit outcomes are verified. Null results are unknown; never infer winners.',
    }),
    citations: [
      { title: event.title, url: 'https://www.ufcalendar.com', updated_at: event.updated_at },
    ],
    cacheTtlMs: 60000,
  };
}
