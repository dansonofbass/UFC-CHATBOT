import { createHash, timingSafeEqual } from 'node:crypto';
import { db, checked } from './db';
import { env } from './env';
const localClients = new Map<string, { count: number; expires: number }>();
export const internalBudgetScope = () =>
  process.env.VERCEL_ENV === 'production'
    ? ''
    : `${process.env.VERCEL_ENV === 'preview' ? 'preview' : 'development'}:`;
export function authorized(header: string | null) {
  const expected = env().INTERNAL_API_TOKEN;
  if (!expected || !header) return false;
  const a = Buffer.from(header),
    b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function consume(key: string, amount: number, ceiling: number, expiry: Date) {
  if (amount > ceiling) return false;
  const client = db(true);
  if (!client) throw new Error('Usage controls unavailable');
  return (await checked(
    client.rpc('consume_budget', { bucket: key, amount, ceiling, expiry: expiry.toISOString() }),
  )) as boolean;
}
export async function clientLimit(request: Request) {
  const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0] || 'shared-local';
  const hash = createHash('sha256').update(ip).digest('hex');
  const hour = new Date().toISOString().slice(0, 13);
  return consume(
    `client:${internalBudgetScope()}${hour}:${hash}`,
    1,
    env().CLIENT_HOURLY_LIMIT,
    new Date(Date.now() + 3600000),
  ).catch(() => {
    // Isolated database failure still permits local educational fallbacks.
    // AI and live-provider budgets continue to fail closed independently.
    const key = `${hour}:${hash}`;
    const prior = localClients.get(key);
    if (localClients.size > 10000) {
      for (const [key, value] of localClients)
        if (value.expires < Date.now()) localClients.delete(key);
      if (localClients.size > 10000) return false;
    }
    const count = (prior?.count || 0) + 1;
    localClients.set(key, { count, expires: Date.now() + 3600000 });
    return count <= env().CLIENT_HOURLY_LIMIT;
  });
}
export async function reserveAI(inputBytes = 7000, attempts = 2) {
  const day = new Date().toISOString().slice(0, 10),
    expiry = new Date(`${day}T23:59:59.999Z`),
    e = env();
  if (
    !(await consume(
      `ai:requests:${internalBudgetScope()}${day}`,
      attempts,
      e.AI_DAILY_REQUEST_LIMIT,
      expiry,
    ))
  )
    return false;
  return consume(
    `ai:tokens:${internalBudgetScope()}${day}`,
    (inputBytes + env().AI_MAX_OUTPUT_TOKENS * 4) * attempts,
    e.AI_DAILY_TOKEN_LIMIT,
    expiry,
  );
}
