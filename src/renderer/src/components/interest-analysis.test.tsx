// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InterestAnalysisDto } from '../../../shared/debt-contracts';
import { InterestAnalysis } from './interest-analysis';

const makeRow = (
  id: string,
  name: string,
  projected: string,
): InterestAnalysisDto['rows'][number] => ({
  debtId: id,
  debtName: name,
  debtType: 'business',
  currentBalance: '20000.00',
  currentInterestRate: '8.00%',
  interestPaidYtd: '100.00',
  projectedRemainingInterest: projected,
  shareOfPortfolioInterest: projected === '9000.00' ? '75.0%' : '25.0%',
  lumpSumSavings: {
    appliedAmount: '1000.00',
    directInterestSaved: '500.00',
    redirectedInterestSaved: '100.00',
    totalInterestSaved: '600.00',
  },
  monthlySavings: {
    appliedAmount: '100.00',
    directInterestSaved: '800.00',
    redirectedInterestSaved: '200.00',
    totalInterestSaved: '1000.00',
    monthsSaved: 4,
  },
  baselinePayoffDate: '2030-01-15',
  lumpSumPayoffDate: '2029-01-15',
  monthlyPayoffDate: '2028-01-15',
});

const analysis: InterestAnalysisDto = {
  effectiveDate: '2026-08-10',
  filters: { debtType: null, segment: 'all' },
  rows: [
    makeRow(
      '00000000-0000-4000-8000-000000000001',
      'Generated High Interest Debt',
      '9000.00',
    ),
    makeRow(
      '00000000-0000-4000-8000-000000000002',
      'Generated Lower Interest Debt',
      '3000.00',
    ),
  ],
  baselinePortfolioInterest: '12000.00',
  baselinePortfolioPayoffDate: '2030-01-15',
  interpretations: [
    {
      label: 'Highest current rate',
      debtId: '00000000-0000-4000-8000-000000000001',
      debtName: 'Generated High Interest Debt',
      value: '8.00%',
    },
    {
      label: 'Largest projected interest cost',
      debtId: '00000000-0000-4000-8000-000000000001',
      debtName: 'Generated High Interest Debt',
      value: '$9,000.00',
    },
    {
      label: 'Best $1,000 lump-sum savings',
      debtId: '00000000-0000-4000-8000-000000000001',
      debtName: 'Generated High Interest Debt',
      value: '$600.00',
    },
    {
      label: 'Best $100/month savings',
      debtId: '00000000-0000-4000-8000-000000000001',
      debtName: 'Generated High Interest Debt',
      value: '$1,000.00',
    },
  ],
  warnings: [],
};

describe('InterestAnalysis', () => {
  it('shows rankings, three charts, savings disclosures, and drill-through', () => {
    const onSelectDebt = vi.fn();
    render(
      <InterestAnalysis
        analysis={analysis}
        onFiltersChange={vi.fn()}
        onSelectDebt={onSelectDebt}
      />,
    );
    expect(screen.getByText('Interest-cost concentration')).toBeVisible();
    expect(
      screen.getByRole('img', { name: /Projected remaining interest/i }),
    ).toBeVisible();
    expect(
      screen.getByRole('img', { name: /\$1,000 lump-sum interest savings/i }),
    ).toBeVisible();
    expect(
      screen.getByRole('img', { name: /\$100\/month interest savings/i }),
    ).toBeVisible();
    expect(screen.getAllByText(/freed-up/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('8.00%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$9,000.00').length).toBeGreaterThan(0);
    expect(
      screen.getAllByTitle(/additional interest avoided on later debts/i).length,
    ).toBeGreaterThan(0);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Generated High Interest Debt' })[0]!,
    );
    expect(onSelectDebt).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });

  it('changes ranking and preserves filter changes', () => {
    const onFiltersChange = vi.fn();
    render(
      <InterestAnalysis
        analysis={analysis}
        onFiltersChange={onFiltersChange}
        onSelectDebt={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Interest ranking'), {
      target: { value: 'monthlySavings' },
    });
    expect(screen.getByLabelText('Interest ranking')).toHaveValue('monthlySavings');
    fireEvent.change(screen.getByLabelText('Portfolio segment filter'), {
      target: { value: 'revolving' },
    });
    expect(onFiltersChange).toHaveBeenCalledWith({
      debtType: null,
      segment: 'revolving',
    });
  });
});
