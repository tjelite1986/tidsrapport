'use client';

import EmptyChart from './EmptyChart';

interface StackedBarChartProps {
  data: { label: string; segments: { value: number; color: string; label: string }[] }[];
  title?: string;
  height?: number;
  formatValue?: (v: number) => string;
}

export default function StackedBarChart({
  data,
  title,
  height = 220,
  formatValue = (v) => v.toFixed(0),
}: StackedBarChartProps) {
  if (data.length === 0) return null;
  if (data.every((d) => d.segments.every((s) => s.value <= 0))) return <EmptyChart title={title} height={height - 50} />;

  const maxTotal = Math.max(...data.map((d) => d.segments.reduce((sum, s) => sum + s.value, 0)), 1);
  const chartHeight = height - 50;

  // Flex columns share the card's width (no sideways scroll on a phone)
  // Collect unique legend items
  const legendMap = new Map<string, string>();
  for (const d of data) {
    for (const s of d.segments) {
      if (s.value > 0 && !legendMap.has(s.label)) {
        legendMap.set(s.label, s.color);
      }
    }
  }

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>}
      <div className="flex items-end gap-1" style={{ height: chartHeight + 30 }}>
        {data.map((d, i) => {
          const total = d.segments.reduce((sum, s) => sum + s.value, 0);
          return (
            <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
              <span className="text-[10px] text-gray-600 mb-0.5 whitespace-nowrap">
                {total > 0 ? formatValue(total) : ''}
              </span>
              {/* Segments stack bottom-up, like the SVG version did */}
              <div className="w-full max-w-[48px] flex flex-col-reverse rounded-t-sm overflow-hidden">
                {d.segments.map((seg, j) => (
                  <div key={j} style={{ height: (seg.value / maxTotal) * chartHeight, backgroundColor: seg.color }} />
                ))}
              </div>
              <span className="text-[10px] text-gray-500 mt-1 truncate max-w-full">{d.label}</span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2">
        {Array.from(legendMap.entries()).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1 text-xs text-gray-600">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
