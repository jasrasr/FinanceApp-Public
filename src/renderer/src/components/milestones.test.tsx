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
  nextDebtBalanceMilestone: '90000.00',
  dollarsRemainingToNextDebtBalanceMilestone: '0.00',
  percentProgressFromPriorDebtBalanceMilestone: '100.0%',
  interestPaidYtd: '750.00',
  interestSavedFromSelectedScenario: null,
  currentCreditUtilization: '42.0%',
  priorYearCreditUtilization: '50.0%',
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
  baselinePayoffDate: null,
  selectedScenarioPayoffDate: null,
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
    expect(screen.getByText('$90,000.00')).toBeVisible();
    expect(screen.getByText('$0.00 remaining')).toBeVisible();
    expect(screen.getByText('42.0% current')).toBeVisible();
    expect(screen.getByText('Down from 50.0% prior year')).toBeVisible();
    expect(
      screen.getByRole('img', { name: /Total principal balance over time/i }),
    ).toBeVisible();
    expect(
      screen.getByText(/Select a saved payoff scenario to compare/i),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Generated Mortgage/ }));
    expect(onSelectDebt).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });

  it('renders the complete actual, baseline, and selected outlook with payoff markers', () => {
    const scenarioId = '00000000-0000-4000-8000-000000000099';
    render(
      <Milestones
        milestones={{
          ...milestones,
          selectedScenario: { id: scenarioId, name: 'Generated selected scenario' },
          baselinePayoffDate: '2026-09-28',
          selectedScenarioPayoffDate: '2026-08-28',
          scenarioComparison: [
            {
              date: '2026-07-28',
              actualPrincipalBalance: '90000.00',
              baselinePrincipalBalance: '90000.00',
              selectedScenarioPrincipalBalance: '90000.00',
            },
            {
              date: '2026-08-28',
              actualPrincipalBalance: null,
              baselinePrincipalBalance: '85000.00',
              selectedScenarioPrincipalBalance: '0.00',
            },
            {
              date: '2026-09-28',
              actualPrincipalBalance: null,
              baselinePrincipalBalance: '0.00',
              selectedScenarioPrincipalBalance: null,
            },
          ],
        }}
        onScenarioChange={vi.fn()}
        onSelectDebt={vi.fn()}
        scenarios={[]}
        selectedScenarioId={scenarioId}
      />,
    );

    expect(
      screen.getByRole('img', { name: /Actual balance and payoff projections/i }),
    ).toBeVisible();
    const outlook = screen.getByRole('img', {
      name: /Actual balance and payoff projections/i,
    });
    expect(
      [...outlook.querySelectorAll('title')].filter((title) =>
        title.textContent?.includes('Required payments only'),
      ),
    ).toHaveLength(3);
    expect(
      [...outlook.querySelectorAll('title')].filter((title) =>
        title.textContent?.includes('Selected scenario'),
      ),
    ).toHaveLength(2);
    expect(screen.getByText('Baseline payoff')).toBeVisible();
    expect(screen.getByText('Selected payoff')).toBeVisible();
  });
});
