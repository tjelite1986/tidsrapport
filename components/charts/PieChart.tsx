'use client';

interface PieChartProps {
  data: { label: string; value: number; color?: string }[];
  title?: string;
  size?: number;
}

const defaultColors = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export default function PieChart({ data, title, size = 180 }: PieChartProps) {
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) return null;

  const total = filtered.reduce((sum, d) => sum + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;

  let startAngle = -Math.PI / 2;
  const slices = filtered.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    startAngle = endAngle;

    return {
      path,
      color: d.color || defaultColors[i % defaultColors.length],
      label: d.label,
      value: d.value,
      percent: ((d.value / total) * 100).toFixed(1),
    };
  });

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>}
      <div className="flex items-start gap-4">
        <svg width={size} height={size}>
          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth={1} />
          ))}
        </svg>
        <div className="space-y-1 text-xs">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-gray-700">{s.label}: {s.value.toFixed(1)}h ({s.percent}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
