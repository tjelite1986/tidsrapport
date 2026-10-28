// Reveals a round chart clockwise from 12 o'clock: a circle of radius r/2 with a
// stroke as wide as r covers the whole disc, and drawing that stroke sweeps it in.
export default function SweepMask({ id, cx, cy, r }: { id: string; cx: number; cy: number; r: number }) {
  return (
    <defs>
      <mask id={id}>
        <circle
          cx={cx}
          cy={cy}
          r={r / 2 + 1}
          fill="none"
          stroke="white"
          strokeWidth={r + 2}
          pathLength={1}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="animate-draw"
        />
      </mask>
    </defs>
  );
}
