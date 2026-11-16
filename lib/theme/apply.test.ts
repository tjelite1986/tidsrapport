import { describe, it, expect } from 'vitest';
import { applyTheme, readPreference, savePreference, type ThemeDocument, type ThemeStorage } from './apply';
import { THEME_COLORS, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from './theme';

function fakeDoc(metaCount = 2) {
  const classes = new Set<string>();
  const metas = Array.from({ length: metaCount }, (_, i) => {
    const attrs: Record<string, string> = { name: 'theme-color', content: '#F4F7FB', media: i ? '(prefers-color-scheme: light)' : '(prefers-color-scheme: dark)' };
    return {
      attrs,
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
      removeAttribute: (k: string) => { delete attrs[k]; },
    };
  });
  const doc: ThemeDocument = {
    documentElement: {
      classList: { toggle: (t, f) => { const on = f ?? !classes.has(t); if (on) classes.add(t); else classes.delete(t); return on; } },
      style: { colorScheme: '' },
    },
    querySelectorAll: () => metas,
  };
  return { doc, classes, metas };
}
function fakeStorage(initial: Record<string, string> = {}): ThemeStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}
const throwing: ThemeStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};

describe('preference persistence', () => {
  it('round-trips light/dark and clears on system', () => {
    const s = fakeStorage();
    expect(readPreference(s)).toBe('system');
    expect(savePreference(s, 'dark')).toBe(true);
    expect(s.data[THEME_STORAGE_KEY]).toBe('dark');
    expect(readPreference(s)).toBe('dark');
    savePreference(s, 'system');
    expect(THEME_STORAGE_KEY in s.data).toBe(false);
    expect(readPreference(s)).toBe('system');
  });
  it('ignores corrupt stored values', () => {
    expect(readPreference(fakeStorage({ [THEME_STORAGE_KEY]: 'neon' }))).toBe('system');
  });
  it('survives unavailable storage', () => {
    expect(readPreference(throwing)).toBe('system');
    expect(savePreference(throwing, 'dark')).toBe(false);
    expect(readPreference(null)).toBe('system');
    expect(savePreference(null, 'light')).toBe(false);
  });
});

describe('applyTheme', () => {
  it('explicit dark wins over a light OS and updates every theme-color tag', () => {
    const { doc, classes, metas } = fakeDoc();
    expect(applyTheme('dark', false, doc)).toBe('dark');
    expect(classes.has('dark')).toBe(true);
    expect(doc.documentElement.style.colorScheme).toBe('dark');
    for (const m of metas) {
      expect(m.attrs.content).toBe(THEME_COLORS.dark);
      expect('media' in m.attrs).toBe(false);
    }
  });
  it('explicit light wins over a dark OS', () => {
    const { doc, classes, metas } = fakeDoc();
    applyTheme('dark', true, doc);
    applyTheme('light', true, doc);
    expect(classes.has('dark')).toBe(false);
    expect(doc.documentElement.style.colorScheme).toBe('light');
    expect(metas.every((m) => m.attrs.content === THEME_COLORS.light)).toBe(true);
  });
  it('system follows the OS and re-applies when the OS changes', () => {
    const { doc, classes, metas } = fakeDoc();
    applyTheme('system', true, doc);
    expect(classes.has('dark')).toBe(true);
    expect(metas[0].attrs.content).toBe(THEME_COLORS.dark);
    applyTheme('system', false, doc);
    expect(classes.has('dark')).toBe(false);
    expect(metas[1].attrs.content).toBe(THEME_COLORS.light);
  });
  it('works with no theme-color tag', () => {
    const { doc } = fakeDoc(0);
    expect(() => applyTheme('dark', false, doc)).not.toThrow();
  });
});

describe('init script (runs before first paint)', () => {
  function run(stored: string | null, osDark: boolean, storageThrows = false) {
    const { doc, classes, metas } = fakeDoc();
    const localStorage = storageThrows ? throwing : fakeStorage(stored ? { [THEME_STORAGE_KEY]: stored } : {});
    const document = { documentElement: doc.documentElement, querySelectorAll: doc.querySelectorAll };
    const window = { matchMedia: () => ({ matches: osDark }) };
    new Function('localStorage', 'document', 'window', THEME_INIT_SCRIPT)(localStorage, document, window);
    return { dark: classes.has('dark'), metas, scheme: doc.documentElement.style.colorScheme };
  }
  it('applies the saved preference including theme-color', () => {
    const r = run('dark', false);
    expect(r.dark).toBe(true);
    expect(r.metas.every((m) => m.attrs.content === THEME_COLORS.dark && !('media' in m.attrs))).toBe(true);
  });
  it('uses the OS when nothing is saved and light when saved light on a dark OS', () => {
    expect(run(null, true).dark).toBe(true);
    expect(run('light', true).dark).toBe(false);
    expect(run('light', true).metas[0].attrs.content).toBe(THEME_COLORS.light);
  });
  it('does not throw when storage is blocked', () => {
    expect(() => run(null, true, true)).not.toThrow();
    expect(run(null, true, true).dark).toBe(true); // falls back to the OS value
  });
});
