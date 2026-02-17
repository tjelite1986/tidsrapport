'use client';

interface BarChartProps {
  data: { label: string; value: number }[];
  title?: string;
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}

export default function BarChart({
  data,
  title,
  color = '#3b82f6',
  height = 200,
  formatValue = (v) => v.toFixed(1),
}: BarChartProps) {
  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(20, Math.min(60, (600 - data.length * 4) / data.length));

  const svgWidth = data.length * (barWidth + 4) + 40;
  const chartHeight = height - 40;

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>}
      <div className="overflow-x-auto">
        <svg width={svgWidth} height={height} className="block">
          {data.map((d, i) => {
            const barHeight = (d.value / maxValue) * chartHeight;
            const x = i * (barWidth + 4) + 30;
            const y = chartHeight - barHeight + 5;

            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  rx={2}
                />
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  className="text-[10px] fill-gray-600"
                >
                  {formatValue(d.value)}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={height - 4}
                  textAnchor="middle"
                  className="text-[9px] fill-gray-500"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
