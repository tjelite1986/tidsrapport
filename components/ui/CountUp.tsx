'use client';

import { useEffect, useRef, useState } from 'react';

// Counts from the previous value to the new one with an ease-out curve.
// Jumps straight to the value when the user prefers reduced motion.
export default function CountUp({
  value,
  format,
  duration = 900,
}: {
  value: number;
  format: (v: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const v = origin + (value - origin) * (1 - Math.pow(1 - p, 3));
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular-nums">{format(shown)}</span>;
}
