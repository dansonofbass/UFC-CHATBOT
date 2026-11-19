import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { queryPlan } from '../src/lib/model-understanding';
import { reserveAI } from '../src/lib/security';
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  generateText: vi.fn(),
}));
vi.mock('../src/lib/security', () => ({ reserveAI: vi.fn() }));
vi.mock('../src/lib/db', () => ({ db: () => null }));
beforeEach(() => {
  vi.stubEnv('CHAT_MODEL_UNDERSTANDING_ENABLED', 'true');
  vi.stubEnv('GROQ_API_KEY', 'fixture');
  vi.mocked(reserveAI).mockResolvedValue(true);
  vi.mocked(generateText).mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe('bounded Groq query planning', () => {
  it('validates a structured plan and reserves shared tokens before inference', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { intents: ['fighter_history'], subject: 'Bones', ambiguous: false },
      usage: { totalTokens: 12 },
    } as never);
    const p = await queryPlan("What is Bones' MMA record?", [], [], new AbortController().signal);
    expect(p.intent).toBe('fighter_history');
    expect(p.subject).toBe('Bones');
    expect(reserveAI).toHaveBeenCalledWith(expect.any(Number), 1);
    expect(vi.mocked(generateText).mock.calls[0][0]).toMatchObject({
      maxRetries: 0,
      maxOutputTokens: 800,
    });
  });
  it('preserves deterministic routing when the model fails or emits invalid fields', async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error('private provider failure'));
    expect((await queryPlan('latest UFC event', [], [], new AbortController().signal)).intent).toBe(
      'completed_event',
    );
    vi.mocked(generateText).mockResolvedValue({
      output: { intents: ['arbitrary_tool'], subject: null, ambiguous: false },
      usage: {},
    } as never);
    expect((await queryPlan('latest UFC event', [], [], new AbortController().signal)).intent).toBe(
      'completed_event',
    );
  });
  it('does not call the model when the budget is unavailable', async () => {
    vi.mocked(reserveAI).mockResolvedValue(false);
    await queryPlan('latest UFC event', [], [], new AbortController().signal);
    expect(generateText).not.toHaveBeenCalled();
  });
});
