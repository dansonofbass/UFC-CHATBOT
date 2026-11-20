import { z } from 'zod';
import { db } from './db';
import { env } from './env';
import { UFCalendar } from './ufcalendar';

export const aiNames = ['groq', 'openrouter'] as const;
export type AIName = (typeof aiNames)[number];
const choice = z
  .object({ slot: z.union([z.literal(1), z.literal(2)]), model: z.string().min(1).max(150) })
  .strict();
export const providerSettingsSchema = z
  .object({
    activeAI: z.enum(aiNames),
    groq: choice,
    openrouter: choice,
    data: z
      .object({ provider: z.literal('ufcalendar'), slot: z.number().int().min(1).max(3) })
      .strict(),
  })
  .strict();
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;
export const settingsKey = () =>
  `admin:provider-settings:v1:${process.env.VERCEL_ENV || 'development'}`;
export function aiKey(name: AIName, slot: number) {
  const e = env();
  return name === 'groq'
    ? slot === 1
      ? e.GROQ_API_KEY
      : e.GROQ_API_KEY_2
    : slot === 1
      ? e.OPENROUTER_API_KEY
      : e.OPENROUTER_API_KEY_2;
}
export function models(name: AIName) {
  const e = env();
  const list = [
    name === 'groq' ? e.GROQ_MODEL : e.OPENROUTER_MODEL,
    ...(name === 'groq' ? e.GROQ_MODELS : e.OPENROUTER_MODELS).split(','),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(list)].filter(
    (model) => name !== 'openrouter' || model === 'openrouter/free' || model.endsWith(':free'),
  );
}
export function defaultProviderSettings(): ProviderSettings {
  const e = env();
  const preferredDataSlot = Number(process.env.UFCALENDAR_ACTIVE_KEY || 1);
  const defaultDataSlot = dataKey(preferredDataSlot)
    ? preferredDataSlot
    : [1, 2, 3].find((slot) => dataKey(slot)) || 1;
  return {
    activeAI: aiKey('groq', 1) || aiKey('groq', 2) ? 'groq' : 'openrouter',
    groq: { slot: aiKey('groq', 1) || !aiKey('groq', 2) ? 1 : 2, model: e.GROQ_MODEL },
    openrouter: {
      slot: aiKey('openrouter', 1) || !aiKey('openrouter', 2) ? 1 : 2,
      model: e.OPENROUTER_MODEL,
    },
    data: { provider: 'ufcalendar', slot: defaultDataSlot },
  };
}
export async function loadProviderSettings() {
  const client = db(true);
  if (!client) return defaultProviderSettings();
  const { data, error } = await client
    .from('query_cache')
    .select('response')
    .eq('key', settingsKey())
    .maybeSingle();
  if (error) throw new Error('Provider settings unavailable');
  return data ? providerSettingsSchema.parse(data.response) : defaultProviderSettings();
}
export function validateAIChoice(name: AIName, slot: number, model: string) {
  if (name === 'openrouter' && model !== 'openrouter/free' && !model.endsWith(':free'))
    throw new Error('Only free OpenRouter models allowed');
  if (![1, 2].includes(slot) || !aiKey(name, slot))
    throw new Error('Selected API key slot is not configured');
  if (!models(name).includes(model))
    throw new Error('Selected model is not configured or permitted');
}
export function dataKey(slot: number) {
  return process.env[`UFCALENDAR_API_KEY_${slot}`];
}
export async function saveProviderSettings(input: unknown) {
  const value = providerSettingsSchema.parse(input);
  validateAIChoice(value.activeAI, value[value.activeAI].slot, value[value.activeAI].model);
  // Inactive providers may be missing, but their model must still be allowlisted.
  for (const name of aiNames) {
    if (!models(name).includes(value[name].model))
      throw new Error('Selected model is not configured or permitted');
    if (aiKey(name, 1) || aiKey(name, 2))
      validateAIChoice(name, value[name].slot, value[name].model);
  }
  if ([1, 2, 3].some((slot) => dataKey(slot)) && !dataKey(value.data.slot))
    throw new Error('Selected UFCalendar slot is not configured');
  const client = db(true);
  if (!client) throw new Error('Provider settings storage unavailable');
  const { error } = await client
    .from('query_cache')
    .upsert({ key: settingsKey(), response: value, expires_at: '9999-12-31T00:00:00Z' });
  if (error) throw new Error('Provider settings storage unavailable');
  return value;
}
export type ResolvedAI = { name: AIName; slot: number; key: string; model: string; url: string };
export function resolveAI(settings: ProviderSettings): ResolvedAI[] {
  const resolve = (name: AIName): ResolvedAI => {
    const { slot, model } = settings[name];
    validateAIChoice(name, slot, model);
    return {
      name,
      slot,
      model,
      key: aiKey(name, slot)!,
      url: name === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1',
    };
  };
  if (!aiKey(settings.activeAI, 1) && !aiKey(settings.activeAI, 2)) {
    // No configured provider at all retains the existing no-model fallback.
    if (!aiNames.some((name) => aiKey(name, 1) || aiKey(name, 2))) return [];
  }
  const result = [resolve(settings.activeAI)];
  if (
    settings.activeAI === 'groq' &&
    env().ALLOW_OPENROUTER_FALLBACK === 'true' &&
    (aiKey('openrouter', 1) || aiKey('openrouter', 2))
  )
    result.push(resolve('openrouter'));
  return result;
}
export async function resolvedProviders() {
  return resolveAI(await loadProviderSettings());
}
export async function selectedDataProvider(
  beforeRequest?: () => Promise<void>,
  fetcher: typeof fetch = fetch,
) {
  const { data } = await loadProviderSettings();
  if (!dataKey(data.slot)) throw new Error('Selected UFCalendar slot is not configured');
  return new UFCalendar(
    fetcher,
    {
      [`UFCALENDAR_API_KEY_${data.slot}`]: dataKey(data.slot),
      UFCALENDAR_ACTIVE_KEY: String(data.slot),
    },
    beforeRequest,
  );
}
export function settingsView(settings: ProviderSettings) {
  return {
    settings,
    ai: Object.fromEntries(
      aiNames.map((name) => [
        name,
        {
          models: models(name),
          slots: [1, 2].map((slot) => ({
            slot,
            configured: !!aiKey(name, slot),
            label: `Key ${slot} · ****`,
          })),
        },
      ]),
    ),
    data: {
      provider: 'ufcalendar',
      slots: [1, 2, 3].map((slot) => ({
        slot,
        configured: !!dataKey(slot),
        label: `Credential ${slot} · ****`,
      })),
    },
    fallback:
      env().ALLOW_OPENROUTER_FALLBACK === 'true'
        ? 'Groq → free OpenRouter on recoverable errors before text; no key rotation.'
        : 'Automatic fallback disabled.',
  };
}
