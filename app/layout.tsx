import './globals.css';
import type { Metadata, Viewport } from 'next';
import SessionProvider from '@/components/SessionProvider';
import Navigation from '@/components/Navigation';
import PwaRegister from '@/components/PwaRegister';

export const viewport: Viewport = {
  themeColor: '#2563eb',
};

export const metadata: Metadata = {
  title: 'Tidsrapport',
  description: 'Tidrapportering och lönehantering',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Tidsrapport',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
    shortcut: '/icon.svg',
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
      </body>
    </html>
  );
}
