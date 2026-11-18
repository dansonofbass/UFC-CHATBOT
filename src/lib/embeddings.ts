export async function queryEmbedding(text: string): Promise<number[] | undefined> {
  if (process.env.ENABLE_EMBEDDINGS !== 'true') return undefined;
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await pipeline(
    'feature-extraction',
    'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    { dtype: 'q8', cache_dir: process.env.EMBEDDING_CACHE_DIR || '/tmp/octagon-models' },
  );
  const output = await extractor(text.slice(0, 500), { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data) as number[];
  if (vector.length !== 384) throw new Error('Embedding dimensions mismatch');
  return vector;
}
