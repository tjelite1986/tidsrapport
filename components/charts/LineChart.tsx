'use client';

import { useCallback, useRef, useState } from 'react';
import EmptyChart from './EmptyChart';
import { estimateLabelWidth, labelledIndices } from '@/lib/charts/label-step';

interface LineChartProps {
  data: { label: string; value: number }[];
  title?: string;
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}

export default function LineChart({
  data,
  title,
  color = '#10b981',
  height = 200,
  formatValue = (v) => v.toFixed(0),
}: LineChartProps) {
  // Draw in real CSS pixels: a fixed viewBox scaled down to a phone shrank the
  // 10px labels to 3-5px. The width is measured; labels are thinned instead.
  // A callback ref, not an effect: the box is absent while data is empty, so a mount-time effect
  // would never see it when data arrives later and the chart would stay at the 400 px fallback.
  const [measured, setMeasured] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const boxRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const update = () => setMeasured(Math.round(el.clientWidth));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    roRef.current = new ResizeObserver(update);
    roRef.current.observe(el);
  }, []);

  if (data.length === 0) return null;
  if (data.every((d) => d.value <= 0)) return <EmptyChart title={title} height={height - 50} />;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = Math.min(...data.map((d) => d.value), 0);
  const range = maxValue - minValue || 1;

  const padding = { top: 24, right: 18, bottom: 28, left: 18 };
  const svgWidth = measured || 400;
  const chartHeight = height - padding.top - padding.bottom;
  const chartWidth = svgWidth - padding.left - padding.right;
  // Thin labels by their real width: month-year labels ("Okt 2026") are much wider than "Jan".
  const axisWidth = Math.max(...data.map((d) => estimateLabelWidth(d.label)));
  const valueWidth = Math.max(...data.map((d) => estimateLabelWidth(formatValue(d.value))));
  const axisShown = new Set(labelledIndices(data.length, chartWidth, axisWidth));
  const valueShown = new Set(labelledIndices(data.length, chartWidth, valueWidth));

  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.value - minValue) / range) * chartHeight;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>}
      <div ref={boxRef} className="w-full">
        <svg width={svgWidth} height={height} viewBox={`0 0 ${svgWidth} ${height}`} className="block w-full" role="img" aria-label={title ?? 'Linjediagram'}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padding.top + chartHeight * (1 - frac);
            return (
              <line key={frac} x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="currentColor" strokeWidth={1} className="text-gray-200 dark:text-slate-700" />
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill={color} opacity={0.1} className="animate-fade [animation-delay:400ms]" />

          {/* Line */}
          <path d={linePath} pathLength={1} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="animate-draw" />

          {/* Points and labels */}
          {points.map((p, i) => (
            <g key={i} className="animate-fade" style={{ animationDelay: `${(i / Math.max(points.length - 1, 1)) * 1000}ms` }}>
              <circle cx={p.x} cy={p.y} r={3.5} fill={color} stroke="var(--panel)" strokeWidth={2} />
              {p.value > 0 && valueShown.has(i) && (
                <text x={p.x} y={p.y - 10} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="text-[11px] font-medium fill-gray-700 dark:fill-slate-200">
                  {formatValue(p.value)}
                </text>
              )}
              {axisShown.has(i) && (
                <text x={p.x} y={height - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="text-[11px] fill-gray-500 dark:fill-slate-400">
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
