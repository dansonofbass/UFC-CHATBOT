import { z } from 'zod';
import { isAdmin } from '@/lib/admin-auth';
import { loadProviderSettings, saveProviderSettings, settingsView } from '@/lib/provider-settings';
import { testAIConnection, dataProviders } from '@/lib/provider-connection-test';
import { clientLimit } from '@/lib/security';
export const runtime = 'nodejs';
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  if (!(await isAdmin())) return json({ error: 'Unauthorized' }, 401);
  try {
    return json(settingsView(await loadProviderSettings()));
  } catch {
    return json({ error: 'Provider settings unavailable' }, 503);
  }
}
export async function POST(request: Request) {
  if (!(await isAdmin())) return json({ error: 'Unauthorized' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return json({ error: 'Forbidden' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 8000)
    return json({ error: 'Request too large' }, 413);
  const raw = await request.text();
  if (raw.length > 8000) return json({ error: 'Request too large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const action = z
    .discriminatedUnion('action', [
      z.object({ action: z.literal('save'), settings: z.unknown() }).strict(),
      z
        .object({
          action: z.literal('test_ai'),
          provider: z.enum(['groq', 'openrouter']),
          slot: z.union([z.literal(1), z.literal(2)]),
          model: z.string().min(1).max(150),
        })
        .strict(),
      z
        .object({
          action: z.literal('test_data'),
          provider: z.literal('ufcalendar'),
          slot: z.number().int().min(1).max(3),
        })
        .strict(),
    ])
    .safeParse(body);
  if (!action.success) return json({ error: 'Invalid provider settings request' }, 400);
  try {
    if (!(await clientLimit(request))) return json({ error: 'Request limit reached' }, 429);
    const input = action.data;
    if (input.action === 'save')
      return json(settingsView(await saveProviderSettings(input.settings)));
    if (input.action === 'test_ai')
      return json({ result: await testAIConnection(input.provider, input.slot, input.model) });
    return json({ result: await dataProviders[input.provider].test(input.slot) });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: 'Invalid provider settings' }, 400);
    const message =
      error instanceof Error &&
      [
        'Selected API key slot is not configured',
        'Selected model is not configured or permitted',
        'Selected UFCalendar slot is not configured',
      ].includes(error.message)
        ? error.message
        : 'Provider settings storage or controls unavailable';
    return json({ error: message }, message.startsWith('Selected') ? 400 : 503);
  }
}
