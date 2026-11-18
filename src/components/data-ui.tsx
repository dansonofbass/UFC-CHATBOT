import Link from 'next/link';
import { Database, ExternalLink, UserRound, CalendarDays } from 'lucide-react';
import { safeUrl, type Fighter, type Event, type News } from '@/lib/schemas';
export function Empty({ kind, state = 'ready' }: { kind: string; state?: string }) {
  return (
    <div className="empty">
      <Database size={28} />
      <h3>No verified {kind} available yet</h3>
      <p>
        {state === 'error'
          ? 'The data source is temporarily unavailable.'
          : state === 'unconfigured'
            ? 'The database connection has not been configured.'
            : 'The first verified import has not populated this section.'}{' '}
        Statistics and schedules appear only after a successful source sync.
      </p>
      <Link href="/status">View data status</Link>
    </div>
  );
}
export function Source({
  url,
  date,
  label = 'Source',
}: {
  url: string;
  date: string;
  label?: string;
}) {
  const safe = safeUrl(url);
  return (
    <div className="source">
      {safe && (
        <a href={safe} target="_blank" rel="noopener noreferrer">
          {label}
          <ExternalLink size={12} />
        </a>
      )}
      <span>Verified {new Date(date).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</span>
    </div>
  );
}
export function FighterCard({ fighter: f }: { fighter: Fighter }) {
  return (
    <Link className="fighter-card panel" href={`/fighters/${f.slug}`}>
      <div className="fighter-avatar">
        <UserRound size={54} strokeWidth={1} />
        <span>{f.nationality || 'Nationality unavailable'}</span>
      </div>
      <div className="card-body">
        <small>{f.nickname || 'Fighter profile'}</small>
        <h3>{f.name}</h3>
        <p>{f.records?.ufc ? `UFC ${f.records.ufc.value}` : 'UFC record unavailable'}</p>
      </div>
    </Link>
  );
}
export function EventCard({ event: e }: { event: Event }) {
  return (
    <Link href={`/events/${e.slug}`} className="panel event-card">
      <CalendarDays />
      <span className="tag">{e.status}</span>
      <h3>{e.title}</h3>
      <p>
        {new Date(e.starts_at).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'UTC',
        })}{' '}
        UTC
      </p>
      <small>{e.venue?.name || 'Venue unavailable'}</small>
    </Link>
  );
}
export function NewsCard({ item: n }: { item: News }) {
  const url = safeUrl(n.url);
  return (
    <article className="panel news-card">
      <div className="eyebrow">
        {n.source} · {n.confirmation}
      </div>
      <h3>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {n.title}
          </a>
        ) : (
          n.title
        )}
      </h3>
      <p>{n.excerpt}</p>
      <time dateTime={n.published_at}>
        {new Date(n.published_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}
      </time>
    </article>
  );
}
