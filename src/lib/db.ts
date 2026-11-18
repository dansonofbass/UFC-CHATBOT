import { createClient } from '@supabase/supabase-js';
import { env } from './env';
export function db(privileged = false) {
  const e = env();
  const key = privileged ? e.SUPABASE_SECRET_KEY : e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !key) return null;
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(12000) }),
    },
  });
}
export async function checked<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error || data === null) throw new Error('Database operation failed');
  return data;
}
