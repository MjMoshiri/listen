import { NextRequest, NextResponse } from 'next/server';

/**
 * Access gate for when the app is exposed to the internet (Cloudflare tunnel
 * at listen.mjmoshiri.com). Requests from localhost pass untouched; anything
 * else needs the key from LISTEN_ACCESS_KEY — visit /?key=<key> once per
 * device and a year-long cookie takes over. Covers pages, API routes, and the
 * audio/image files under /uploads. With no key configured nothing is gated.
 */

const KEY = process.env.LISTEN_ACCESS_KEY;
const COOKIE = 'listen-key';

export function middleware(req: NextRequest) {
  if (!KEY) return NextResponse.next();

  const host = (req.headers.get('host') || '').split(':')[0];
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return NextResponse.next();
  }

  // ?key=... unlocks: set the cookie, then redirect to the same URL sans key
  const url = req.nextUrl;
  if (url.searchParams.get('key') === KEY) {
    const clean = url.clone();
    clean.searchParams.delete('key');
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE, KEY, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
    return res;
  }

  if (req.cookies.get(COOKIE)?.value === KEY) return NextResponse.next();

  return new NextResponse('Locked — open this site with ?key=<access key> once on this device.', {
    status: 401,
    headers: { 'content-type': 'text/plain' },
  });
}

export const config = {
  // Everything except Next's own static assets — /uploads (audio, images)
  // must go through the gate too.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
