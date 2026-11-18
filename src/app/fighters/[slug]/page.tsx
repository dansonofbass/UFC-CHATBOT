import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fighter } from '@/lib/data';
import { db } from '@/lib/db';
import { Source } from '@/components/data-ui';
import { Button } from '@/components/ui/button';
export const dynamic = 'force-dynamic';
export default async function FighterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    f = await fighter(slug);
  if (!f) notFound();
  const client = db();
  const { data: history } = client
    ? await client
        .from('fights')
        .select('id,payload,source_url,updated_at,events(title,starts_at)')
        .or(`fighter_a_id.eq.${f.id},fighter_b_id.eq.${f.id}`)
        .limit(50)
    : { data: null };
  return (
    <div className="page">
      <div className="page-intro">
        <div className="section-kicker">{f.nickname || 'FIGHTER PROFILE'}</div>
        <h1>{f.name}</h1>
        <p>
          {f.nationality || 'Nationality unavailable'} · {f.stance || 'Stance unavailable'}
        </p>
        <Button asChild>
          <Link href={`/chat?q=${encodeURIComponent(`Tell me about UFC fighter ${f.name}`)}`}>
            Ask about {f.name.split(' ')[0]}
          </Link>
        </Button>
      </div>
      <dl className="metric-grid">
        {[
          ['UFC record', f.records?.ufc?.value],
          ['Total professional MMA record', f.records?.pro_mma?.value],
          ['Height', f.height_inches ? `${f.height_inches} in` : null],
          ['Reach', f.reach_inches ? `${f.reach_inches} in` : null],
          ['Weight', f.weight_lbs ? `${f.weight_lbs} lbs` : null],
          ['Team', f.team],
        ].map(([k, v]) => (
          <div className="metric" key={k}>
            <dt>{k}</dt>
            <dd>{v || 'Unavailable'}</dd>
          </div>
        ))}
      </dl>
      <Source url={f.source_url} date={f.updated_at} />
      <section className="details panel">
        <h2>Available statistics</h2>
        <p>Statistics use the source’s sample basis, which may span multiple promotions.</p>
        <div className="table-scroll">
          <table className="data-table">
            <tbody>
              {Object.entries(f.stats || {})
                .filter(([k, v]) => k !== 'basis' && typeof v !== 'object')
                .map(([k, v]) => (
                  <tr key={k}>
                    <th>{k.replaceAll('_', ' ')}</th>
                    <td>{String(v ?? 'Unavailable')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!f.stats && <p>No statistical panel has been imported.</p>}
        {f.stats?.basis && <p className="source">Sample basis: {JSON.stringify(f.stats.basis)}</p>}
      </section>
      <section className="details panel">
        <h2>Imported fight history</h2>
        {history?.length ? (
          history.map((h) => (
            <article key={h.id}>
              <h3>
                {h.payload.fighter_a?.name || 'Unknown'} vs {h.payload.fighter_b?.name || 'Unknown'}
              </h3>
              <p>
                {h.payload.status} · {h.payload.result?.method || 'Result unavailable'}
              </p>
              <Source url={h.source_url} date={h.updated_at} />
            </article>
          ))
        ) : (
          <p>No verified fight history has been imported.</p>
        )}
      </section>
    </div>
  );
}
