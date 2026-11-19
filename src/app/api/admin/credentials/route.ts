import { isAdmin } from '@/lib/admin-auth';
import { UFCalendar } from '@/lib/ufcalendar';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!await isAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  const data = z.object({ slot: z.number().int().min(1).max(3) })
    .safeParse(await request.json().catch(() => null));
  if (!data.success) return Response.json({ error: 'Invalid slot' }, { status: 400 });
  try {
    return Response.json({ result: await new UFCalendar().test(data.data.slot) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Credential test failed' }, { status: 503 });
  }
}
