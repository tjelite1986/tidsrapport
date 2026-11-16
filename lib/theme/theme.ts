// Theme preference: Dark / Light / Follow system. Stored in localStorage only
// (a per-device UI choice, no database change). `resolveTheme` is pure so it
// can be tested; `THEME_INIT_SCRIPT` runs before first paint to avoid a flash.
export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'tidsrapport-theme';
export const THEME_CHANGE_EVENT = 'tidsrapport-theme-change';

export function normalizeTheme(value: unknown): ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'system';
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

export const THEME_COLORS: Record<ResolvedTheme, string> = { dark: '#0B1220', light: '#F4F7FB' };

// Inlined in <head>. Kept dependency-free and wrapped in try/catch (storage can
// throw in private mode); a failure just leaves the light default.
export const THEME_INIT_SCRIPT = `(function(){try{var p=null;try{p=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(e){}if(p!=='dark'&&p!=='light')p='system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].removeAttribute('media');m[i].setAttribute('content',d?'${THEME_COLORS.dark}':'${THEME_COLORS.light}');}}catch(e){}})();`;
