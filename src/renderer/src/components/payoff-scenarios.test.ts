import { describe, expect, it } from 'vitest';
import {
  buildPayoffChartDateDomain,
  buildPayoffChartTickIndexes,
  buildPayoffPrincipalBalanceScale,
} from './chart-helpers';

describe('payoff scenario chart domain', () => {
  it('builds one chronological date domain across different series lengths', () => {
    const dates = buildPayoffChartDateDomain([
      {
        monthlySchedule: [
          { month: '2026-08-01' },
          { month: '2028-05-01' },
          { month: '2030-02-01' },
        ],
      },
      {
        monthlySchedule: [
          { month: '2026-08-01' },
          { month: '2031-10-01' },
          { month: '2033-07-01' },
        ],
      },
    ]);

    expect(dates).toEqual([
      '2026-08-01',
      '2028-05-01',
      '2030-02-01',
      '2031-10-01',
      '2033-07-01',
    ]);
    const ticks = buildPayoffChartTickIndexes(dates);
    expect(dates[ticks[0]!]).toBe('2026-08-01');
    expect(dates[ticks[ticks.length - 1]!]).toBe('2033-07-01');
    expect(ticks).toEqual([...ticks].sort((left, right) => left - right));
  });

  it('uses rounded major currency units and multiple labels for balances', () => {
    const scale = buildPayoffPrincipalBalanceScale({
      values: [250_000, 300_000, 350_000],
      chartHeight: 266,
      formatLabel: (value) => `$${value.toFixed(0)}`,
    });

    expect(scale.minimum).toBe(0);
    expect(scale.maximum).toBe(400_000);
    expect(scale.tickValues.length).toBeGreaterThanOrEqual(4);
    expect(scale.tickValues.length).toBeLessThanOrEqual(7);
    expect(scale.majorUnit).toBeGreaterThan(0);
    expect(scale.formattedLabels).toContain('$300000');
  });

  it('tops a mid-$500,000 range at a sensible $600,000', () => {
    const scale = buildPayoffPrincipalBalanceScale({
      values: [520_000, 550_000],
      chartHeight: 266,
      formatLabel: (value) => `$${value.toFixed(0)}`,
    });

    expect(scale.minimum).toBe(0);
    expect(scale.maximum).toBe(600_000);
    expect(scale.tickValues).toContain(0);
    expect(scale.tickValues).toContain(600_000);
  });
});
