import { describe, expect, it } from 'vitest';
import { estimateLabelWidth, labelStep, labelledIndices, showLabel } from './label-step';

describe('chart label thinning', () => {
  it('labels every point when there is room', () => {
    expect(labelStep(12, 600, 36)).toBe(1);
  });
  it('thins 24 months on a 320px phone', () => {
    const step = labelStep(24, 300, 36);
    expect(step).toBe(3);
    const shown = Array.from({ length: 24 }, (_, i) => i).filter((i) => showLabel(i, 24, step));
    expect(shown.at(-1)).toBe(23);
    // neighbouring labels are at least minGap apart
    expect((300 / 23) * step).toBeGreaterThanOrEqual(36);
  });
  it('handles degenerate input', () => {
    expect(labelStep(1, 300, 36)).toBe(1);
    expect(labelStep(5, 0, 36)).toBe(1);
  });
});

describe('labelledIndices', () => {
  const boxes = (n: number, w: number, lw: number, idx: number[]) => {
    const gap = w / (n - 1);
    return idx.map((i) => {
      const x = i * gap;
      return i === 0 ? [x, x + lw] : i === n - 1 ? [x - lw, x] : [x - lw / 2, x + lw / 2];
    });
  };
  it('keeps the newest point and never overlaps wide month-year labels', () => {
    // 20 months of "Okt 2026"-style labels on a 390px phone chart (~318px plot).
    const lw = estimateLabelWidth('Okt 2026');
    const idx = labelledIndices(20, 318, lw);
    expect(idx.at(-1)).toBe(19);
    const b = boxes(20, 318, lw, idx);
    for (let k = 1; k < b.length; k++) expect(b[k][0] - b[k - 1][1]).toBeGreaterThanOrEqual(6);
  });
  it('labels everything when there is room', () => {
    expect(labelledIndices(6, 600, 20)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('handles degenerate input', () => {
    expect(labelledIndices(0, 300, 40)).toEqual([]);
    expect(labelledIndices(1, 300, 40)).toEqual([0]);
  });
});
