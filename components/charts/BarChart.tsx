'use client';

import EmptyChart from './EmptyChart';

interface BarChartProps {
  data: { label: string; value: number }[];
  title?: string;
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}

// Flex columns instead of a fixed-width SVG: the bars share the card's width,
// so seven weekdays or twelve months fit a phone without a sideways scroll.
export default function BarChart({
  data,
  title,
  color = '#3b82f6',
  height = 200,
  formatValue = (v) => v.toFixed(1),
}: BarChartProps) {
  if (data.length === 0) return null;
  if (data.every((d) => d.value <= 0)) return <EmptyChart title={title} height={height - 40} />;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barArea = height - 40;

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>}
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
            <span className="text-[10px] text-gray-600 mb-0.5 whitespace-nowrap">
              {d.value > 0 ? formatValue(d.value) : ''}
            </span>
            <div
              className="w-full max-w-[48px] rounded-t-sm"
              style={{ height: (d.value / maxValue) * barArea, backgroundColor: color }}
            />
            <span className="text-[10px] text-gray-500 mt-1 truncate max-w-full">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
