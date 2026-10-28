import { Tone, toneIcon, toneText } from './tones';
import { CountUpText } from './CountUp';

// Neutral white tile; only the value (and the optional icon) carries the tone colour
export default function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 card-3d card-lift p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon && (
          <div className={`${toneIcon[tone]} w-7 h-7 rounded-lg flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4`}>
            {icon}
          </div>
        )}
        <p className="text-xs text-gray-500 leading-tight">{label}</p>
      </div>
      <p className={`text-xl font-bold leading-tight ${toneText[tone]}`}>{typeof value === 'string' ? <CountUpText text={value} /> : value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
