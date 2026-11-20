import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  defaultProviderSettings,
  saveProviderSettings,
  loadProviderSettings,
  resolveAI,
  settingsView,
  selectedDataProvider,
} from '../src/lib/provider-settings';
import { testAIConnection, dataProviders } from '../src/lib/provider-connection-test';
import { GET, POST } from '../src/app/api/admin/provider-settings/route';
const state = vi.hoisted(() => ({ row: null as unknown, admin: true, writes: vi.fn() }));
vi.mock('../src/lib/admin-auth', () => ({ isAdmin: async () => state.admin }));
vi.mock('../src/lib/security', () => ({
  clientLimit: async () => true,
  reserveAI: async () => true,
  consume: async () => true,
}));
vi.mock('../src/lib/db', () => ({
  db: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.row ? { response: state.row } : null,
            error: null,
          }),
        }),
      }),
      upsert: async (row: { response: unknown }) => {
        state.row = row.response;
        state.writes(row);
        return { error: null };
      },
    }),
  }),
}));
beforeEach(() => {
  state.row = null;
  state.admin = true;
  state.writes.mockClear();
  vi.stubEnv('GROQ_API_KEY', 'secret-primary-g');
  vi.stubEnv('GROQ_API_KEY_2', 'secret-secondary-g');
  vi.stubEnv('OPENROUTER_API_KEY', 'secret-primary-o');
  vi.stubEnv('OPENROUTER_API_KEY_2', 'secret-secondary-o');
  vi.stubEnv('GROQ_MODEL', 'fixture/groq');
  vi.stubEnv('GROQ_MODELS', 'fixture/groq,fixture/groq-2');
  vi.stubEnv('OPENROUTER_MODEL', 'openrouter/free');
  vi.stubEnv('OPENROUTER_MODELS', 'fixture/free:free');
  vi.stubEnv('ALLOW_OPENROUTER_FALLBACK', 'true');
  vi.stubEnv('UFCALENDAR_API_KEY_1', 'secret-data-1');
  vi.stubEnv('UFCALENDAR_API_KEY_2', 'secret-data-2');
  vi.stubEnv('UFCALENDAR_ACTIVE_KEY', '1');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('preserves primary-key defaults and existing Groq → free OpenRouter fallback', () => {
  const resolved = resolveAI(defaultProviderSettings());
  expect(resolved.map((p) => [p.name, p.slot])).toEqual([
    ['groq', 1],
    ['openrouter', 1],
  ]);
});
it('marks the only configured UFCalendar credential active by default', () => {
  vi.stubEnv('UFCALENDAR_API_KEY_1', '');
  vi.stubEnv('UFCALENDAR_API_KEY_3', '');
  expect(defaultProviderSettings().data.slot).toBe(2);
});
it.each(['groq', 'openrouter'] as const)(
  'persists %s secondary slot and configured model across reads',
  async (name) => {
    const settings = defaultProviderSettings();
    settings.activeAI = name;
    settings[name].slot = 2;
    settings[name].model = name === 'groq' ? 'fixture/groq-2' : 'fixture/free:free';
    await saveProviderSettings(settings);
    const read = await loadProviderSettings();
    const active = resolveAI(read)[0];
    expect(active).toMatchObject({ name, slot: 2, model: settings[name].model });
    expect(active.key).toBe(name === 'groq' ? 'secret-secondary-g' : 'secret-secondary-o');
    expect(JSON.stringify(state.row)).not.toContain('secret-');
  },
);
it('switches OpenRouter back to Groq without rotating keys or adding reverse fallback', async () => {
  const settings = defaultProviderSettings();
  settings.activeAI = 'openrouter';
  await saveProviderSettings(settings);
  expect(resolveAI(await loadProviderSettings())).toHaveLength(1);
  settings.activeAI = 'groq';
  await saveProviderSettings(settings);
  expect(resolveAI(await loadProviderSettings())[0].name).toBe('groq');
});
it('rejects missing selected keys and arbitrary models or extra secret fields', async () => {
  const settings = defaultProviderSettings();
  settings.groq.slot = 2;
  vi.stubEnv('GROQ_API_KEY_2', '');
  await expect(saveProviderSettings(settings)).rejects.toThrow('not configured');
  settings.groq.slot = 1;
  settings.groq.model = 'injected/model';
  await expect(saveProviderSettings(settings)).rejects.toThrow('model');
  await expect(
    saveProviderSettings({ ...defaultProviderSettings(), apiKey: 'not-allowed' }),
  ).rejects.toThrow();
});
it('returns slot presence and models without secrets', () => {
  const view = JSON.stringify(settingsView(defaultProviderSettings()));
  expect(view).toContain('configured');
  expect(view).not.toContain('secret-');
});
it('uses only the selected UFCalendar slot in runtime requests', async () => {
  const settings = defaultProviderSettings();
  settings.data.slot = 2;
  await saveProviderSettings(settings);
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: {}, meta: {} }));
  const provider = await selectedDataProvider(undefined, fetcher);
  const { z } = await import('zod');
  await provider.request('/usage', z.unknown());
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-data-2');
});
const post = (body: unknown, origin = 'https://test.local') =>
  POST(
    new Request('https://test.local/api/admin/provider-settings', {
      method: 'POST',
      headers: { origin },
      body: JSON.stringify(body),
    }),
  );
