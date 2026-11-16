import Link from 'next/link';
import type { ApiStatus } from './useApi';

// A dashboard card that owns its loading / error / empty states, so every
// section degrades on its own instead of the whole page going blank.
export default function Panel({
  title,
  id,
  status,
  empty,
  emptyText,
  onRetry,
  href,
  hrefLabel,
  className = '',
  children,
}: {
  title: string;
  id: string;
  status: ApiStatus;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  href?: string;
  hrefLabel?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      aria-busy={status === 'loading'}
      className={`bg-white rounded-2xl card-3d border border-gray-100 p-5 animate-rise ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 id={id} className="font-semibold text-gray-800">{title}</h2>
        {href && (
          <Link href={href} className="text-sm text-sky-700 hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
            {hrefLabel ?? 'Visa alla'} <span aria-hidden>→</span>
          </Link>
        )}
      </div>
      {status === 'loading' && (
        <div role="status" className="space-y-2.5">
          <span className="sr-only">Laddar {title.toLowerCase()}…</span>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="h-9 rounded-lg bg-gray-100 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      )}
      {status === 'error' && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>Kunde inte hämta {title.toLowerCase()}.</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 font-medium underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
            >
              Försök igen
            </button>
          )}
        </div>
      )}
      {status === 'ready' && (empty ? <p className="text-sm text-gray-500">{emptyText ?? 'Inget att visa ännu.'}</p> : children)}
    </section>
  );
}
