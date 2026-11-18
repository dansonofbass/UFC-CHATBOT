import { news } from '@/lib/data';
import { NewsCard, Empty } from '@/components/data-ui';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'News' };
export default async function NewsPage() {
  const result = await news();
  return (
    <div className="page">
      <div className="page-intro">
        <div className="section-kicker">THE DEVELOPING STORY</div>
        <h1>Stay in the know.</h1>
        <p>
          Source-linked UFC reporting. Publication dates stay visible. Reports and rumors are not
          treated as confirmed announcements.
        </p>
      </div>
      {result.items.length ? (
        <>
          <p className="source">Latest imported publication: {result.items[0].published_at}</p>
          <div className="grid three">
            {result.items.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
        </>
      ) : (
        <Empty kind="news articles" state={result.state} />
      )}
    </div>
  );
}
