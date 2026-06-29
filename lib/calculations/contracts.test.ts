import { describe, it, expect } from 'vitest';
import { resolveHourlyRate } from './contracts';

// Shared rate resolver used by BOTH pay.ts and the calendar-data route, so the
// per-entry display rate (Snittlön) and the salary calc can never drift apart.
describe('resolveHourlyRate', () => {
  const rateHistory = [
    { effectiveFrom: '2000-01-01', hourlyRate: 162.98 },
    { effectiveFrom: '2026-05-01', hourlyRate: 168.73 },
    { effectiveFrom: '2026-06-01', hourlyRate: 175.64 },
  ];

  it('prefers the date-effective history over the flat rate and contract table', () => {
    const opts = { rateHistory, flatRate: 168.73, contractLevel: '2ar' };
    expect(resolveHourlyRate('2026-04-30', opts)).toBeCloseTo(162.98, 5);
    expect(resolveHourlyRate('2026-05-15', opts)).toBeCloseTo(168.73, 5);
    // Regression: a June entry must use 175.64, not the generic 2ar table rate (167.87)
    expect(resolveHourlyRate('2026-06-29', opts)).toBeCloseTo(175.64, 5);
  });

  it('falls back to the flat rate when no history is present', () => {
    expect(resolveHourlyRate('2026-06-29', { flatRate: 168.73, contractLevel: '2ar' }))
      .toBeCloseTo(168.73, 5);
  });

  it('falls back to the contract table when neither history nor flat rate exist', () => {
    // 2ar table rate effective 2026-04-01 is 167.87
    expect(resolveHourlyRate('2026-06-29', { contractLevel: '2ar' })).toBeCloseTo(167.87, 5);
  });
});
