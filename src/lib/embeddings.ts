async function createExtractor() {
  const { pipeline } = await import('@huggingface/transformers');
  return pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
    dtype: 'q8',
    cache_dir: process.env.EMBEDDING_CACHE_DIR || '/tmp/octagon-models',
  });
}
let loaded: ReturnType<typeof createExtractor> | undefined;
export async function queryEmbedding(text: string): Promise<number[] | undefined> {
  if (process.env.ENABLE_EMBEDDINGS !== 'true') return undefined;
  const extractor = await (loaded ||= createExtractor().catch((error) => {
    loaded = undefined;
    throw error;
  }));
  const output = await extractor(text.slice(0, 500), { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data) as number[];
  if (vector.length !== 384) throw new Error('Embedding dimensions mismatch');
  return vector;
}

export async function boundedQueryEmbedding(text: string, signal: AbortSignal) {
  signal.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      queryEmbedding(text),
      new Promise<undefined>((resolve, reject) => {
        timer = setTimeout(() => resolve(undefined), 3000);
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
  }
}
