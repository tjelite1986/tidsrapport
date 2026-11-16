'use client';

import { useEffect, useRef, useState } from 'react';
import { THEME_CHANGE_EVENT, type ThemePreference } from '@/lib/theme/theme';
import { applyTheme, readPreference, savePreference } from '@/lib/theme/apply';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Ljust' },
  { value: 'dark', label: 'Mörkt' },
  { value: 'system', label: 'System' },
];

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The selected label uses an arbitrary colour (not text-slate-900) so the dark-mode
 *  remap of text-slate-900 to a pale text colour cannot reach it: #0b1220 on sky-400 ≈ 8:1.
 *  Radiogroup with roving tabindex: Tab enters on the selected option, arrow
 *  keys / Home / End move and select, as for native radios. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  // null until the saved preference is read (effect, client only), so the server
  // render and the first client render agree and no option is falsely shown as
  // selected; 'system' holds the tab stop meanwhile.
  const [pref, setPref] = useState<ThemePreference | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setPref(readPreference(storage()));
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<{ pref: ThemePreference }>).detail;
      setPref(d?.pref ?? readPreference(storage()));
    };
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  }, []);

  const choose = (value: ThemePreference) => {
    setPref(value);
    const saved = savePreference(storage(), value);
    applyTheme(value, window.matchMedia('(prefers-color-scheme: dark)').matches, document);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { pref: value, saved } }));
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % OPTIONS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + OPTIONS.length) % OPTIONS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = OPTIONS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    choose(OPTIONS[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Färgtema" className={`inline-flex rounded-lg border border-slate-600 p-0.5 ${className}`}>
      {OPTIONS.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          tabIndex={(pref ?? 'system') === o.value ? 0 : -1}
          onClick={() => choose(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={`min-h-[44px] min-w-[44px] px-3 text-xs rounded-md transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
            pref === o.value ? 'bg-sky-400 text-[#0b1220] font-semibold' : 'text-slate-300 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
