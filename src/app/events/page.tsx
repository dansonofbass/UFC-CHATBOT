import Link from 'next/link';
import { events } from '@/lib/data';
import { EventCard, Empty } from '@/components/data-ui';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Events' };
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view = 'upcoming' } = await searchParams,
    result = await events(),
    items = result.items
      .filter((e) =>
        view === 'past'
          ? ['completed', 'cancelled', 'postponed'].includes(e.status)
          : ['announced', 'scheduled', 'live'].includes(e.status),
      )
      .sort((a, b) =>
        view === 'past'
          ? b.starts_at.localeCompare(a.starts_at)
          : a.starts_at.localeCompare(b.starts_at),
      );
  return (
    <div className="page">
      <div className="page-intro">
        <div className="section-kicker">THE CALENDAR</div>
        <h1>Every card. Every chapter.</h1>
        <p>
          Verified schedules, fight cards and results. Dates are displayed in UTC; event pages also
          show venue time.
        </p>
      </div>
      <div className="filter-row">
        <Link
          className={`button button-${view === 'upcoming' ? 'primary' : 'secondary'}`}
          href="/events"
        >
          Upcoming
        </Link>
        <Link
          className={`button button-${view === 'past' ? 'primary' : 'secondary'}`}
          href="/events?view=past"
        >
          Past & changed
        </Link>
      </div>
      {items.length ? (
        <div className="grid three">
          {items.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <Empty kind={`${view} events`} state={result.state} />
      )}
    </div>
  );
}
