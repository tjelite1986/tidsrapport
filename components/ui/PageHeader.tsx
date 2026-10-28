// One header style for every page: a compact version of the start page's dark hero,
// with the same drifting glow. Title, optional subtitle, optional action on the right.
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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white hero-3d px-5 py-4 sm:px-6 sm:py-5 mb-6">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full bg-blue-500/30 blur-3xl animate-drift" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 w-56 h-56 rounded-full bg-indigo-500/20 blur-3xl animate-drift [animation-delay:-8s]" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-slate-300 mt-1">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
