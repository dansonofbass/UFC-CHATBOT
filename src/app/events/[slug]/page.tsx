import { notFound } from 'next/navigation';
import { event } from '@/lib/data';
import { Source } from '@/components/data-ui';
export const dynamic = 'force-dynamic';
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const e = await event((await params).slug);
  if (!e) notFound();
  let venueTime = 'Venue timezone unavailable';
  try {
    if (e.tz)
      venueTime =
        new Date(e.starts_at).toLocaleString('en-US', {
          timeZone: e.tz,
          dateStyle: 'full',
          timeStyle: 'short',
        }) + ` (${e.tz})`;
  } catch {}
  return (
    <div className="page">
      <div className="page-intro">
        <div className="section-kicker">{e.status}</div>
        <h1>{e.title}</h1>
        <p>
          {new Date(e.starts_at).toLocaleString('en-US', {
            timeZone: 'UTC',
            dateStyle: 'full',
            timeStyle: 'short',
          })}{' '}
          UTC
          <br />
          {venueTime}
          <br />
          {[e.venue?.name, e.venue?.city, e.venue?.country].filter(Boolean).join(', ') ||
            'Venue unavailable'}
        </p>
        <Source url={e.source_url} date={e.updated_at} />
      </div>
      <section className="details panel">
        <h2>Fight card</h2>
        {e.card?.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bout</th>
                  <th>Division</th>
                  <th>Status / result</th>
                </tr>
              </thead>
              <tbody>
                {e.card.map((f) => (
                  <tr key={f.id}>
                    <td>
                      {f.is_main && <span className="tag">Main event</span>}
                      <br />
                      {f.fighter_a?.name || 'TBA'}
                      <br />
                      vs {f.fighter_b?.name || 'TBA'}
                    </td>
                    <td>
                      {f.weight_class || 'Unavailable'}
                      {f.is_title && ' · Title bout'}
                    </td>
                    <td>
                      {f.status || 'Unknown'}
                      <br />
                      {f.result?.method}
                      {f.result?.round && ` · R${f.result.round}`}
                      {f.result?.time && ` · ${f.result.time}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No full card has been imported. Scheduled cards may change.</p>
        )}
      </section>
    </div>
  );
}
