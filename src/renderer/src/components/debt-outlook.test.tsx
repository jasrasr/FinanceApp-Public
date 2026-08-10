// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DebtOutlookDto } from '../../../shared/debt-contracts';
import { DebtOutlook } from './debt-outlook';

const outlook: DebtOutlookDto = {
  effectiveDate: '2026-07-27',
  scenario: { id: null, name: 'Required payments only' },
  months: [
    '2026-07-01',
    '2026-08-01',
    '2026-09-01',
    '2026-10-01',
    '2026-11-01',
    '2026-12-01',
    '2027-01-01',
    '2027-02-01',
    '2027-03-01',
    '2027-04-01',
    '2027-05-01',
    '2027-06-01',
  ].map((month, index) => ({
    month,
    requiredPayments: '1000.00',
    plannedExtraPayments: '0.00',
    totalDebtService: '1000.00',
    debtPayoffs: [],
    details:
      index === 0
        ? [
            {
              debtId: '00000000-0000-4000-8000-000000000001',
              debtName: 'Generated Outlook Debt',
              dueDate: '2026-07-15',
              requiredPayment: '1000.00',
              plannedExtraPayment: '0.00',
              totalPlannedPayment: '1000.00',
              projectedEndingBalance: '19000.00',
            },
          ]
        : [],
  })),
  events: [
    {
      date: '2026-09-15',
      debtId: '00000000-0000-4000-8000-000000000001',
      debtName: 'Generated Outlook Debt',
      eventType: 'rate_change',
      description: 'Interest rate changes.',
    },
  ],
  requiredPaymentsTotal: '12000.00',
  plannedExtraPaymentsTotal: '0.00',
  totalPlannedDebtService: '12000.00',
  averageMonthlyDebtService: '1000.00',
  highestPaymentMonth: { month: '2026-07-01', amount: '1000.00' },
  lowestPaymentMonth: { month: '2026-07-01', amount: '1000.00' },
  projectedDebtPayoffCount: 0,
  warnings: [],
};

describe('DebtOutlook', () => {
  it('shows twelve months, required-only planning, details, events, and drill-through', () => {
    const onSelectDebt = vi.fn();
    render(
      <DebtOutlook
        outlook={outlook}
        scenarios={[]}
        selectedScenarioId={null}
        onScenarioChange={vi.fn()}
        onSelectDebt={onSelectDebt}
      />,
    );
    expect(screen.getByText('Debt outlook')).toBeVisible();
    expect(
      screen.getByRole('img', { name: /12-month projected debt service/i }),
    ).toBeVisible();
    expect(screen.getAllByText(/2026|2027/).length).toBeGreaterThan(12);
    expect(
      screen.getAllByRole('button', { name: 'Generated Outlook Debt' }),
    ).toHaveLength(2);
    expect(screen.getAllByText(/rate change/)).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Generated Outlook Debt' })[0]!,
    );
    expect(onSelectDebt).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });

  it('renders selected scenario extra payments and selection control', () => {
    const scenarioId = '00000000-0000-4000-8000-000000000099';
    const onScenarioChange = vi.fn();
    render(
      <DebtOutlook
        outlook={{
          ...outlook,
          scenario: { id: scenarioId, name: 'Generated extra scenario' },
          plannedExtraPaymentsTotal: '1200.00',
          totalPlannedDebtService: '13200.00',
          months: outlook.months.map((month, index) =>
            index === 0
              ? {
                  ...month,
                  plannedExtraPayments: '100.00',
                  totalDebtService: '1100.00',
                }
              : month,
          ),
        }}
        scenarios={[{ id: scenarioId, name: 'Generated extra scenario' } as never]}
        selectedScenarioId={scenarioId}
        onScenarioChange={onScenarioChange}
        onSelectDebt={vi.fn()}
      />,
    );
    expect(screen.getByText('$1,200.00')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Planning basis'), {
      target: { value: '' },
    });
    expect(onScenarioChange).toHaveBeenCalledWith(null);
  });
});
