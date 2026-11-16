import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe('ThemeToggle contrast', () => {
  const src = read('components/ThemeToggle.tsx');
  const selected = /pref === o\.value \? '([^']+)'/.exec(src)![1];

  it('selected label is not a class the dark theme remaps to a pale colour', () => {
    expect(selected).toContain('bg-sky-400');
    expect(selected).not.toMatch(/text-(slate|gray)-(700|800|900|600)/);
  });
  it('selected label colour has >= 4.5:1 against sky-400 (#38bdf8)', () => {
    const fg = /text-\[(#[0-9a-fA-F]{6})\]/.exec(selected)![1];
    expect(ratio(fg, '#38bdf8')).toBeGreaterThanOrEqual(4.5);
  });
  it('unselected label (slate-300) is readable on the slate-800/900 nav bar', () => {
    expect(ratio('#cbd5e1', '#1e293b')).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps 44px targets and a focus ring', () => {
    expect(src).toContain('min-h-[44px] min-w-[44px]');
    expect(src).toContain('focus-visible:outline-sky-300');
  });
});

describe('dark-mode remap of white opacity variants', () => {
  const css = read('app/globals.css');
  it.each(['bg-white\\/95', 'bg-white\\/60', 'bg-white\\/50', 'hover\\:bg-white:hover'])('remaps %s', (cls) => {
    expect(css).toContain(`.dark .${cls}`);
  });
  it('every bg-white/NN used outside nav and dark heroes is remapped', () => {
    const files = ['app/tid/page.tsx', 'components/calendar/CalendarMonthView.tsx', 'components/calendar/CalendarWeekView.tsx'];
    for (const f of files) {
      for (const m of read(f).matchAll(/(?<![\w:-])bg-white\/(\d+)/g)) {
        expect(css).toContain(`.dark .bg-white\\/${m[1]}`);
      }
    }
  });
});

describe('every used bg-*/NN class has a dark-mode rule or is on an already-dark surface', () => {
  const css = read('app/globals.css');
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const walk = (d: string): string[] =>
    readdirSync(join(root, d)).flatMap((n) => {
      const rel = `${d}/${n}`;
      return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.tsx$/.test(n) ? [rel] : [];
    });
  const used = new Set<string>();
  for (const f of [...walk('app'), ...walk('components')]) {
    for (const m of read(f).matchAll(/(?<![\w:-])bg-([a-z]+(?:-\d+)?)\/(\d+)/g)) used.add(`${m[1]}/${m[2]}`);
  }
  // Light-tinted/white/gray backgrounds must be remapped. Saturated (>=300 shade),
  // black and nav/hero overlays sit on dark surfaces by design and keep working.
  const needsRemap = [...used].filter((c) => /^(white|gray-\d+|slate-50|slate-100|[a-z]+-(50|100|200))\//.test(c) && !c.startsWith('white/1') && !c.startsWith('white/20'));
  it('finds the classes the app really uses', () => {
    expect(used.has('white/95')).toBe(true);
    expect(used.has('pink-50/50')).toBe(true);
    expect(used.has('gray-50/70')).toBe(true);
  });
  it.each(needsRemap)('%s is remapped under .dark', (c) => {
    expect(css).toContain(`.dark .bg-${c.replace('/', '\\/')}`);
  });

  // Composite the remapped tint over the dark panel and check the text colours
  // the dark theme gives the content of those cells.
  const over = (fg: [number, number, number], a: number, bg: string): string =>
    '#' + [0, 1, 2].map((i) => Math.round(fg[i] * a + parseInt(bg.slice(1 + 2 * i, 3 + 2 * i), 16) * (1 - a)).toString(16).padStart(2, '0')).join('');
  const panel = '#142139';
  const tints: Record<string, string> = {
    'pink-50/50': over([236, 72, 153], 0.08, panel),
    'purple-50/50': over([168, 85, 247], 0.08, panel),
    'gray-50/70': over([255, 255, 255], 0.04, panel),
    'white/60': over([255, 255, 255], 0.07, panel),
    'white/95': panel,
  };
  it.each(Object.entries(tints))('text on %s composite stays >= 4.5:1', (_c, bg) => {
    for (const fg of ['#e5edf8', '#cbd5e1', '#94a3b8']) expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('manifest colours', () => {
  it('match the layout default theme-color (light palette)', () => {
    const m = read('app/manifest.ts');
    expect(m).toContain('theme_color: THEME_COLORS.light');
    expect(m).toContain('background_color: THEME_COLORS.light');
    expect(read('app/layout.tsx')).toContain("themeColor: '#F4F7FB'");
  });
});

describe('ThemeToggle initial state', () => {
  it('selects nothing until the saved preference is read', () => {
    const src = read('components/ThemeToggle.tsx');
    expect(src).toContain('useState<ThemePreference | null>(null)');
    expect(src).toContain("(pref ?? 'system') === o.value ? 0 : -1");
  });
});
