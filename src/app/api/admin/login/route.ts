import { NextResponse } from 'next/server';
import { checkAdminCredentials, createAdminSession, adminCookieName, adminCookieMaxAge } from '@/lib/admin-auth';
import { clientLimit } from '@/lib/security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return new Response('Forbidden', { status: 403 });
  if (!(await clientLimit(request))) return new Response('Too many attempts', { status: 429 });
  const data = await request.formData();
  const username = String(data.get('username') || '').slice(0, 100);
  const password = String(data.get('password') || '').slice(0, 200);
  if (!checkAdminCredentials(username, password))
    return NextResponse.redirect(new URL('/admin?error=1', request.url), { status: 303 });
  const response = NextResponse.redirect(new URL('/admin', request.url), { status: 303 });
  response.cookies.set(adminCookieName, createAdminSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', path: '/', maxAge: adminCookieMaxAge,
  });
  return response;
}
