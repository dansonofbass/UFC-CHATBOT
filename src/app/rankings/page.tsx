import Link from 'next/link';
import { rankings } from '@/lib/data';
import { Empty, Source } from '@/components/data-ui';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rankings' };
export default async function RankingsPage() {
  const r = await rankings();
  return (
    <div className="page">
      <div className="page-intro">
        <div className="section-kicker">THE OFFICIAL BOARD</div>
        <h1>A place in the conversation.</h1>
        <p>
          Imported official rankings are point-in-time snapshots. They are never presented as live
          rankings.
        </p>
      </div>
      {r ? (
        <>
          <p>
            Snapshot in force: <strong>{r.snapshot_date}</strong>
          </p>
          <Source url={r.source_url} date={r.updated_at} />
          <div className="grid two">
            {r.divisions.map((d) => (
              <section className="details panel" key={d.division}>
                <h3>{d.division.replaceAll('-', ' ')}</h3>
                <table className="data-table">
                  <tbody>
                    {d.entries.map((x) => (
                      <tr key={x.rank}>
                        <th>{x.is_champion ? 'C' : x.rank}</th>
                        <td>
                          {x.fighter_slug ? (
                            <Link href={`/fighters/${x.fighter_slug}`}>{x.name}</Link>
                          ) : (
                            x.name
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </>
      ) : (
        <Empty kind="ranking snapshots" />
      )}
    </div>
  );
}
