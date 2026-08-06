import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  // api/demo must be reachable from the login page (demo prefill), and PWA
  // assets (sw.js, manifest, icons) must be public or install/update breaks
  // for logged-out visitors
  matcher: ['/((?!login|api/auth|api/demo|_next/static|_next/image|favicon.ico|favicon-32.png|apple-touch-icon.png|icon-192.png|icon-512.png|icon-maskable-512.png|sw.js|manifest.webmanifest|manifest.json).*)'],
};
