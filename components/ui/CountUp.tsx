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

// The first number in a display string such as "20 613 kr" or "154.0h":
// its value, decimal count and the separators it was written with.
const NUMBER = /\d{1,3}(?:[  ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/;

export function parseDisplayNumber(text: string) {
  const m = NUMBER.exec(text);
  if (!m) return null;
  const raw = m[0];
  const group = /[  ]/.exec(raw)?.[0] ?? null;
  const decimalMark = /[.,](?=\d+$)/.exec(raw)?.[0] ?? null;
  const decimals = decimalMark ? raw.length - raw.lastIndexOf(decimalMark) - 1 : 0;
  const value = Number(raw.replace(/[  ]/g, '').replace(',', '.'));
  return { value, decimals, group, decimalMark, before: text.slice(0, m.index), after: text.slice(m.index + raw.length) };
}

function formatLike(v: number, p: NonNullable<ReturnType<typeof parseDisplayNumber>>) {
  const [int, frac] = v.toFixed(p.decimals).split('.');
  const grouped = p.group ? int.replace(/\B(?=(\d{3})+(?!\d))/g, p.group) : int;
  return frac ? `${grouped}${p.decimalMark}${frac}` : grouped;
}

// Counts up the number inside an already formatted string, keeping its format.
// Only a string that starts with its number counts: "Okt 2026" or "−1 200 kr"
// is shown as it is.
export function CountUpText({ text, duration }: { text: string; duration?: number }) {
  const p = parseDisplayNumber(text);
  if (!p || p.before !== '') return <>{text}</>;
  return (
    <>
      <CountUp value={p.value} duration={duration} format={(v) => formatLike(v, p)} />
      {p.after}
    </>
  );
}
