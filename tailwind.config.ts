import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Tidsrapport 2.0 palette
        night: { DEFAULT: '#0B1220', panel: '#142139' },
        paper: '#F4F7FB',
        brand: { cyan: '#38BDF8', indigo: '#6366F1', success: '#10B981', warning: '#F59E0B' },
      },
    },
  },
  plugins: [],
};

export default config;
