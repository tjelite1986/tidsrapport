'use client';

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
  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = Math.min(...data.map((d) => d.value), 0);
  const range = maxValue - minValue || 1;

  const padding = { top: 20, right: 20, bottom: 30, left: 10 };
  const svgWidth = Math.max(400, data.length * 50 + padding.left + padding.right);
  const chartHeight = height - padding.top - padding.bottom;
  const chartWidth = svgWidth - padding.left - padding.right;

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
      <div className="overflow-x-auto">
        <svg width={svgWidth} height={height} className="block">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padding.top + chartHeight * (1 - frac);
            return (
              <line key={frac} x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill={color} opacity={0.1} />

          {/* Line */}
          <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

          {/* Points and labels */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3.5} fill={color} stroke="white" strokeWidth={2} />
              {p.value > 0 && (
                <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[10px] fill-gray-600">
                  {formatValue(p.value)}
                </text>
              )}
              <text x={p.x} y={height - 4} textAnchor="middle" className="text-[9px] fill-gray-500">
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
