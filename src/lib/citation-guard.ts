// Buffer one line so a model cannot leak a partial invented URL across deltas.
export async function* groundedCitations(
  parts: AsyncIterable<string>,
  sources: string[],
  evidence?: string,
) {
  const allowed = new Set(sources);
  const metricConventions = [15, 100];
  const numbers = evidence
    ? new Set((evidence.match(/\d+(?:\.\d+)?/g) || []).map((n) => Number(n)))
    : undefined;
  for (const number of metricConventions) numbers?.add(number);
  const clean = (line: string) =>
    line
      .replace(/【[^】]*】/g, '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) =>
        allowed.has(url) ? `[${label}](${url})` : label,
      )
      .replace(/https?:\/\/[^\s)\]>]+/g, (url) => (allowed.has(url) ? url : ''));
  const validate = (line: string) => {
    const cleaned = clean(line);
    if (
      evidence &&
      /\b(?:is|has|was)\s+(?:an?\s+)?(?:retired|active)\b|\b(?:currently\s+)?competes\s+(?:at|in)\b/i.test(
        cleaned,
      ) &&
      !/"(?:career_status|current_status|retired|active_division)"\s*:/.test(evidence)
    )
      return '';
    const prose = cleaned.replace(/https?:\/\/[^\s)\]>]+/g, '').replace(/^\s*\d+[.)]\s/, '');
    // Never stream a new exact figure merely because the model supplied it.
    // This is a numeric consistency gate, not a proof of semantic correctness.
    if (numbers && (prose.match(/\d+(?:\.\d+)?/g) || []).some((n) => !numbers.has(Number(n))))
      return '';
    return cleaned;
  };
  let buffer = '';
  for await (const part of parts) {
    buffer += part;
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      yield validate(buffer.slice(0, end + 1));
      buffer = buffer.slice(end + 1);
    }
  }
  if (buffer) yield validate(buffer);
}
