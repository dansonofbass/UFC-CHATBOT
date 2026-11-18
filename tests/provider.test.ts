import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { UFCalendar } from '../src/lib/ufcalendar';
const keys = {
  UFCALENDAR_API_KEY_1: 'test-fixture-one',
  UFCALENDAR_API_KEY_2: 'test-fixture-two',
  UFCALENDAR_API_KEY_3: 'test-fixture-three',
};
const schema = z.object({ data: z.array(z.string()), meta: z.object({}) });
const ok = () => Response.json({ data: ['fixture'], meta: {} });
describe('UFCalendar credential manager — mocked network', () => {
  it('selects the configured slot and masks all credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const p = new UFCalendar(fetcher, keys);
    p.select(2);
    await p.request('/events?org=ufc', schema);
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer test-fixture-two' });
    expect(JSON.stringify(p.status())).not.toContain('test-fixture');
    expect(p.status()[1].health).toBe('healthy');
  });
  it('fails over once on recoverable server failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(ok());
    const p = new UFCalendar(fetcher, keys);
    await p.request('/events', schema);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(p.status()[1].active).toBe(true);
  });
  it('never rotates or retries quota exhaustion', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: { code: 'quota_exceeded' } }, { status: 429 }));
    const p = new UFCalendar(fetcher, keys);
    await expect(p.request('/events', schema)).rejects.toMatchObject({ status: 429 });
    p.select(3);
    await expect(p.request('/events', schema)).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('validates responses before accepting health', async () => {
    const p = new UFCalendar(
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ invented: true })),
      keys,
    );
    await expect(p.request('/events', schema)).rejects.toBeInstanceOf(z.ZodError);
  });
  it('tests exactly one requested key', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: { code: 'unauthorized' } }, { status: 401 }));
    const p = new UFCalendar(fetcher, keys);
    expect((await p.test(2))?.health).toBe('unauthorized');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects unexpected paths and invalid manual slots', async () => {
    const p = new UFCalendar(vi.fn(), keys);
    expect(() => p.select(4)).toThrow();
    await expect(p.request('/odds', schema)).rejects.toThrow('Unsupported');
  });
});
