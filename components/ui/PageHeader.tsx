// One header style for every page: title, optional subtitle, optional action on the right.
// Light on purpose (the home greeting card is the only hero); a gradient accent grows in beside the title.
export default function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-6">
      <div className="min-w-0 flex gap-3">
        <span aria-hidden className="mt-1 w-1.5 self-stretch rounded-full bg-gradient-to-b from-blue-500 via-indigo-500 to-emerald-400 animate-grow-y [transform-origin:top]" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
