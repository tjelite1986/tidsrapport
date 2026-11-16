import { describe, expect, it } from 'vitest';
import type { ComparisonRow } from './fields';
import { detailGroups, diffStatus, formatDiff, headlineRows, isMatch, monthBadge, offCount } from './compare-view';

const row = (key: string, group: ComparisonRow['group'], diff: number | null, unit: ComparisonRow['unit'] = 'currency'): ComparisonRow => ({
  key, label: key, unit, group, actual: diff === null ? null : 100, calculated: diff === null ? null : 100 - diff, diff,
});

describe('payslip compare view', () => {
  it('keeps the 0.60 kr tolerance on amounts and zero tolerance elsewhere', () => {
    expect(isMatch(0.6, 'currency')).toBe(true);
    expect(isMatch(0.61, 'currency')).toBe(false);
    expect(isMatch(0.01, 'hours')).toBe(false);
    expect(isMatch(0.001, 'rate')).toBe(true);
  });

  it('classifies rows', () => {
    expect(diffStatus(row('a', 'time', null))).toBe('none');
    expect(diffStatus(row('a', 'time', 0.2))).toBe('match');
    expect(diffStatus(row('a', 'time', -12))).toBe('off');
  });

  it('formats signed diffs with a real minus sign', () => {
    expect(formatDiff(0, 'currency')).toBe('0,00 kr');
    expect(formatDiff(-12.5, 'hours')).toBe('−12,5 h');
    expect(formatDiff(1234.5, 'currency').replace(/\s/g, ' ')).toBe('+1 234,50 kr');
  });

  it('puts gross, tax and net in headline order and keeps them out of the detail groups', () => {
    const comparison = [row('netPay', 'summary', 0), row('basePay', 'earnings', 5), row('tax', 'summary', 1), row('grossPay', 'summary', 2), row('workHours', 'time', 0, 'hours')];
    expect(headlineRows(comparison).map((r) => r.key)).toEqual(['grossPay', 'tax', 'netPay']);
    const groups = detailGroups(comparison);
    expect(groups.map((g) => g.group)).toEqual(['time', 'earnings']);
    expect(groups.flatMap((g) => g.rows.map((r) => r.key))).toEqual(['workHours', 'basePay']);
  });

  it('skips headline rows that are missing', () => {
    expect(headlineRows([row('tax', 'summary', 0)]).map((r) => r.key)).toEqual(['tax']);
  });

  it('counts only rows that are off', () => {
    expect(offCount([row('a', 'time', null), row('b', 'earnings', 0.3), row('c', 'earnings', 4), row('d', 'summary', -1)])).toBe(2);
  });

  it('claims a match only when gross, tax and net were all compared and nothing is off', () => {
    const all = [row('grossPay', 'summary', 0), row('tax', 'summary', 0.4), row('netPay', 'summary', 0)];
    expect(monthBadge(all)).toEqual({ kind: 'match' });
    expect(monthBadge([...all, row('basePay', 'earnings', 12)])).toEqual({ kind: 'off', count: 1 });
  });

  it('shows a partial badge when a headline amount was not compared', () => {
    expect(monthBadge([row('grossPay', 'summary', 0), row('tax', 'summary', null), row('netPay', 'summary', 0)])).toEqual({ kind: 'partial' });
    expect(monthBadge([row('grossPay', 'summary', 0), row('netPay', 'summary', 0)])).toEqual({ kind: 'partial' });
  });

  it('shows no badge when nothing was compared', () => {
    expect(monthBadge([row('grossPay', 'summary', null), row('tax', 'summary', null), row('netPay', 'summary', null)])).toEqual({ kind: 'none' });
    expect(monthBadge([])).toEqual({ kind: 'none' });
  });
});
