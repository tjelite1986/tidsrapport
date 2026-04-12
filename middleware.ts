import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const authMiddleware = withAuth({
  pages: {
    signIn: '/login',
  },
});

export default function middleware(req: NextRequest) {
  const res = (authMiddleware as any)(req) as NextResponse ?? NextResponse.next();
  // Förhindra Cloudflare och andra CDN:er från att cacha HTML-sidor
  if (!req.nextUrl.pathname.startsWith('/_next/static')) {
    res.headers.set('Cache-Control', 'no-store, must-revalidate');
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|manifest).*)'],
};
