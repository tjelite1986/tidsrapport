'use client';

import { useEffect } from 'react';
import { THEME_CHANGE_EVENT, type ThemePreference } from '@/lib/theme/theme';
import { applyTheme, readPreference } from '@/lib/theme/apply';

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

// Set when a choice could not be saved (storage blocked): the choice then lives
// for this page only instead of snapping back to the OS value.
let unsaved: ThemePreference | null = null;

function sync(e?: Event) {
  if (e && e.type === THEME_CHANGE_EVENT) {
    const d = (e as CustomEvent<{ pref: ThemePreference; saved: boolean }>).detail;
    unsaved = d && !d.saved ? d.pref : null;
  }
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {}
  applyTheme(unsaved ?? readPreference(storage), query().matches, document);
}

/** Always mounted: applies the saved theme (incl. the theme-color tag) after
 *  hydration and follows OS changes while the preference is "system". */
export default function ThemeSync() {
  useEffect(() => {
    sync();
    const mq = query();
    mq.addEventListener('change', sync);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return null;
}
