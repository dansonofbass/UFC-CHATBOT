import { retrieve } from '@/lib/retrieval';
import { clientLimit } from '@/lib/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Temporary smoke-test endpoint, to be deleted after end-to-end verification.
export async function GET(request: Request) {
  if (!(await clientLimit(request))) return Response.json({ error: 'Limited' }, { status: 429 });
  try {
    const evidence = await retrieve('who is john jones and what is his records?', [], 'fighter_history');
    let fighter: { name?: string; slug?: string; records?: Record<string, { value?: string }> } | null = null;
    for (const line of evidence.text.split('\n')) {
      try {
        const record = JSON.parse(line);
        if (record.slug === 'jon-jones') { fighter = record; break; }
      } catch {}
    }
    return Response.json({
      found: !!fighter,
      fighter: fighter?.name || null,
      record: fighter?.records?.pro_mma?.value || null,
      evidenceLength: evidence.text.length,
      citationCount: evidence.citations.length,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: 'Retrieval failed', category: e instanceof Error ? e.name : 'unknown' }, { status: 503 });
  }
}
