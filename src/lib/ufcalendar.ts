import { z } from 'zod';
export type Health = 'unknown' | 'healthy' | 'unavailable' | 'unauthorized' | 'quota';
export class ProviderError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfterSeconds?: number,
  ) {
    super(`UFCalendar ${code} (${status})`);
  }
}
type Credential = {
  slot: number;
  key: string;
  health: Health;
  lastStatus?: number;
  requests: number;
};
export class UFCalendar {
  private credentials: Credential[];
  private active: number;
  private exhausted = false;
  constructor(
    private fetcher: typeof fetch = fetch,
    environment: Record<string, string | undefined> = process.env,
    private beforeRequest?: () => Promise<void>,
  ) {
    this.credentials = [1, 2, 3].flatMap((slot) =>
      environment[`UFCALENDAR_API_KEY_${slot}`]
        ? [
            {
              slot,
              key: environment[`UFCALENDAR_API_KEY_${slot}`]!,
              health: 'unknown' as Health,
              requests: 0,
            },
          ]
        : [],
    );
    this.active = Number(environment.UFCALENDAR_ACTIVE_KEY || 1);
  }
  status() {
    return this.credentials.map(({ slot, health, lastStatus, requests }) => ({
      slot,
      identifier: `credential-${slot}-****`,
      health,
      lastStatus,
      requests,
      active: slot === this.active,
    }));
  }
  select(slot: number) {
    if (!this.credentials.some((c) => c.slot === slot))
      throw new Error('Credential not configured');
    this.active = slot;
  }
  async request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    if (!/^\/(events|fighters|fights|rankings\/ufc|search|usage)(\/|\?|$)/.test(path))
      throw new Error('Unsupported provider path');
    if (this.exhausted) throw new ProviderError(429, 'quota_exceeded');
    const preferred = this.credentials.find((c) => c.slot === this.active);
    const ordered = [preferred, ...this.credentials.filter((c) => c !== preferred)].filter(
      (c): c is Credential => !!c,
    );
    for (const c of ordered) {
      if (['quota', 'unauthorized', 'unavailable'].includes(c.health)) continue;
      await this.beforeRequest?.();
      try {
        c.requests++;
        const options = {
          headers: { Authorization: `Bearer ${c.key}` },
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
            : AbortSignal.timeout(12000),
          cache: 'no-store' as const,
        };
        let r = await this.fetcher(`https://api.ufcalendar.com/v1${path}`, options);
        if (r.status >= 500 && ordered.length === 1) {
          // One bounded retry, charged to the same account budget, after backoff.
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(options.signal.reason);
            };
            const timer = setTimeout(
              () => {
                options.signal.removeEventListener('abort', abort);
                resolve();
              },
              250 + Math.floor(Math.random() * 250),
            );
            options.signal.addEventListener('abort', abort, { once: true });
          });
          options.signal.throwIfAborted();
          await this.beforeRequest?.();
          c.requests++;
          r = await this.fetcher(`https://api.ufcalendar.com/v1${path}`, options);
        }
        c.lastStatus = r.status;
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const code = z.object({ error: z.object({ code: z.string() }) }).safeParse(body);
          const name = code.success ? code.data.error.code : 'request_failed';
          if (name === 'quota_exceeded') {
            c.health = 'quota';
            this.exhausted = true;
            throw new ProviderError(r.status, name);
          }
          if (r.status === 429) {
            const retry = r.headers.get('retry-after');
            const seconds =
              retry && /^\d+$/.test(retry)
                ? Number(retry)
                : retry
                  ? Math.max(1, Math.ceil((Date.parse(retry) - Date.now()) / 1000))
                  : 60;
            throw new ProviderError(429, 'rate_limited', Number.isFinite(seconds) ? seconds : 60);
          }
          if (r.status === 401) {
            c.health = 'unauthorized';
            continue;
          }
          if (r.status >= 500) {
            c.health = 'unavailable';
            continue;
          }
          throw new ProviderError(r.status, name);
        }
        const value = schema.parse(await r.json());
        c.health = 'healthy';
        this.active = c.slot;
        return value;
      } catch (error) {
        if (error instanceof ProviderError || error instanceof z.ZodError || signal?.aborted)
          throw error;
        c.health = 'unavailable';
      }
    }
    throw new ProviderError(503, 'no_healthy_credential');
  }
  async test(slot: number) {
    if (this.exhausted) throw new ProviderError(429, 'quota_exceeded');
    this.select(slot);
    const c = this.credentials.find((c) => c.slot === slot)!;
    const isolated = new UFCalendar(this.fetcher, { UFCALENDAR_API_KEY_1: c.key });
    try {
      await isolated.request('/usage', z.object({ data: z.unknown(), meta: z.unknown() }));
      c.health = 'healthy';
      c.lastStatus = 200;
    } catch (e) {
      const s = isolated.status()[0];
      c.health = s.health;
      c.lastStatus = s.lastStatus;
      if (e instanceof ProviderError && e.status === 429) this.exhausted = true;
    }
    return this.status().find((c) => c.slot === slot);
  }
}
