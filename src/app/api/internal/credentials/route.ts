import { authorized } from '@/lib/security';
import { UFCalendar } from '@/lib/ufcalendar';
import { z } from 'zod';
export async function POST(request: Request) {
  if (!authorized(request.headers.get('authorization')))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const p = z
    .object({ slot: z.number().int().min(1).max(3) })
    .safeParse(await request.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'Invalid slot' }, { status: 400 });
  try {
    return Response.json(await new UFCalendar().test(p.data.slot));
  } catch {
    return Response.json({ error: 'Credential not configured' }, { status: 400 });
  }
}
