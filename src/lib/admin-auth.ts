import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'octagon_admin_session';
const LIFETIME = 8 * 60 * 60 * 1000;
function secret() {
  return process.env.ADMIN_SESSION_SECRET || '';
}
function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}
function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function checkAdminCredentials(username: string, password: string) {
  if (!secret() || !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) return false;
  return safeEqual(username, process.env.ADMIN_USERNAME) &&
    safeEqual(password, process.env.ADMIN_PASSWORD);
}
export function createAdminSession() {
  if (!secret()) throw new Error('Admin authentication not configured');
  const payload = String(Date.now() + LIFETIME);
  return `${payload}.${sign(payload)}`;
}
export function adminSessionValid(token?: string) {
  if (!secret() || !token || !/^\d+\.[a-f0-9]{64}$/.test(token)) return false;
  const [expiry, signature] = token.split('.');
  const expiration = Number(expiry);
  return Number.isSafeInteger(expiration) && expiration > Date.now() &&
    expiration <= Date.now() + LIFETIME && safeEqual(signature, sign(expiry));
}
export async function isAdmin() {
  const store = await cookies();
  return adminSessionValid(store.get(COOKIE)?.value);
}
export const adminCookieName = COOKIE;
export const adminCookieMaxAge = LIFETIME / 1000;
