import './globals.css';
import type { Metadata } from 'next';
import SessionProvider from '@/components/SessionProvider';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Tidsrapport',
  description: 'Tidrapportering och lönehantering',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className="bg-gray-50 min-h-screen">
        <SessionProvider>
          <Navigation />
          <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
