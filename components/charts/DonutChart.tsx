'use client';

interface DonutChartProps {
  data: { label: string; value: number; color?: string }[];
  title?: string;
  size?: number;
  formatValue?: (v: number) => string;
}

const defaultColors = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export default function DonutChart({
  data,
  title,
  size = 180,
  formatValue = (v) => v.toFixed(1),
}: DonutChartProps) {
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) return null;

  const total = filtered.reduce((sum, d) => sum + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 10;
  const innerR = outerR * 0.55;

  let startAngle = -Math.PI / 2;

  const slices = filtered.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;
    const path = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      'Z',
    ].join(' ');

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
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size}>
            {slices.map((s, i) => (
              <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth={2} />
            ))}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-lg font-bold text-gray-800">{formatValue(total)}</div>
              <div className="text-[10px] text-gray-500">Totalt</div>
            </div>
          </div>
        </div>
        <div className="space-y-1.5 text-xs">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-gray-700">
                {s.label}: {formatValue(s.value)} ({s.percent}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
