import type { MetadataRoute } from 'next';
import { THEME_COLORS } from '@/lib/theme/theme';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tidsrapport',
    short_name: 'Tidsrapport',
    description: 'Tidrapportering och lönehantering',
    start_url: '/',
    display: 'standalone',
    // A static manifest cannot follow the user's chosen theme; it carries the
    // light palette, the same colour as the layout's default theme-color. The
    // meta tag (ThemeSync) overrides it at runtime once a page is open.
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    orientation: 'any',
    categories: ['productivity'],
    // The ?v= is what makes a new icon reach an already-installed home screen
    // app. Android bakes the icon into a generated APK at install time and
    // only rebuilds it when it notices the manifest changed — an icon swapped
    // behind an unchanged URL is not noticed. Bump it whenever the icons are
    // regenerated.
    icons: [
      {
        src: '/icon-192.png?v=2',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png?v=2',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png?v=2',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
