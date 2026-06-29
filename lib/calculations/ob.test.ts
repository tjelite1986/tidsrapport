import { describe, it, expect } from 'vitest';
import { calculateOB } from './ob';

// Butik OB boundaries (from the collective agreement, per docs/loneavvikelse-analys.md):
//   Mon–Fri 18:15–20:00 = 50%, 20:00+ = 70%
//   Saturday 12:00+ = 100%
//   Sunday / red day all day = 100%
// Anchor dates in Feb 2026 (no holidays that month):
//   2026-02-02 Monday, 2026-02-03 Tuesday, 2026-02-07 Saturday, 2026-02-08 Sunday
const RATE = 100; // round rate → OB amount is directly readable

describe('calculateOB — butik', () => {
  it('pays no OB for a weekday daytime shift', () => {
    const r = calculateOB('2026-02-03', '07:00', '14:00', 0, RATE, 'butik');
    expect(r.totalOBAmount).toBe(0);
    expect(r.obHours).toBe(0);
    expect(r.regularHours).toBeCloseTo(7, 5);
  });

  it('pays 50% between 18:15 and 20:00 on a weekday', () => {
    const r = calculateOB('2026-02-03', '14:00', '20:00', 0, RATE, 'butik');
    // 18:15–20:00 = 1.75h @ 50%
    expect(r.obHours).toBeCloseTo(1.75, 5);
    expect(r.totalOBAmount).toBeCloseTo(RATE * 0.5 * 1.75, 5); // 87.5
  });

  it('stacks 50% (18:15–20:00) and 70% (after 20:00) on a weekday', () => {
    const r = calculateOB('2026-02-03', '17:00', '21:00', 0, RATE, 'butik');
    // 1.75h @ 50% + 1.0h @ 70%
    expect(r.obHours).toBeCloseTo(2.75, 5);
    expect(r.totalOBAmount).toBeCloseTo(RATE * (0.5 * 1.75 + 0.7 * 1.0), 5); // 157.5
  });

  it('pays 100% after 12:00 on a Saturday only', () => {
    const r = calculateOB('2026-02-07', '10:00', '14:00', 0, RATE, 'butik');
    // 10–12 = 0%, 12–14 = 2h @ 100%
    expect(r.obHours).toBeCloseTo(2, 5);
    expect(r.totalOBAmount).toBeCloseTo(RATE * 1.0 * 2, 5); // 200
  });

  it('pays 100% all day on a Sunday', () => {
    const r = calculateOB('2026-02-08', '09:00', '13:00', 0, RATE, 'butik');
    expect(r.obHours).toBeCloseTo(4, 5);
    expect(r.totalOBAmount).toBeCloseTo(RATE * 1.0 * 4, 5); // 400
  });

  // Golden regression: real values from the production app (docs/ backup,
  // rate 162.98). These break IDs match the employer's payslip in the analysis.
  it('matches recorded production OB amounts (rate 162.98)', () => {
    // Mon 2026-02-02 11:00–20:15: 1.75h@50% + 0.25h@70% = 1.05 OB-equiv → 171.129
    expect(calculateOB('2026-02-02', '11:00', '20:15', 0, 162.98, 'butik').totalOBAmount)
      .toBeCloseTo(171.129, 2);
    // Sat 2026-02-07 09:00–15:00: 12:00–15:00 = 3h @ 100% → 488.94
    expect(calculateOB('2026-02-07', '09:00', '15:00', 0, 162.98, 'butik').totalOBAmount)
      .toBeCloseTo(488.94, 2);
  });
});
