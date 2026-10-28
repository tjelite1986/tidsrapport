'use client';

import EmptyChart from './EmptyChart';

interface BarDatum {
  label: string;
  value: number;
  // Drawn faded, e.g. planned shifts that have not happened yet
  muted?: boolean;
  // Drawn with a glow and a bold label, e.g. today
  highlight?: boolean;
  // Native tooltip text; defaults to "label: value"
  hint?: string;
}

interface BarChartProps {
  data: BarDatum[];
  title?: string;
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
  // Hide the value above each bar when there are too many bars to label
  showValues?: boolean;
}

// A hex colour with an alpha suffix, or the colour as-is when it is not #rrggbb
function withAlpha(color: string, alpha: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

// Flex columns instead of a fixed-width SVG: the bars share the card's width,
// so seven weekdays or twelve months fit a phone without a sideways scroll.
export default function BarChart({
  data,
  title,
  color = '#3b82f6',
  height = 200,
  formatValue = (v) => v.toFixed(1),
  showValues = true,
}: BarChartProps) {
  if (data.length === 0) return null;
  if (data.every((d) => d.value <= 0)) return <EmptyChart title={title} height={height - 40} />;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barArea = height - 40;
  // The whole row grows in within ~0.6 s however many bars there are
  const stagger = Math.min(70, 600 / data.length);
  const gradient = `linear-gradient(180deg, ${withAlpha(color, '99')}, ${color})`;

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>}
      <div className={`flex items-end ${data.length > 14 ? 'gap-[2px]' : 'gap-1'}`} style={{ height }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="group flex-1 min-w-0 flex flex-col items-center justify-end h-full"
            title={d.hint ?? `${d.label}: ${formatValue(d.value)}`}
          >
            {showValues && (
              <span
                className={`text-[10px] mb-0.5 whitespace-nowrap animate-rise ${d.highlight ? 'font-semibold text-gray-800' : 'text-gray-600'}`}
                style={{ animationDelay: `${300 + i * stagger}ms` }}
              >
                {d.value > 0 ? formatValue(d.value) : ''}
              </span>
            )}
            <div
              className={`w-full max-w-[48px] rounded-t-md animate-grow-y transition-[filter] duration-200 group-hover:brightness-110 ${d.muted ? 'opacity-40' : ''}`}
              style={{
                height: (d.value / maxValue) * barArea,
                background: gradient,
                animationDelay: `${i * stagger}ms`,
                boxShadow: d.highlight ? `0 0 0 2px #fff, 0 0 0 4px ${withAlpha(color, '66')}, 0 6px 16px ${withAlpha(color, '55')}` : undefined,
              }}
            />
            <span className={`text-[10px] mt-1 whitespace-nowrap ${data.length > 14 ? 'overflow-visible' : 'truncate max-w-full'} ${d.highlight ? 'font-bold text-gray-800' : 'text-gray-500'}`}>
              {d.label || '\u00a0'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