it('protects reads, writes, tests and cross-origin mutations', async () => {
  state.admin = false;
  expect((await GET()).status).toBe(401);
  expect((await post({ action: 'save', settings: defaultProviderSettings() })).status).toBe(401);
  state.admin = true;
  expect(
    (await post({ action: 'save', settings: defaultProviderSettings() }, 'https://bad.local'))
      .status,
  ).toBe(403);
  expect(state.writes).not.toHaveBeenCalled();
});
it('saves through the authorized API and redacts the response', async () => {
  const response = await post({ action: 'save', settings: defaultProviderSettings() });
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain('secret-');
  expect(state.writes).toHaveBeenCalledOnce();
});
it.each([
  [401, 'invalid_credentials'],
  [429, 'rate_limited'],
  [404, 'model_unavailable'],
  [503, 'unavailable'],
] as const)('sanitizes connection HTTP %s without retries', async (status, code) => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ error: 'secret-auth-value' }, { status }));
  const result = await testAIConnection('groq', 2, 'fixture/groq', fetcher);
  expect(result.code).toBe(code);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(JSON.stringify(result)).not.toContain('secret-auth');
});
it('tests the selected key/model with a bounded request and no secret echo', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ choices: [{ message: { content: 'OK' } }] }));
  const result = await testAIConnection('openrouter', 2, 'openrouter/free', fetcher);
  expect(result.ok).toBe(true);
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-secondary-o');
  expect(JSON.parse(fetcher.mock.calls[0][1].body).max_tokens).toBe(8);
  expect(JSON.stringify(result)).not.toContain('secret');
});
it('reports UFC data configuration without probing the provider on read', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect((await GET()).status).toBe(200);
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv('UFCALENDAR_API_KEY_2', '');
  expect((await dataProviders.ufcalendar.test(2)).code).toBe('not_configured');
});
it('tests one selected UFCalendar credential with a single authorized request', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { tier: 'fixture' }, meta: {} }));
  vi.stubGlobal('fetch', fetcher);
  const result = await dataProviders.ufcalendar.test(2);
  expect(result.ok).toBe(true);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-data-2');
  expect(JSON.stringify(result)).not.toContain('secret-data');
});
it('reports UFCalendar rate limiting and records its cooldown without key rotation', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { error: { code: 'rate_limited' } },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  const result = await dataProviders.ufcalendar.test(1);
  expect(result.code).toBe('rate_limited');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(state.writes).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'ufcalendar:rate-block' }),
  );
});
