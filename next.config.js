/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  headers: async () => [
    {
      // Förhindra caching av HTML-sidor så att ny deploy alltid visas direkt
      source: '/((?!_next/static|_next/image|favicon|icon|manifest).*)',
      headers: [
        { key: 'Cache-Control', value: 'no-store, must-revalidate' },
      ],
    },
  ],
};

module.exports = nextConfig;
