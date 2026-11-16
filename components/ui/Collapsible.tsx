'use client';

import { useId, useState } from 'react';

// A card whose body folds away behind its title. The body stays mounted while
// folded (only `hidden`), so half-typed values and component state survive a
// toggle. The header is a real button with aria-expanded/aria-controls.
export default function Collapsible({
  title,
  description,
  badge,
  defaultOpen = false,
  tone = 'default',
  className = '',
  children,
}: {
  title: string;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  tone?: 'default' | 'danger';
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className={`surface overflow-hidden ${tone === 'danger' ? '!border-red-200 dark:!border-red-400/35' : ''} ${className}`}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="w-full min-h-[56px] flex items-center justify-between gap-3 px-4 sm:px-6 py-3 text-left rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-500"
        >
          <span className="min-w-0">
            <span className={`block text-base sm:text-lg font-semibold ${tone === 'danger' ? 'text-red-700' : 'text-slate-900'}`}>
              {title}
            </span>
            {description && <span className="block text-sm text-slate-500 mt-0.5">{description}</span>}
          </span>
          <span className="shrink-0 flex items-center gap-2">
            {badge}
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className={`w-5 h-5 text-slate-400 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="px-4 sm:px-6 pb-5 pt-1">
        {children}
      </div>
    </section>
  );
}
