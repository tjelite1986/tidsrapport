'use client';

interface Props {
  view: 'week' | 'month';
  onChange: (view: 'week' | 'month') => void;
}

export default function CalendarViewToggle({ view, onChange }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
      <button
        onClick={() => onChange('week')}
        className={`px-4 py-1.5 text-sm font-medium transition-colors ${
          view === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        Vecka
      </button>
      <button
        onClick={() => onChange('month')}
        className={`px-4 py-1.5 text-sm font-medium transition-colors ${
          view === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        Månad
      </button>
    </div>
  );
}
