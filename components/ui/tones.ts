// Colour meanings shared by every page. A colour says what a number is, not
// which tile it sits in: blue = time and actions, emerald = money earned,
// red = deductions/sick, orange = OB and VAB, amber = overtime, teal = vacation.
export type Tone = 'time' | 'money' | 'negative' | 'ob' | 'overtime' | 'vacation' | 'neutral';

export const toneText: Record<Tone, string> = {
  time: 'text-blue-700',
  money: 'text-emerald-700',
  negative: 'text-red-600',
  ob: 'text-orange-700',
  overtime: 'text-amber-700',
  vacation: 'text-teal-700',
  neutral: 'text-gray-900',
};

export const toneIcon: Record<Tone, string> = {
  time: 'bg-blue-100 text-blue-700',
  money: 'bg-emerald-100 text-emerald-700',
  negative: 'bg-red-100 text-red-600',
  ob: 'bg-orange-100 text-orange-700',
  overtime: 'bg-amber-100 text-amber-700',
  vacation: 'bg-teal-100 text-teal-700',
  neutral: 'bg-gray-100 text-gray-600',
};
