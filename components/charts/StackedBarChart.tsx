'use client';

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

  const maxTotal = Math.max(...data.map((d) => d.segments.reduce((sum, s) => sum + s.value, 0)), 1);
  const barWidth = Math.max(20, Math.min(50, (600 - data.length * 4) / data.length));
  const svgWidth = data.length * (barWidth + 4) + 40;
  const chartHeight = height - 50;

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
      <div className="overflow-x-auto">
        <svg width={svgWidth} height={height} className="block">
          {data.map((d, i) => {
            const x = i * (barWidth + 4) + 30;
            const total = d.segments.reduce((sum, s) => sum + s.value, 0);
            let currentY = chartHeight + 5;

            return (
              <g key={i}>
                {d.segments.map((seg, j) => {
                  const segHeight = (seg.value / maxTotal) * chartHeight;
                  currentY -= segHeight;
                  return (
                    <rect
                      key={j}
                      x={x}
                      y={currentY}
                      width={barWidth}
                      height={segHeight}
                      fill={seg.color}
                      rx={j === d.segments.length - 1 ? 2 : 0}
                    />
                  );
                })}
                {total > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 5 - (total / maxTotal) * chartHeight - 4}
                    textAnchor="middle"
                    className="text-[10px] fill-gray-600"
                  >
                    {formatValue(total)}
                  </text>
                )}
                <text x={x + barWidth / 2} y={height - 18} textAnchor="middle" className="text-[9px] fill-gray-500">
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
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
