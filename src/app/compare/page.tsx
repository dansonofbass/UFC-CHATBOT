import { fighters } from '@/lib/data';
import { Compare } from '@/components/compare';
import { Empty } from '@/components/data-ui';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Compare' };
export default async function ComparePage() {
  const result = await fighters();
  return (
    <div className="page">
      <div className="page-intro">
        <div className="section-kicker">HEAD TO HEAD</div>
        <h1>The details make the difference.</h1>
        <p>Compare verified records and available measurements. Missing statistics stay missing.</p>
      </div>
      {result.items.length >= 2 ? (
        <Compare fighters={result.items} />
      ) : (
        <Empty kind="fighters to compare" state={result.state} />
      )}
    </div>
  );
}
