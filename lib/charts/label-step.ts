// How often to print an axis or value label so they never overlap: every
// `step`-th point gets one. Pure, so the thinning is testable without a DOM.
export function labelStep(pointCount: number, plotWidth: number, minGap: number) {
  if (pointCount <= 1 || plotWidth <= 0) return 1;
  const gap = plotWidth / (pointCount - 1);
  return Math.max(1, Math.ceil(minGap / gap));
}

/** Whether point i gets a label: every step-th from the end, so the newest point is always labelled. */
export function showLabel(i: number, pointCount: number, step: number) {
  return (pointCount - 1 - i) % step === 0;
}

/** Rough rendered width of a label at 11px in the app's sans font. */
export function estimateLabelWidth(text: string, charPx = 6.6) {
  return Math.ceil(text.length * charPx);
}

/**
 * Indices that get a label, aware of each label's width and anchoring: the first
 * point is start-anchored, the last end-anchored, the rest centred. Candidates come
 * every `step`-th point from the end; any candidate whose box would come within
 * `pad` px of the label to its right is dropped, so the edge labels never collide.
 */
export function labelledIndices(pointCount: number, plotWidth: number, labelWidth: number, pad = 6) {
  if (pointCount <= 0) return [];
  if (pointCount === 1) return [0];
  const gap = plotWidth / (pointCount - 1);
  const step = labelStep(pointCount, plotWidth, labelWidth + pad);
  const box = (i: number) => {
    const x = i * gap;
    if (i === 0) return [x, x + labelWidth];
    if (i === pointCount - 1) return [x - labelWidth, x];
    return [x - labelWidth / 2, x + labelWidth / 2];
  };
  const kept: number[] = [];
  for (let i = pointCount - 1; i >= 0; i--) {
    if (!showLabel(i, pointCount, step)) continue;
    const prev = kept[kept.length - 1];
    if (prev === undefined || box(i)[1] + pad <= box(prev)[0]) kept.push(i);
  }
  return kept.reverse();
}
