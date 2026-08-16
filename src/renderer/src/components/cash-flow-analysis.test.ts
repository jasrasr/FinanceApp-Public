import { describe, expect, it } from 'vitest';
import { normalizeCashFlowChartValue } from './chart-helpers';

describe('cash-flow debt-service chart values', () => {
  it('normalizes a 0.667 ratio to 66.7 percent and preserves formatted percentages', () => {
    expect(normalizeCashFlowChartValue('0.667', true)).toBeCloseTo(66.7, 5);
    expect(normalizeCashFlowChartValue('66.7%', true)).toBeCloseTo(66.7, 5);
    expect(normalizeCashFlowChartValue(null, true)).toBeNull();
  });
});
