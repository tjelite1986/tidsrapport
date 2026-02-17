'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/tid', label: 'Tidsregistrering' },
  { href: '/timer', label: 'Timer' },
  { href: '/projekt', label: 'Projekt' },
  { href: '/rapporter', label: 'Rapporter' },
  { href: '/lon', label: 'Lön' },
  { href: '/statistik', label: 'Statistik' },
  { href: '/installningar', label: 'Inställningar' },
];

export default function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) return null;

  return (
    <nav className="bg-blue-800 text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <span className="font-bold text-lg mr-6">Tidsrapport</span>
            <div className="hidden lg:flex items-center space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === item.href
                      ? 'bg-blue-900 text-white'
                      : 'text-blue-100 hover:bg-blue-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {session.user.role === 'admin' && (
                <Link
                  href="/admin"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin'
                      ? 'bg-blue-900 text-white'
                      : 'text-blue-100 hover:bg-blue-700'
                  }`}
                >
                  Admin
                </Link>
              )}
            </div>
          </div>
          <div className="hidden lg:flex items-center space-x-4">
            <span className="text-sm text-blue-200">{session.user.name}</span>
            <button
              onClick={() => signOut()}
              className="text-sm text-blue-200 hover:text-white"
            >
              Logga ut
            </button>
          </div>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden p-2 rounded-md text-blue-200 hover:text-white hover:bg-blue-700"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-blue-700 px-4 py-2 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2 rounded-md text-sm font-medium ${
                pathname === item.href
                  ? 'bg-blue-900 text-white'
                  : 'text-blue-100 hover:bg-blue-700'
              }`}
            >
              {item.label}
            </Link>
          ))}
          {session.user.role === 'admin' && (
            <Link
              href="/admin"
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2 rounded-md text-sm font-medium ${
                pathname === '/admin'
                  ? 'bg-blue-900 text-white'
                  : 'text-blue-100 hover:bg-blue-700'
              }`}
            >
              Admin
            </Link>
          )}
          <div className="border-t border-blue-700 pt-2 mt-2 flex items-center justify-between">
            <span className="text-sm text-blue-200">{session.user.name}</span>
            <button
              onClick={() => signOut()}
              className="text-sm text-blue-200 hover:text-white"
            >
              Logga ut
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
