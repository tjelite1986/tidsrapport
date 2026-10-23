// Shown instead of a chart whose values are all zero, so an empty year reads as "no data" and not as a broken chart
export default function EmptyChart({ title, height = 160 }: { title?: string; height?: number }) {
  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>}
      <div
        className="flex items-center justify-center rounded-lg bg-gray-50 border border-dashed border-gray-200 text-sm text-gray-400"
        style={{ height }}
      >
        Ingen data än
      </div>
    </div>
  );
}
