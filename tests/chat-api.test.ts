import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { POST } from '../src/app/api/chat/route';
import { POST as diagnostics } from '../src/app/api/internal/credentials/route';
import { intelligentRetrieve, directory } from '../src/lib/intelligent-retrieval';
import { clientLimit, reserveAI } from '../src/lib/security';
import { answer } from '../src/lib/ai';
vi.mock('../src/lib/data', () => ({ fighters: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('../src/lib/intelligent-retrieval', () => ({
  directory: vi.fn().mockResolvedValue([]),
  intelligentRetrieve: vi.fn(),
}));
vi.mock('../src/lib/cache', () => ({
  cachedEvidence: (_q: string, _h: string, load: () => unknown) => load(),
}));
vi.mock('../src/lib/security', async (original) => ({
  ...(await original<typeof import('../src/lib/security')>()),
  clientLimit: vi.fn(),
  reserveAI: vi.fn(),
}));
vi.mock('../src/lib/ai', () => ({
  answer: vi.fn(),
  providers: () => [{ name: 'groq' }],
  resolvedProviders: async () => [{ name: 'groq' }],
}));
const request = (body: unknown) =>
  new Request('https://fixture.test/api/chat', { method: 'POST', body: JSON.stringify(body) });
const conversation = {
  messages: [{ role: 'user', content: 'What happened at the latest UFC event?' }],
};
beforeEach(() => {
  vi.stubEnv('CHAT_INTELLIGENCE_ENABLED', 'true');
  vi.stubEnv('CHAT_MODEL_UNDERSTANDING_ENABLED', 'false');
  vi.mocked(clientLimit).mockResolvedValue(true);
  vi.mocked(reserveAI).mockResolvedValue(true);
  vi.mocked(intelligentRetrieve).mockResolvedValue({
    text: 'Verified synthetic event',
    citations: [
      { title: 'Fixture', url: 'https://www.ufc.com/', updated_at: new Date().toISOString() },
    ],
  });
  vi.mocked(answer).mockImplementation(async function* () {
    yield 'Fixture ';
    yield 'answer';
  });
  vi.mocked(directory).mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('chat HTTP boundary and NDJSON streaming', () => {
  it('accepts longer assistant history while retaining the user-message bound', async () => {
    const response = await POST(
      request({
        messages: [{ role: 'assistant', content: 'A'.repeat(5000) }, ...conversation.messages],
      }),
    );
    expect(response.status).toBe(200);
    await response.text();
    expect(
      (await POST(request({ messages: [{ role: 'user', content: 'A'.repeat(2501) }] }))).status,
    ).toBe(400);
  });
  it('preserves sources, text deltas and done ordering', async () => {
    const response = await POST(request(conversation));
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    const frames = (await response.text())
      .trim()
      .split('\n')
      .map((s) => JSON.parse(s));
    expect(frames.map((f) => f.type)).toEqual(['sources', 'text', 'done']);
    expect(
      frames
        .filter((f) => f.type === 'text')
        .map((f) => f.text)
        .join(''),
    ).toBe('Fixture answer');
  });
  it('streams clarification without paying for generation', async () => {
    vi.mocked(intelligentRetrieve).mockResolvedValue({
      text: '',
      citations: [],
      deterministic: 'Which fighter?',
    });
    expect(await (await POST(request(conversation))).text()).toContain('Which fighter?');
    expect(reserveAI).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });
  it('sanitizes model failure in compatible error frames', async () => {
    vi.mocked(answer).mockImplementation(async function* () {
      throw new Error('private-provider-secret');
    });
    const body = await (await POST(request(conversation))).text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('private-provider-secret');
  });
  it('enforces client and model quotas before provider generation', async () => {
    vi.mocked(clientLimit).mockResolvedValueOnce(false);
    expect((await POST(request(conversation))).status).toBe(429);
    expect(intelligentRetrieve).not.toHaveBeenCalled();
    vi.mocked(reserveAI).mockResolvedValue(false);
    expect((await POST(request(conversation))).status).toBe(429);
    expect(answer).not.toHaveBeenCalled();
  });
  it('rejects malformed conversations and cross-origin requests', async () => {
    expect((await POST(request({ messages: [{ role: 'assistant', content: 'x' }] }))).status).toBe(
      400,
    );
    const r = request(conversation);
    r.headers.set('origin', 'https://evil.test');
    expect((await POST(r)).status).toBe(403);
  });
  it('rejects diagnostics without authorization before parsing or provider calls', async () => {
    vi.stubEnv('INTERNAL_API_TOKEN', 'x'.repeat(40));
    expect((await diagnostics(request({ slot: 1 }))).status).toBe(401);
  });
});
