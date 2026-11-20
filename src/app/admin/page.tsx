import { isAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { AdminProviderSettings } from '@/components/admin-provider-settings';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin console', robots: { index: false, follow: false } };
export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!await isAdmin()) {
    const params = await searchParams;
    return <section className="page" style={{ maxWidth: 480, margin: '50px auto' }}>
      <div className="panel" style={{ padding: 30 }}>
        <div className="section-kicker">PRIVATE ACCESS</div>
        <h1>Admin sign in</h1>
        <p>Enter your operator credentials to view service health and synchronization reports.</p>
        {params.error && <p role="alert" style={{ color: '#ff8888' }}>Invalid credentials.</p>}
        <form action="/api/admin/login" method="post" style={{ display: 'grid', gap: 16 }}>
          <label>Username<input name="username" autoComplete="username" required maxLength={100} style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }} /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }} /></label>
          <button className="button button-primary" type="submit">Sign in</button>
        </form>
      </div>
    </section>;
  }
  const client = db(true);
  const [{ data: runs }, { data: usage }, { count: fighterCount }, { count: eventCount }] =
    client ? await Promise.all([
      client.from('sync_runs').select('kind,started_at,finished_at,status,requests,error_code').order('started_at', { ascending: false }).limit(15),
      client.from('provider_usage').select('provider,model,status,tokens,created_at').order('created_at', { ascending: false }).limit(20),
      client.from('fighters').select('id', { head: true, count: 'exact' }),
      client.from('events').select('id', { head: true, count: 'exact' }),
    ]) : [{ data: null }, { data: null }, { count: null }, { count: null }];
  const slots = [1, 2, 3].filter(i => !!process.env[`UFCALENDAR_API_KEY_${i}`]);
  return <section className="page" style={{ maxWidth: 1050, margin: '25px auto', padding: '20px 18px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
      <div><div className="section-kicker">PRIVATE OPERATOR VIEW</div><h1>OCTAGON Admin</h1></div>
      <form action="/api/admin/logout" method="post"><button className="button button-secondary">Sign out</button></form>
    </div>
    <div className="status-grid">
      <div className="panel status-card"><strong>Supabase</strong><span>{client ? 'Configured' : 'Not configured'}</span></div>
      <div className="panel status-card"><strong>Groq</strong><span>{(process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_2) ? 'Configured' : 'Missing'}</span></div>
      <div className="panel status-card"><strong>OpenRouter</strong><span>{(process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_2) ? 'Configured' : 'Missing'}</span></div>
      <div className="panel status-card"><strong>UFCalendar</strong><span>{slots.length} credential slots configured</span></div>
      <div className="panel status-card"><strong>Fighters</strong><span>{fighterCount ?? 'Unknown'} records</span></div>
      <div className="panel status-card"><strong>Events</strong><span>{eventCount ?? 'Unknown'} records</span></div>
    </div>
    <AdminProviderSettings />
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <h2>Recent synchronization jobs</h2>
      <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Job</th><th>Status</th><th>Requests</th><th>Finished</th></tr></thead><tbody>
        {(runs || []).map((r, i) => <tr key={i}><td>{r.kind}</td><td>{r.status}{r.error_code ? ` (${r.error_code})` : ''}</td><td>{r.requests}</td><td>{r.finished_at || 'In progress'}</td></tr>)}
      </tbody></table></div>
      {!runs?.length && <p>No synchronization records.</p>}
    </section>
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <h2>Recent AI usage</h2>
      <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Provider</th><th>Model</th><th>Status</th><th>Tokens</th><th>Time (UTC)</th></tr></thead><tbody>
        {(usage || []).map((r, i) => <tr key={i}><td>{r.provider}</td><td>{r.model || '—'}</td><td>{r.status}</td><td>{r.tokens}</td><td>{r.created_at}</td></tr>)}
      </tbody></table></div>
      {!usage?.length && <p>No usage records.</p>}
    </section>
  </section>;
}
