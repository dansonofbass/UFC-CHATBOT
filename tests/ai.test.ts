import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APICallError, streamText } from 'ai';
import { answer } from '../src/lib/ai';
const insert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock('../src/lib/db', () => ({ db: () => ({ from: () => ({ insert }) }) }));
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  streamText: vi.fn(),
}));
function output(parts: unknown[]) {
  return {
    fullStream: (async function* () {
      for (const p of parts) yield p;
    })(),
    totalUsage: Promise.resolve({ totalTokens: 25 }),
  } as unknown as ReturnType<typeof streamText>;
}
const unavailable = () =>
  new APICallError({
    message: 'fixture unavailable',
    url: 'https://example.invalid',
    requestBodyValues: {},
    statusCode: 503,
  });
async function collect(signal = new AbortController().signal) {
  let text = '';
  for await (const chunk of answer(
    [{ role: 'user', content: 'UFC fixture question' }],
    'Sourced fixture facts',
    signal,
  ))
    text += chunk;
  return text;
}
beforeEach(() => {
  vi.stubEnv('GROQ_API_KEY', 'mock-groq');
  vi.stubEnv('OPENROUTER_API_KEY', 'mock-openrouter');
  vi.stubEnv('ALLOW_OPENROUTER_FALLBACK', 'true');
  vi.stubEnv('OPENROUTER_MODEL', 'openrouter/free');
  vi.mocked(streamText).mockReset();
  insert.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
describe('AI abstraction — mocked SDK, not live APIs', () => {
  it('rejects reasoning-only completions with no visible answer', async () => {
    vi.mocked(streamText).mockReturnValue(output([]));
    await expect(collect()).rejects.toThrow('temporarily unavailable');
  });
  it('uses Groq first, bounds tokens, disables retries and logs usage', async () => {
    vi.mocked(streamText).mockReturnValue(
      output([{ type: 'text-delta', text: 'Verified answer' }]),
    );
    expect(await collect()).toBe('Verified answer');
    const call = vi.mocked(streamText).mock.calls[0][0];
    expect(call.model).toMatchObject({ modelId: 'openai/gpt-oss-120b' });
    expect(call.maxRetries).toBe(0);
    expect(call.maxOutputTokens).toBe(450);
    expect(call.system).toContain('untrusted quoted data');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'groq', tokens: 25, status: 'success' }),
    );
  });
  it('falls back to free OpenRouter before any text on a recoverable failure', async () => {
    vi.mocked(streamText)
      .mockReturnValueOnce(output([{ type: 'error', error: unavailable() }]))
      .mockReturnValueOnce(output([{ type: 'text-delta', text: 'Fallback' }]));
    expect(await collect()).toBe('Fallback');
    expect(streamText).toHaveBeenCalledTimes(2);
    expect(vi.mocked(streamText).mock.calls[1][0].model).toMatchObject({
      modelId: 'openrouter/free',
    });
  });
  it('does not fall back after partial text', async () => {
    vi.mocked(streamText).mockReturnValue(
      output([
        { type: 'text-delta', text: 'Partial' },
        { type: 'error', error: unavailable() },
      ]),
    );
    await expect(collect()).rejects.toThrow('temporarily unavailable');
    expect(streamText).toHaveBeenCalledTimes(1);
  });
  it('does not fall back on auth failures', async () => {
    vi.mocked(streamText).mockReturnValue(
      output([
        {
          type: 'error',
          error: new APICallError({
            message: 'fixture auth',
            url: 'https://example.invalid',
            requestBodyValues: {},
            statusCode: 401,
          }),
        },
      ]),
    );
    await expect(collect()).rejects.toThrow();
    expect(streamText).toHaveBeenCalledTimes(1);
  });
  it('respects cancellation and disables fallback by default', async () => {
    vi.stubEnv('ALLOW_OPENROUTER_FALLBACK', 'false');
    const controller = new AbortController();
    controller.abort();
    vi.mocked(streamText).mockReturnValue(output([{ type: 'error', error: unavailable() }]));
    await expect(collect(controller.signal)).rejects.toThrow('cancelled');
    expect(streamText).toHaveBeenCalledTimes(1);
  });
});
