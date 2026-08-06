import './globals.css';
import type { Metadata, Viewport } from 'next';
import SessionProvider from '@/components/SessionProvider';
import Navigation from '@/components/Navigation';
import PwaRegister from '@/components/PwaRegister';
import PwaInstallBanner from '@/components/PwaInstallBanner';

export const viewport: Viewport = {
  themeColor: '#2563eb',
};

export const metadata: Metadata = {
  title: 'Tidsrapport',
  description: 'Tidrapportering och lönehantering',
  // app/manifest.ts serves the manifest at /manifest.webmanifest — /manifest.json is a 404
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Tidsrapport',
  },
  icons: {
    icon: '/favicon-32.png',
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon-32.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className="bg-gray-50 min-h-screen">
        <SessionProvider>
          <Navigation />
          <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        </SessionProvider>
        <PwaRegister />
        <PwaInstallBanner />
      </body>
    </html>
  );
}
