import { NextResponse } from 'next/server';
import { adminCookieName } from '@/lib/admin-auth';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return new Response('Forbidden', { status: 403 });
  const response = NextResponse.redirect(new URL('/admin', request.url), { status: 303 });
  response.cookies.delete(adminCookieName);
  return response;
}
