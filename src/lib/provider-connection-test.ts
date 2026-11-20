import { z } from 'zod';
import { aiKey, dataKey, validateAIChoice, type AIName } from './provider-settings';
import { consume, reserveAI } from './security';
import { UFCalendar, ProviderError } from './ufcalendar';
import { db } from './db';

export type ConnectionResult = { ok: boolean; code: string; message: string; httpStatus?: number };
const failure = (code: string, message: string, httpStatus?: number): ConnectionResult => ({
  ok: false,
  code,
  message,
  ...(httpStatus ? { httpStatus } : {}),
});
export async function testAIConnection(
  provider: AIName,
  slot: number,
  model: string,
  fetcher: typeof fetch = fetch,
): Promise<ConnectionResult> {
  try {
    validateAIChoice(provider, slot, model);
  } catch {
    return failure('not_configured', 'Selected key or model is not configured.');
  }
  try {
    if (!(await reserveAI(64, 1)))
      return failure('budget_exhausted', 'Internal AI test allowance reached.');
    const response = await fetcher(
      provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aiKey(provider, slot)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply OK.' }],
          max_tokens: 8,
          stream: false,
        }),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
        cache: 'no-store',
      },
    );
    if ([401, 403].includes(response.status))
      return failure(
        'invalid_credentials',
        'Credentials rejected or access denied.',
        response.status,
      );
    if (response.status === 429)
      return failure(
        'rate_limited',
        'Provider rate limit reached. Wait before testing again.',
        429,
      );
    if (response.status === 402)
      return failure('quota_exhausted', 'Provider credit or usage allowance is exhausted.', 402);
    if ([400, 404, 422].includes(response.status))
      return failure(
        'model_unavailable',
        'Selected model is unavailable or not supported by this key.',
        response.status,
      );
    if (!response.ok)
      return failure('unavailable', 'Provider is temporarily unavailable.', response.status);
    const parsed = z
      .object({ choices: z.array(z.object({ message: z.object({}).passthrough() })).min(1) })
      .safeParse(await response.json());
    return parsed.success
      ? {
          ok: true,
          code: 'connected',
          message: 'Connection and selected model accepted.',
          httpStatus: response.status,
        }
      : failure('invalid_response', 'Provider returned an unexpected response.', response.status);
  } catch {
    return failure('unavailable', 'Connection test timed out or the service is unavailable.');
  }
}
export interface DataProviderAdapter {
  name: string;
  test: (slot: number) => Promise<ConnectionResult>;
}
async function testUFCalendar(slot: number): Promise<ConnectionResult> {
  if (!dataKey(slot)) return failure('not_configured', 'UFCalendar key slot is missing.');
  const client = db(true);
  if (!client)
    return failure(
      'controls_unavailable',
      'Quota controls are unavailable. No provider request was sent.',
    );
  const now = new Date(),
    reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  let attempts = 0;
  const provider = new UFCalendar(
    fetch,
    { [`UFCALENDAR_API_KEY_${slot}`]: dataKey(slot), UFCALENDAR_ACTIVE_KEY: String(slot) },
    async () => {
      if (attempts >= 1) throw new Error('Test request bound');
      const { data, error } = await client
        .from('query_cache')
        .select('expires_at')
        .eq('key', 'ufcalendar:quota-block')
        .maybeSingle();
      if (error || (data && Date.parse(data.expires_at) > Date.now()))
        throw new Error('Quota blocked');
      const rate = await client
        .from('query_cache')
        .select('expires_at')
        .eq('key', 'ufcalendar:rate-block')
        .maybeSingle();
      if (rate.error || (rate.data && Date.parse(rate.data.expires_at) > Date.now()))
        throw new ProviderError(429, 'rate_limited');
      if (
        !(await consume(
          `ufcalendar:${process.env.UFCALENDAR_ACCOUNT_ID || 'primary'}:${now.toISOString().slice(0, 7)}`,
          1,
          Number(process.env.UFCALENDAR_MONTHLY_LOCAL_LIMIT || 80),
          reset,
        ))
      )
        throw new Error('Quota blocked');
      attempts++;
    },
  );
  try {
    await provider.request('/usage', z.object({ data: z.unknown(), meta: z.unknown() }));
    return {
      ok: true,
      code: 'connected',
      message: 'UFCalendar connected. One authorized usage request consumed.',
      httpStatus: 200,
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      if (error.status === 429) {
        if (error.code === 'rate_limited')
          await client
            .from('query_cache')
            .upsert({
              key: 'ufcalendar:rate-block',
              response: { reason: 'rate_limited' },
              expires_at: new Date(
                Date.now() + (error.retryAfterSeconds || 60) * 1000,
              ).toISOString(),
            });
        if (error.code === 'quota_exceeded')
          await client.from('query_cache').upsert({
            key: 'ufcalendar:quota-block',
            response: { reason: 'quota_exceeded' },
            expires_at: reset.toISOString(),
          });
        return failure(
          'rate_limited',
          'UFCalendar rate limit or quota reached. Do not repeat the test now.',
          429,
        );
      }
      if (
        error.status === 401 ||
        (error.code === 'no_healthy_credential' &&
          provider.status().some((c) => c.health === 'unauthorized'))
      )
        return failure('invalid_credentials', 'UFCalendar credentials rejected.', 401);
    }
    return failure('unavailable', 'UFCalendar or its quota controls are unavailable.');
  }
}
export const dataProviders: Record<'ufcalendar', DataProviderAdapter> = {
  ufcalendar: { name: 'UFCalendar', test: testUFCalendar },
};
