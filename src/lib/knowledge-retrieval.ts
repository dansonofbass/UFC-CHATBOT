import { z } from 'zod';
import { db } from './db';
import { boundedQueryEmbedding } from './embeddings';
import { localKnowledge, knowledgeVersion } from './knowledge';

const rowSchema = z.object({
  content: z.string().max(8000),
  title: z.string(),
  source_url: z.url(),
  updated_at: z.string(),
});
export async function retrieveKnowledge(query: string, signal: AbortSignal, includeLocal = true) {
  const local = (includeLocal ? localKnowledge(query) : []).map((d) => ({
    content: d.body,
    title: d.title,
    source_url: d.source_url,
    updated_at: knowledgeVersion,
  }));
  try {
    const client = db();
    if (!client) return local;
    const vector = await boundedQueryEmbedding(query, signal).catch(() => undefined);
    const lexicalQuery = query
      .replace(
        /\b(what|is|are|the|a|an|how|does|do|explain|please|me|about|in|of|for|and|ufc|mma)\b/gi,
        ' ',
      )
      .trim();
    const { data, error } = await client
      .rpc('search_knowledge', {
        query_text: (lexicalQuery || query).slice(0, 2500),
        query_embedding: vector ? JSON.stringify(vector) : null,
      })
      .abortSignal(signal);
    if (error) return local;
    const rows = (data || []).flatMap((raw: unknown) => {
      const parsed = rowSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    });
    return [...rows, ...local]
      .filter(
        (row, i, all) =>
          all.findIndex((r) => r.source_url === row.source_url && r.content === row.content) === i,
      )
      .slice(0, 6);
  } catch {
    return local;
  }
}
