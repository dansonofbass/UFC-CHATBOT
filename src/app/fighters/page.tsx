import { fighters } from '@/lib/data';
import { FighterCard, Empty } from '@/components/data-ui';
import { Button } from '@/components/ui/button';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fighters' };
export default async function FightersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; weight?: string }>;
}) {
  const { q = '', weight = '' } = await searchParams;
  const result = await fighters(q);
  const items = result.items.filter(
    (f) => !weight || (f.weight_lbs != null && f.weight_lbs <= Number(weight)),
  );
  return (
    <div className="page">
      <div className="page-intro">
        <div className="section-kicker">THE ATHLETES</div>
        <h1>
          Find the fighter.
          <br />
          Follow the story.
        </h1>
        <p>
          Search imported names, nicknames and aliases. Every profile starts with a verified source.
        </p>
      </div>
      <form className="search-form">
        <input
          name="q"
          className="field"
          defaultValue={q}
          placeholder="Search fighters…"
          aria-label="Search fighter name or nickname"
          maxLength={80}
        />
        <Button type="submit">Search</Button>
      </form>
      <form className="search-form">
        <input type="hidden" name="q" value={q} />
        <select className="field" name="weight" defaultValue={weight} aria-label="Maximum weight">
          <option value="">All weights</option>
          <option value="125">Up to 125 lbs</option>
          <option value="145">Up to 145 lbs</option>
          <option value="155">Up to 155 lbs</option>
          <option value="185">Up to 185 lbs</option>
          <option value="265">Up to 265 lbs</option>
        </select>
        <Button variant="secondary">Filter</Button>
      </form>
      {items.length ? (
        <div className="grid three">
          {items.map((f) => (
            <FighterCard key={f.id} fighter={f} />
          ))}
        </div>
      ) : (
        <Empty kind={q ? 'matching fighters' : 'fighter profiles'} state={result.state} />
      )}
      <p className="source">
        Directory shows up to 100 imported profiles per search. Missing data is never inferred.
      </p>
    </div>
  );
}
