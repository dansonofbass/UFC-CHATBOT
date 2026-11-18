export const metadata = { title: 'Privacy' };
export default function Privacy() {
  return (
    <article className="page prose">
      <h1>Privacy</h1>
      <p>
        Conversation history is stored locally in your browser, limited to 20 conversations. Clear
        it using “Clear local history” in chat; on mobile, clear this site’s browser storage. People
        with access to your browser may read local history.
      </p>
      <h2>Request processing</h2>
      <p>
        Questions and a bounded recent conversation are sent to this application’s server. When
        synthesis is required, relevant verified records and conversation text are sent to Groq, or
        to OpenRouter if fallback is enabled. Those providers apply their own retention and privacy
        policies. Avoid sending personal or sensitive information.
      </p>
      <h2>Stored operational data</h2>
      <p>
        The database stores provider usage totals, model identifiers, sync statuses, and cached
        public data. The application does not persist chat transcripts on the server. Rate limits
        store a hashed client network identifier in an expiring usage bucket; infrastructure
        providers may independently log requests. No analytics or advertising cookies are installed
        by the application.
      </p>
      <h2>Retention and deployment responsibility</h2>
      <p>
        Usage buckets expire logically and may be removed by maintenance. Deployment operators must
        define operational log retention and publish their contact information before public launch.
        Local conversation deletion does not delete provider or hosting logs.
      </p>
    </article>
  );
}
