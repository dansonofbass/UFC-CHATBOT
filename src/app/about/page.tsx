export const metadata = { title: 'About & sources' };
export default function About() {
  return (
    <article className="page prose">
      <div className="section-kicker">INDEPENDENT BY DESIGN</div>
      <h1>Intelligence behind the octagon.</h1>
      <p>
        OCTAGON AI is an independent research interface for UFC fans. It connects imported fighter
        profiles, event cards, rankings and permitted reporting to a source-grounded assistant in
        English and Persian.
      </p>
      <h2>How answers work</h2>
      <p>
        Structured records are retrieved first. PostgreSQL searches permitted knowledge documents
        for supporting context. Simple schedules can be answered directly; Groq synthesizes other
        answers, with an optional free OpenRouter fallback. Missing evidence results in an explicit
        unavailable response.
      </p>
      <h2>Sources and freshness</h2>
      <p>
        Fight data is imported through{' '}
        <a href="https://api.ufcalendar.com/docs">UFCalendar’s documented API</a>. Source links and
        import timestamps accompany records. Rankings retain their original snapshot dates. A cached
        event schedule can change after its last verification. No fabricated roster, results or news
        are seeded.
      </p>
      <p>
        News feeds must be explicitly configured with permission to ingest their metadata. RSS
        availability alone does not establish a redistribution license. Reports are not
        automatically promoted to confirmed announcements. Full articles and unlicensed imagery are
        not copied.
      </p>
      <h2>Independence</h2>
      <p>
        This project is not affiliated with, endorsed by, or licensed by UFC, Zuffa or TKO.
        Trademarks belong to their respective owners. No gambling or betting functionality is
        provided.
      </p>
    </article>
  );
}
