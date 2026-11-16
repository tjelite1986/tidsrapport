'use client';

import { useCallback, useEffect, useState } from 'react';

export type ApiStatus = 'loading' | 'ready' | 'error';

// Fetches one of the app's own JSON endpoints. A non-2xx answer or a network
// failure is an `error` (never silently an empty result), so the UI can tell
// "nothing here" from "could not load" and offer a retry.
export function useApi<T>(url: string | null): { data: T | null; status: ApiStatus; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<ApiStatus>('loading');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) {
      setData(null);
      setStatus('ready');
      return;
    }
    let alive = true;
    setStatus('loading');
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: T) => {
        if (!alive) return;
        setData(json);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [url, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, status, reload };
}
