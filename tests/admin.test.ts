import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminSessionValid,
  checkAdminCredentials,
  createAdminSession,
} from '../src/lib/admin-auth';
import { POST as credentials } from '../src/app/api/admin/credentials/route';
import { POST as login } from '../src/app/api/admin/login/route';
const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (state.token ? { value: state.token } : undefined) }),
}));
vi.mock('../src/lib/security', () => ({ clientLimit: vi.fn().mockResolvedValue(true) }));
beforeEach(() => {
  state.token = undefined;
  vi.stubEnv('ADMIN_SESSION_SECRET', 'fixture-session-secret-with-enough-entropy');
  vi.stubEnv('ADMIN_USERNAME', 'fixture-operator');
  vi.stubEnv('ADMIN_PASSWORD', 'fixture-password');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe('existing Admin authentication protections', () => {
  it('accepts valid credentials and rejects invalid or unconfigured credentials', () => {
    expect(checkAdminCredentials('fixture-operator', 'fixture-password')).toBe(true);
    expect(checkAdminCredentials('fixture-operator', 'wrong')).toBe(false);
    vi.stubEnv('ADMIN_SESSION_SECRET', '');
    expect(checkAdminCredentials('fixture-operator', 'fixture-password')).toBe(false);
  });
  it('rejects forged and expired sessions', () => {
    const token = createAdminSession();
    expect(adminSessionValid(token)).toBe(true);
    expect(adminSessionValid(token + 'a')).toBe(false);
    expect(adminSessionValid('123.' + 'a'.repeat(64))).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 9 * 3600000);
    expect(adminSessionValid(token)).toBe(false);
  });
  it('requires a session and same-origin requests for credential diagnostics', async () => {
    const req = () =>
      new Request('https://fixture.test/api/admin/credentials', { method: 'POST', body: '{}' });
    expect((await credentials(req())).status).toBe(401);
    state.token = createAdminSession();
    expect((await credentials(req())).status).toBe(403);
  });
  it('issues HTTP-only strict session cookies only after successful same-origin login', async () => {
    const form = new FormData();
    form.set('username', 'fixture-operator');
    form.set('password', 'fixture-password');
    const req = new Request('https://fixture.test/api/admin/login', {
      method: 'POST',
      headers: { origin: 'https://fixture.test' },
      body: form,
    });
    const response = await login(req);
    expect(response.status).toBe(303);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=strict');
    expect(response.headers.get('location')).toBe('https://fixture.test/admin');
  });
});
