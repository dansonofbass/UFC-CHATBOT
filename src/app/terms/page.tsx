export const metadata = { title: 'Terms & attribution' };
export default function Terms() {
  return (
    <article className="page prose">
      <h1>Terms & attribution</h1>
      <p>
        This independent research application provides informational content about UFC. It is not an
        official UFC product. UFC, Zuffa, TKO and fighter names remain the property of their
        respective owners.
      </p>
      <h2>Accuracy</h2>
      <p>
        Schedules, records and rankings can change. Source timestamps describe a snapshot, not a
        guarantee of current accuracy. AI explanations can contain errors. Check the linked primary
        records before relying on an answer. No financial, betting, legal or medical advice is
        offered.
      </p>
      <h2>Source rights</h2>
      <p>
        Data access is subject to the provider subscription and its terms. News publishers retain
        copyright; the application stores only permitted metadata and bounded excerpts. External
        links do not grant redistribution rights. No fighter photos are included unless their
        license and attribution can be preserved.
      </p>
      <h2>Use</h2>
      <p>
        Do not abuse APIs, circumvent quotas, attempt to obtain secrets, or upload content you lack
        permission to use. Operators must verify their deployment plan’s permitted uses and
        configure privacy contact details before public release.
      </p>
    </article>
  );
}
