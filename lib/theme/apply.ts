// DOM/storage side of the theme, written against tiny structural interfaces so
// it can be tested without a browser. Components pass the real `document` and
// `localStorage`.
import {
  THEME_COLORS,
  THEME_STORAGE_KEY,
  normalizeTheme,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface ThemeMeta {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}
export interface ThemeDocument {
  documentElement: {
    classList: { toggle(token: string, force?: boolean): boolean };
    style: { colorScheme: string };
  };
  querySelectorAll(selector: string): ArrayLike<ThemeMeta>;
}

/** Saved preference; 'system' when nothing is saved or storage throws. */
export function readPreference(storage: ThemeStorage | null | undefined): ThemePreference {
  try {
    return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

/** Persists the choice ('system' clears it). Returns false if storage is unavailable. */
export function savePreference(storage: ThemeStorage | null | undefined, pref: ThemePreference): boolean {
  try {
    if (!storage) return false;
    if (pref === 'system') storage.removeItem(THEME_STORAGE_KEY);
    else storage.setItem(THEME_STORAGE_KEY, pref);
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies the theme to <html> and to EVERY theme-color tag. The media
 * qualifier is dropped so the explicit choice (or the OS value, in system
 * mode) is what the browser chrome shows, not whatever the OS happens to say.
 */
export function applyTheme(pref: ThemePreference, systemPrefersDark: boolean, doc: ThemeDocument): ResolvedTheme {
  const resolved = resolveTheme(pref, systemPrefersDark);
  const root = doc.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  const metas = doc.querySelectorAll('meta[name="theme-color"]');
  for (let i = 0; i < metas.length; i++) {
    metas[i].removeAttribute('media');
    metas[i].setAttribute('content', THEME_COLORS[resolved]);
  }
  return resolved;
}
