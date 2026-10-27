import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, safeEqual, sessionToken } from '@/lib/session';

// Passes the path to layouts (for the check-in gate) and applies the optional passcode gate.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const pass = () => {
    const headers = new Headers(req.headers);
    headers.set('x-pathname', pathname);
    return NextResponse.next({ request: { headers } });
  };

  const passcode = process.env.PALACE_PASSCODE;
  if (!passcode) return pass();
  if (pathname === '/login' || pathname === '/hall' || pathname.startsWith('/hall/')) return pass();

  const token = req.cookies.get(SESSION_COOKIE)?.value ?? '';
  if (token && safeEqual(token, await sessionToken(passcode))) return pass();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'],
};
