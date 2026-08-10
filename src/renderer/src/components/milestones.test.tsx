// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MilestonesDto } from '../../../shared/debt-contracts';
import { Milestones } from './milestones';

const milestones: MilestonesDto = {
  effectiveDate: '2026-07-28',
  trackingStartDate: '2025-01-15',
  totalDebtReducedSinceTracking: '10000.00',
  debtReducedYtd: '2500.00',
  startingDebt: '100000.00',
  currentDebt: '90000.00',
  percentageStartingDebtRemaining: '90.0%',
  mortgageDebtReduced: '7000.00',
  nonmortgageDebtReduced: '3000.00',
  nextProjectedDebtPayoff: {
    debtId: '00000000-0000-4000-8000-000000000001',
    debtName: 'Generated Mortgage',
    projectedPayoffDate: '2027-01-01',
  },
  nextDebtReductionMilestone: '20000.00',
  nextDebtReductionMilestoneDate: '2027-03-01',
  interestPaidYtd: '750.00',
  interestSavedFromSelectedScenario: null,
  currentCreditUtilization: '42.0%',
  priorYearCreditUtilization: '50.0%',
  creditUtilizationChange: '-8.0 percentage points',
  selectedScenario: null,
  balanceHistory: [
    {
      date: '2025-01-31',
      totalPrincipalBalance: '100000.00',
      mortgagePrincipalBalance: '80000.00',
      nonmortgagePrincipalBalance: '20000.00',
    },
    {
      date: '2026-07-28',
      totalPrincipalBalance: '90000.00',
      mortgagePrincipalBalance: '73000.00',
      nonmortgagePrincipalBalance: '17000.00',
    },
  ],
  annualPrincipalReduction: [{ year: '2026', amount: '2500.00' }],
  annualInterestPaid: [{ year: '2026', amount: '750.00' }],
  scenarioComparison: [],
};

describe('Milestones', () => {
  it('shows payoff metrics, charts, scenario prompt, and debt drill-through', () => {
    const onSelectDebt = vi.fn();
    render(
      <Milestones
        milestones={milestones}
        onScenarioChange={vi.fn()}
        onSelectDebt={onSelectDebt}
        scenarios={[]}
        selectedScenarioId={null}
      />,
    );

    expect(screen.getByText('Debt payoff milestones')).toBeVisible();
    expect(screen.getByText('$10,000.00')).toBeVisible();
    expect(
      screen.getByRole('img', { name: /Total principal balance over time/i }),
    ).toBeVisible();
    expect(
      screen.getByText(/Select a saved payoff scenario to compare/i),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Generated Mortgage/ }));
    expect(onSelectDebt).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });
});
