import { db } from '@/lib/db';
import { missingVariables } from '@/lib/env';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Data status' };
export default async function Status() {
  const client = db();
  let connected = false;
  let latest: { kind: string; finished_at: string | null; status: string }[] = [];
  if (client) {
    const { error } = await client.from('fighters').select('id').limit(1);
    connected = !error;
  }
  const admin = db(true);
  if (admin) {
    const { data } = await admin
      .from('sync_runs')
      .select('kind,finished_at,status')
      .order('started_at', { ascending: false })
      .limit(8);
    latest = data || [];
  }
  const missing = missingVariables();
  const slots = [1, 2, 3].filter((i) => !!process.env[`UFCALENDAR_API_KEY_${i}`]);
  return (
    <div className="page">
      <div className="page-intro">
        <div className="section-kicker">TRANSPARENCY FIRST</div>
        <h1>Know your sources.</h1>
        <p>
          Configuration is distinct from a successful live check. This page does not spend provider
          quota or test AI keys.
        </p>
      </div>
      <div className="status-grid">
        {[
          [
            'Supabase',
            connected
              ? 'Live public read succeeded'
              : client
                ? 'Read failed — check schema and RLS'
                : 'Not configured',
          ],
          ['Groq', process.env.GROQ_API_KEY ? 'Configured · not live tested' : 'Not configured'],
          [
            'OpenRouter',
            process.env.OPENROUTER_API_KEY
              ? `Configured · fallback ${process.env.ALLOW_OPENROUTER_FALLBACK === 'true' ? 'enabled' : 'disabled'}`
              : 'Not configured',
          ],
          [
            'UFCalendar',
            slots.length
              ? `${slots.length} configured credential(s) · diagnostics require authorization`
              : 'No credentials configured',
          ],
          [
            'News',
            process.env.NEWS_FEEDS && process.env.NEWS_FEEDS !== '[]'
              ? 'Feed configuration present · sync required'
              : 'No permitted feed configured',
          ],
          [
            'Knowledge search',
            'PostgreSQL full-text retrieval · optional 384-dimensional multilingual vectors',
          ],
        ].map(([title, status]) => (
          <div className="panel status-card" key={title}>
            <strong>{title}</strong>
            <span className="status-label">{status}</span>
          </div>
        ))}
      </div>
      <section className="details panel">
        <h2>Recent ingestion runs</h2>
        {latest.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Finished (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((r, i) => (
                <tr key={i}>
                  <td>{r.kind}</td>
                  <td>{r.status}</td>
                  <td>{r.finished_at || 'Not finished'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No run history is available.</p>
        )}
      </section>
      {missing.length > 0 && (
        <section className="details panel">
          <h2>External setup remaining</h2>
          <p>
            Configure these environment variable names in the deployment environment. No secret
            values are displayed.
          </p>
          <ul>
            {missing.map((k) => (
              <li key={k}>
                <code>{k}</code>
              </li>
            ))}
          </ul>
          <p>
            Only one UFCalendar key is needed to begin. OpenRouter and additional keys are optional.
            See repository setup documentation.
          </p>
        </section>
      )}
    </div>
  );
}
