// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppBridge } from '../../shared/app-bridge';
import type {
  DashboardDto,
  DataHealthDto,
  MilestonesDto,
  DebtReportsDto,
  DebtDetailDto,
  DebtSummaryDto,
  PayoffBaselineDto,
  PayoffScenarioDto,
} from '../../shared/debt-contracts';
import { App } from './app';
import {
  buildChartScale,
  debtSeriesColor,
  interestYearTreatment,
} from './components/chart-helpers';
import { formatLastChanged } from './components/display-format';
import { RecordBalanceReconciliationForm } from './components/record-balance-reconciliation-form';
import { RecordTransactionForm } from './components/record-transaction-form';

const createBridge = (): AppBridge => ({
  appName: 'Debt Tracker',
  bridgeVersion: 24,
  appMetadata: {
    version: '1.5.2',
    lastChangedAtUtc: '2026-08-10T00:00:00.000Z',
  },
  listDebts: vi.fn(async () => ({ ok: true as const, value: [] })),
  getDashboard: vi.fn(async () => ({ ok: true as const, value: sampleDashboard })),
  getDataHealth: vi.fn(async () => ({ ok: true as const, value: sampleDataHealth })),
  getMilestones: vi.fn(async () => ({ ok: true as const, value: sampleMilestones })),
  acceptCurrentBalance: vi.fn(async () => ({
    ok: true as const,
    value: sampleDebtDetail,
  })),
  getDataManagementStatus: vi.fn(async () => ({
    ok: true as const,
    value: sampleDataManagementStatus,
  })),
  createManualBackup: vi.fn(async () => ({
    ok: true as const,
    value: {
      ...sampleDataManagementStatus,
      lastBackup: {
        status: 'succeeded' as const,
        message: 'Backup completed and passed SQLite integrity checks.',
        completedAtUtc: '2026-07-28T13:45:00.000Z',
        backup: sampleDataManagementStatus.availableBackups[0]!,
      },
    },
  })),
  restoreBackup: vi.fn(async () => ({
    ok: true as const,
    value: {
      ...sampleDataManagementStatus,
      lastRestore: {
        status: 'succeeded' as const,
        message: 'Restore completed from a validated backup.',
        completedAtUtc: '2026-07-28T13:46:00.000Z',
        backup: sampleDataManagementStatus.availableBackups[0]!,
      },
    },
  })),
  deleteBackup: vi.fn(async () => ({
    ok: true as const,
    value: { ...sampleDataManagementStatus, availableBackups: [] },
  })),
  exportData: vi.fn(async () => ({
    ok: true as const,
    value: {
      status: 'succeeded' as const,
      exportedAtUtc: '2026-07-28T13:47:00.000Z',
      exportDirectoryDisplayPath: 'C:\\Generated\\Exports\\debt-tracker-export',
      fileCount: 12,
      format: 'csv' as const,
      message: 'Export completed.',
    },
  })),
  getDebtReports: vi.fn(async () => ({ ok: true as const, value: sampleReports })),
  createPayoffScenario: vi.fn(async () => ({
    ok: true as const,
    value: samplePayoffScenario,
  })),
  calculateExtraCashAllocation: vi.fn(),
  calculatePayoffBaseline: vi.fn(async () => ({
    ok: true as const,
    value: {
      ...samplePayoffScenario,
      id: 'generated-required-payments-baseline' as const,
      name: 'Required payments only' as const,
      strategy: 'baseline' as const,
      extraMonthlyPayment: '0.00' as const,
      lumpSum: '0.00' as const,
    } as PayoffBaselineDto,
  })),
  listPayoffScenarios: vi.fn(async () => ({ ok: true as const, value: [] })),
  getPayoffScenario: vi.fn(async () => ({
    ok: true as const,
    value: samplePayoffScenario,
  })),
  rerunPayoffScenario: vi.fn(async () => ({
    ok: true as const,
    value: samplePayoffScenario,
  })),
  archivePayoffScenario: vi.fn(async () => ({
    ok: true as const,
    value: { ...samplePayoffScenario, status: 'archived' as const },
  })),
  renamePayoffScenario: vi.fn(),
  getDebt: vi.fn(),
  createDebt: vi.fn(),
  updateDebt: vi.fn(),
  addDebtTerm: vi.fn(),
  createDebtTransaction: vi.fn(),
  editDebtTransaction: vi.fn(),
  reverseDebtTransaction: vi.fn(),
  voidDebtTransaction: vi.fn(),
  createBalanceSnapshot: vi.fn(),
  createBalanceReconciliation: vi.fn(),
  voidBalanceReconciliation: vi.fn(),
  archiveDebt: vi.fn(),
  restoreDebt: vi.fn(),
  recordRefinance: vi.fn(async () => ({
    ok: true as const,
    value: {
      ...sampleDebtDetail,
      maturityDate: '2056-07-01',
      minimumPayment: '2150.00',
      updatedAtUtc: '2026-07-28T13:50:00.000Z',
      refinanceEvents: [
        {
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c071',
          debtId: sampleDebtDetail.id,
          refinanceDate: '2026-07-01',
          preRefinancePrincipal: '124600.00',
          lenderPayoffBalance: '124600.00',
          newRefinancedPrincipal: '130000.00',
          principalChange: '5400.00',
          financedFees: '2500.00',
          cashFees: '750.00',
          escrowHandling: 'carry_forward' as const,
          escrowAmount: null,
          priorTermId: sampleDebtDetail.currentTerm.id,
          newTermId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c072',
          principalTransactionId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c073',
          cashFeeTransactionId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c074',
          escrowTransactionId: null,
          notes: 'Generated refinance event.',
          createdAtUtc: '2026-07-28T13:50:00.000Z',
          updatedAtUtc: '2026-07-28T13:50:00.000Z',
        },
      ],
    },
  })),
  deleteDebtPermanently: vi.fn(async () => ({
    ok: true as const,
    value: {
      deletedDebtId: sampleDebtDetail.id,
      deletedDebtName: sampleDebtDetail.name,
      backupId: sampleDataManagementStatus.availableBackups[0]!.id,
    },
  })),
  confirmScheduledPayment: vi.fn(),
  removeScheduledPaymentConfirmation: vi.fn(),
});

const sampleDashboard: DashboardDto = {
  effectiveDate: '2026-07-28',
  yearToDateStartDate: '2026-01-01',
  activeDebtCount: 1,
  totals: {
    activeDebt: '124500.00',
    principalReductionYtd: '400.00',
    newBorrowingsYtd: '0.00',
    interestActivityYtd: '100.00',
    escrowBalance: '300.00',
    requiredMonthlyPayments: '2450.00',
    weightedAverageInterestRate: '5.49',
    creditCardBalances: '0.00',
    availableCredit: '0.00',
    creditUtilizationPercent: null,
    creditCardOverLimit: '0.00',
  },
  metricBasis: {
    activeDebt:
      'Application-calculated ledger balances for active debts as of 2026-07-28.',
    principalReductionYtd:
      'Net principal allocations from posted activity dated 2026-01-01 through 2026-07-28.',
    newBorrowingsYtd:
      'Posted borrowing transaction totals dated 2026-01-01 through 2026-07-28.',
    interestActivityYtd:
      'Positive interest expense dated 2026-01-01 through 2026-07-28.',
    escrowBalance: 'Calculated escrow balances as of 2026-07-28.',
    requiredMonthlyPayments: 'Current effective debt terms as of 2026-07-28.',
    weightedAverageInterestRate:
      'Current annual rates weighted by calculated ledger balances.',
    creditCardBalances: 'Active credit-card balances as of 2026-07-28.',
    availableCredit: 'Active credit-card limits less balances as of 2026-07-28.',
    creditUtilizationPercent:
      'Active credit-card balances divided by active credit limits.',
    creditCardOverLimit: 'Active credit-card balances over stated limits.',
  },
  creditCardPortfolio: {
    details: [],
    reviewItems: [],
  },
  upcomingPayments: [],
  schedulingReviewItems: [],
  upcomingMaturities: [],
  escrowBalances: [
    {
      debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
      debtName: 'Fictional Equipment Note',
      creditor: 'Harbor Ridge Cooperative',
      amount: '300.00',
      effectiveDate: '2026-07-28',
      basis: 'Calculated escrow balance.',
    },
  ],
  attentionItems: [],
};

const sampleDataHealth: DataHealthDto = {
  effectiveDate: '2026-07-28',
  counts: { current: 0, review: 0, attention: 0 },
  rows: [],
};

const sampleMilestones: MilestonesDto = {
  effectiveDate: '2026-07-28',
  trackingStartDate: '2025-01-15',
  totalDebtReducedSinceTracking: '400.00',
  debtReducedYtd: '400.00',
  startingDebt: '125000.13',
  currentDebt: '124600.13',
  percentageStartingDebtRemaining: '99.7%',
  mortgageDebtReduced: '0.00',
  nonmortgageDebtReduced: '400.00',
  nextProjectedDebtPayoff: null,
  nextDebtBalanceMilestone: '120000.00',
  dollarsRemainingToNextDebtBalanceMilestone: '4600.13',
  percentProgressFromPriorDebtBalanceMilestone: '54.0%',
  interestPaidYtd: '100.00',
  interestSavedFromSelectedScenario: null,
  currentCreditUtilization: null,
  priorYearCreditUtilization: null,
  selectedScenario: null,
  balanceHistory: [],
  annualPrincipalReduction: [],
  annualInterestPaid: [],
  baselinePayoffDate: null,
  selectedScenarioPayoffDate: null,
  scenarioComparison: [],
};

const sampleDataManagementStatus = {
  backupDirectoryDisplayPath: 'C:\\Generated\\Debt Tracker\\backups',
  lastSuccessfulBackupAtUtc: '2026-07-28T13:44:00.000Z',
  availableBackups: [
    {
      id: 'manual-2026-07-28T134400-000Z.sqlite3',
      fileName: 'manual-2026-07-28T134400-000Z.sqlite3',
      kind: 'manual' as const,
      createdAtUtc: '2026-07-28T13:44:00.000Z',
      sizeBytes: 131072,
      integrityStatus: 'valid' as const,
    },
  ],
  lastBackup: {
    status: 'not_run' as const,
    message: 'No operation has been run in this session.',
    completedAtUtc: null,
    backup: null,
  },
  lastRestore: {
    status: 'not_run' as const,
    message: 'No operation has been run in this session.',
    completedAtUtc: null,
    backup: null,
  },
};

const sampleReportBasis = {
  title: 'Generated report section',
  effectiveDate: '2026-07-28',
  dateRange: '2026-01-01 through 2026-07-28',
  balanceBasis:
    'Application-calculated ledger balances from posted actual activity; confirmed snapshots and scenario results are labeled separately.',
  assumptions: ['Generated report assumptions for testing.'],
  warnings: [],
};

const sampleReports: DebtReportsDto = {
  filters: {
    startDate: '2026-01-01',
    endDate: '2026-07-28',
    effectiveDate: '2026-07-28',
    debtId: null,
    ownerEntity: null,
    debtType: null,
    status: null,
  },
  monthlyRollforward: {
    basis: sampleReportBasis,
    rows: [
      {
        period: '2026-01',
        beginningBalance: '125000.13',
        borrowings: '0.00',
        payments: '500.00',
        principalReduction: '400.00',
        interestActivity: '100.00',
        adjustmentsAndOther: '0.00',
        rollforwardCheck: '0.00',
        endingBalance: '124600.13',
      },
    ],
  },
  annualRollforward: {
    basis: sampleReportBasis,
    rows: [
      {
        period: '2026',
        beginningBalance: '125000.13',
        borrowings: '0.00',
        payments: '500.00',
        principalReduction: '400.00',
        interestActivity: '100.00',
        adjustmentsAndOther: '0.00',
        rollforwardCheck: '0.00',
        endingBalance: '124600.13',
      },
    ],
  },
  balanceHistory: {
    basis: sampleReportBasis,
    rows: [
      {
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
        debtName: 'Fictional Equipment Note',
        creditor: 'Harbor Ridge Cooperative',
        effectiveDate: '2026-01-31',
        calculatedBalance: '124600.13',
        confirmedBalance: null,
        basis:
          'Calculated ending principal and latest confirmed snapshot are shown separately.',
      },
      {
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
        debtName: 'Fictional Equipment Note',
        creditor: 'Harbor Ridge Cooperative',
        effectiveDate: '2026-02-28',
        calculatedBalance: '124200.13',
        confirmedBalance: null,
        basis:
          'Calculated ending principal and latest confirmed snapshot are shown separately.',
      },
      {
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
        debtName: 'Fictional Equipment Note',
        creditor: 'Harbor Ridge Cooperative',
        effectiveDate: '2026-03-31',
        calculatedBalance: '123800.13',
        confirmedBalance: '123800.00',
        basis:
          'Calculated ending principal and latest confirmed snapshot are shown separately.',
      },
      {
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c002',
        debtName: 'Generated Home Mortgage',
        creditor: 'Northwind Bank',
        effectiveDate: '2026-01-31',
        calculatedBalance: '250000.00',
        confirmedBalance: null,
        basis:
          'Calculated ending principal and latest confirmed snapshot are shown separately.',
      },
      {
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c002',
        debtName: 'Generated Home Mortgage',
        creditor: 'Northwind Bank',
        effectiveDate: '2026-02-28',
        calculatedBalance: '249000.00',
        confirmedBalance: null,
        basis:
          'Calculated ending principal and latest confirmed snapshot are shown separately.',
      },
      {
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c002',
        debtName: 'Generated Home Mortgage',
        creditor: 'Northwind Bank',
        effectiveDate: '2026-03-31',
        calculatedBalance: '248000.00',
        confirmedBalance: null,
        basis:
          'Calculated ending principal and latest confirmed snapshot are shown separately.',
      },
    ],
  },
  activityTrends: {
    basis: sampleReportBasis,
    rows: [
      {
        period: '2026-01',
        principalReduction: '400.00',
        interestActivity: '100.00',
        borrowings: '0.00',
        payments: '500.00',
      },
      {
        period: '2026-02',
        principalReduction: '390.00',
        interestActivity: '110.00',
        borrowings: '0.00',
        payments: '500.00',
      },
      {
        period: '2026-03',
        principalReduction: '410.00',
        interestActivity: '90.00',
        borrowings: '0.00',
        payments: '500.00',
      },
    ],
    annualInterestByDebt: [
      {
        year: '2026',
        debtId: '00000000-0000-4000-8000-000000000001',
        debtName: 'Generated Home Mortgage',
        interestExpense: '1200.00',
      },
    ],
  },
  balanceTrends: {
    basis: sampleReportBasis,
    rows: [
      {
        period: '2026-01',
        periodEndDate: '2026-01-31',
        grouping: 'Total debt',
        refinanceDate: null,
        endingBalance: '124500.13',
        changeFromPriorPeriod: null,
      },
    ],
  },
  maturitySchedule: {
    basis: sampleReportBasis,
    rows: [
      {
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
        debtName: 'Fictional Equipment Note',
        creditor: 'Harbor Ridge Cooperative',
        ownerEntity: 'Generated Example Entity',
        debtType: 'business',
        status: 'active',
        maturityDate: '2030-01-15',
        requiredMonthlyPayment: '2450.00',
        currentInterestRate: '5.49',
        calculatedBalance: '124500.13',
        basis: 'Current effective term and application-calculated ledger balance.',
      },
    ],
  },
  reconciliationAndDataQuality: {
    basis: sampleReportBasis,
    rows: [
      {
        severity: 'warning',
        category: 'reconciliation',
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
        debtName: 'Fictional Equipment Note',
        effectiveDate: '2026-01-31',
        message: 'Generated reconciliation item requiring review.',
        sourceId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c051',
      },
    ],
  },
};

const samplePayoffScenario: PayoffScenarioDto = {
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Generated avalanche scenario',
  strategy: 'avalanche',
  status: 'active',
  scenarioStartDate: '2026-07-28',
  extraMonthlyPayment: '250.00',
  lumpSum: '0.00',
  customPriority: [],
  variableRateOverrides: {},
  maxProjectionMonths: 360,
  result: {
    calculationEngineVersion: 'payoff-engine-v2',
    scenarioStartDate: '2026-07-28',
    projectedPayoffDate: '2030-06-28',
    totalProjectedInterest: '11250.00',
    monthlyCashRequirement: '2700.00',
    baselineInterest: '12500.00',
    interestSavings: '1250.00',
    assumptions: [
      'Uses application-calculated ledger balances as of the scenario start date.',
      'Projected activity is scenario-only and is not written to the posted ledger.',
    ],
    warnings: [],
    monthlySchedule: [
      {
        month: '2026-07-28',
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
        debtName: 'Fictional Equipment Note',
        requiredPayment: '2450.00',
        extraPayment: '250.00',
        totalPayment: '2700.00',
        endingProjectedBalance: '121800.00',
        totalProjectedBalance: '121800.00',
        paidOffDebtName: null,
        nextPriorityDebtName: 'Fictional Equipment Note',
      },
    ],
    payoffOrder: [
      {
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
        debtName: 'Fictional Equipment Note',
        priority: 1,
        projectedPayoffDate: '2030-06-28',
        monthsToPayoff: 47,
        projectedInterest: '11250.00',
        interestSaved: '1250.00',
      },
    ],
    monthsSaved: 6,
    debts: [
      {
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
        debtName: 'Fictional Equipment Note',
        creditor: 'Harbor Ridge Cooperative',
        startingBalance: '124500.00',
        projectionStatus: 'projected',
        projectedPayoffDate: '2030-06-28',
        projectedInterest: '11250.00',
        requiredMonthlyPayment: '2450.00',
        warnings: [],
      },
    ],
  },
  calculationEngineVersion: 'payoff-engine-v2',
  createdAtUtc: '2026-07-28T13:00:00.000Z',
  updatedAtUtc: '2026-07-28T13:00:00.000Z',
  archivedAtUtc: null,
};

const unsupportedPayoffScenario: PayoffScenarioDto = {
  ...samplePayoffScenario,
  id: '88888888-8888-4888-8888-888888888888',
  name: 'Generated unsupported scenario',
  result: {
    ...samplePayoffScenario.result,
    projectedPayoffDate: null,
    totalProjectedInterest: '0.00',
    baselineInterest: '0.00',
    interestSavings: '0.00',
    warnings: ['One or more debts are unsupported and excluded from scenario totals.'],
    debts: [
      {
        ...samplePayoffScenario.result.debts[0]!,
        projectionStatus: 'unsupported',
        projectedPayoffDate: null,
        projectedInterest: null,
        warnings: [
          'Payment frequency irregular is not yet supported for reliable payoff projection.',
        ],
      },
    ],
  },
};

const longRangeInterestReports = (): DebtReportsDto => {
  const rows: DebtReportsDto['activityTrends']['rows'] = [];
  const annualTotals = new Map<string, number>();
  const interestByPeriod = new Map<string, number>([
    ['2019-01', 125],
    ['2020-04', 150],
    ['2021-07', 175],
    ['2022-10', 200],
    ['2023-05', 225],
    ['2024-02', 250],
    ['2025-08', 275],
    ['2026-03', 300],
  ]);

  for (let year = 2019; year <= 2026; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      if (year === 2026 && month > 3) break;
      const period = `${year}-${String(month).padStart(2, '0')}`;
      const interest = interestByPeriod.get(period) ?? 0;
      annualTotals.set(String(year), (annualTotals.get(String(year)) ?? 0) + interest);
      rows.push({
        period,
        principalReduction: '0.00',
        interestActivity: interest.toFixed(2),
        borrowings: '0.00',
        payments: interest === 0 ? '0.00' : interest.toFixed(2),
      });
    }
  }

  return {
    ...sampleReports,
    activityTrends: {
      basis: {
        ...sampleReportBasis,
        dateRange: '2019-01-01 through 2026-03-31',
      },
      rows,
      annualInterestByDebt: [...annualTotals.entries()]
        .filter(([, total]) => total !== 0)
        .map(([year, total]) => ({
          year,
          debtId: '00000000-0000-4000-8000-000000000001',
          debtName: 'Generated Home Mortgage',
          interestExpense: total.toFixed(2),
        })),
    },
  };
};

const sampleDebtDetail: DebtDetailDto = {
  id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
  name: 'Fictional Equipment Note',
  creditor: 'Harbor Ridge Cooperative',
  ownerEntity: 'Generated Example Entity',
  debtType: 'business',
  purpose: 'Generated equipment acquisition',
  status: 'active',
  originalPrincipal: '125000.00',
  currentBalance: '124600.00',
  currentBalanceEffectiveDate: '2026-07-28',
  originationDate: '2025-01-15',
  maturityDate: '2030-01-15',
  minimumPayment: '2450.00',
  paymentFrequency: 'monthly',
  paymentDueDay: 15,
  nextDueDate: '2026-08-15',
  creditLimit: null,
  collateralDescription: 'Generated equipment description',
  taxCategory: 'business',
  deductiblePercentage: '37.25',
  financingChainName: null,
  refinancedFromDebtId: null,
  refinancedFromDebtName: null,
  refinancedIntoDebtId: null,
  refinancedIntoDebtName: null,
  refinanceDate: null,
  notes: 'Fictional detail record.',
  currentTerm: {
    id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c012',
    effectiveStartDate: '2026-01-01',
    effectiveEndDate: null,
    interestRateType: 'fixed',
    annualInterestRatePercent: '5.75',
    dayCountConvention: 'actual_365',
    calculationConvention: 'simple_daily',
    requiredPayment: '2500.00',
    paymentFrequency: 'monthly',
    notes: 'Current terms.',
    createdAtUtc: '2026-07-27T13:00:00.000Z',
    updatedAtUtc: '2026-07-27T13:00:00.000Z',
  },
  paymentSchedule: {
    debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
    debtName: 'Fictional Equipment Note',
    creditor: 'Harbor Ridge Cooperative',
    dueDate: '2026-08-15',
    priorDueDate: '2026-07-15',
    nextDueDate: '2026-08-15',
    status: 'upcoming',
    earliestPastDueDate: null,
    reviewMessage: null,
  },
  terms: [
    {
      id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c011',
      effectiveStartDate: '2025-01-15',
      effectiveEndDate: '2025-12-31',
      interestRateType: 'fixed',
      annualInterestRatePercent: '5.49',
      dayCountConvention: 'actual_365',
      calculationConvention: 'simple_daily',
      requiredPayment: '2450.00',
      paymentFrequency: 'monthly',
      notes: 'Opening terms.',
      createdAtUtc: '2026-07-27T13:00:00.000Z',
      updatedAtUtc: '2026-07-27T13:00:00.000Z',
    },
    {
      id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c012',
      effectiveStartDate: '2026-01-01',
      effectiveEndDate: null,
      interestRateType: 'fixed',
      annualInterestRatePercent: '5.75',
      dayCountConvention: 'actual_365',
      calculationConvention: 'simple_daily',
      requiredPayment: '2500.00',
      paymentFrequency: 'monthly',
      notes: 'Current terms.',
      createdAtUtc: '2026-07-27T13:00:00.000Z',
      updatedAtUtc: '2026-07-27T13:00:00.000Z',
    },
  ],
  transactions: [
    {
      id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c021',
      debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
      transactionType: 'payment',
      effectiveDate: '2026-01-15',
      postingDate: '2026-01-16',
      totalAmount: '-500.00',
      status: 'posted',
      description: 'Generated payment.',
      sourceType: 'manual',
      sourceReference: 'CHK-1001',
      reversalOfTransactionId: null,
      supersedesTransactionId: null,
      allocations: [
        {
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c031',
          allocationType: 'principal',
          amount: '-400.00',
          notes: null,
          createdAtUtc: '2026-07-27T13:00:00.000Z',
          updatedAtUtc: '2026-07-27T13:00:00.000Z',
        },
        {
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c032',
          allocationType: 'interest',
          amount: '-100.00',
          notes: null,
          createdAtUtc: '2026-07-27T13:00:00.000Z',
          updatedAtUtc: '2026-07-27T13:00:00.000Z',
        },
      ],
      createdAtUtc: '2026-07-27T13:00:00.000Z',
      updatedAtUtc: '2026-07-27T13:00:00.000Z',
    },
  ],
  balanceSnapshots: [
    {
      id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c041',
      debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
      effectiveDate: '2026-01-31',
      confirmedBalance: '124500.00',
      sourceType: 'statement',
      sourceReference: 'STAT-2026-01',
      notes: 'Generated statement balance.',
      createdAtUtc: '2026-07-27T13:00:00.000Z',
      updatedAtUtc: '2026-07-27T13:00:00.000Z',
    },
  ],
  balanceReconciliations: [
    {
      id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c051',
      debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
      statementDate: '2026-01-31',
      statementEndingBalance: '124500.00',
      applicationCalculatedBalance: '124500.00',
      calculatedDifference: '0.00',
      reconciliationStatus: 'reconciled',
      lifecycleStatus: 'current',
      supersedesReconciliationId: null,
      supersededByReconciliationId: null,
      voidedAtUtc: null,
      supersededAtUtc: null,
      explanation: 'Generated reconciliation.',
      approvedAdjustmentTransactionId: null,
      sourceReference: 'STAT-2026-01',
      supportingNotes: null,
      createdAtUtc: '2026-07-27T13:00:00.000Z',
      updatedAtUtc: '2026-07-27T13:00:00.000Z',
    },
  ],
  refinanceEvents: [],
  calculatedEscrowBalance: '0.00',
  permanentDeletionPreview: {
    debtTerms: 2,
    transactions: 1,
    allocations: 1,
    balanceSnapshots: 1,
    reconciliations: 1,
    auditEvents: 5,
    importProvenance: 0,
    payoffScenarioReferences: 0,
    otherRelatedRecords: 0,
  },
  archivedAtUtc: null,
  createdAtUtc: '2026-07-27T13:00:00.000Z',
  updatedAtUtc: '2026-07-27T13:00:00.000Z',
};

const sampleDebtSummary: DebtSummaryDto = {
  id: sampleDebtDetail.id,
  name: sampleDebtDetail.name,
  creditor: sampleDebtDetail.creditor,
  ownerEntity: sampleDebtDetail.ownerEntity,
  debtType: sampleDebtDetail.debtType,
  status: sampleDebtDetail.status,
  originalPrincipal: sampleDebtDetail.originalPrincipal,
  currentBalance: sampleDebtDetail.currentBalance,
  currentBalanceEffectiveDate: sampleDebtDetail.currentBalanceEffectiveDate,
  calculatedEscrowBalance: sampleDebtDetail.calculatedEscrowBalance,
  originationDate: sampleDebtDetail.originationDate,
  maturityDate: sampleDebtDetail.maturityDate,
  initialTerm: sampleDebtDetail.terms[0]!,
  currentTerm: sampleDebtDetail.currentTerm,
  paymentDueDay: sampleDebtDetail.paymentDueDay,
  nextDueDate: sampleDebtDetail.nextDueDate,
  financingChainName: sampleDebtDetail.financingChainName,
  refinancedFromDebtId: sampleDebtDetail.refinancedFromDebtId,
  refinancedFromDebtName: sampleDebtDetail.refinancedFromDebtName,
  refinancedIntoDebtId: sampleDebtDetail.refinancedIntoDebtId,
  refinancedIntoDebtName: sampleDebtDetail.refinancedIntoDebtName,
  refinanceDate: sampleDebtDetail.refinanceDate,
  archivedAtUtc: sampleDebtDetail.archivedAtUtc,
};

describe('debt maintenance application', () => {
  it('renders the debt-list empty state', async () => {
    render(<App bridge={createBridge()} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Debt Tracker' }),
    ).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Debts' }));
    expect(
      await screen.findByRole('heading', { name: 'No debts to display' }),
    ).toBeVisible();
    expect(
      screen.getByRole('checkbox', { name: 'Include archived debts' }),
    ).not.toBeChecked();
  });

  it('renders the complete create-debt and initial-term form', async () => {
    render(<App bridge={createBridge()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Debts' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create first debt' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Create debt' }),
    ).toBeVisible();
    expect(screen.getByLabelText(/Debt name/)).toBeVisible();
    expect(screen.getByLabelText(/Original principal/)).toBeVisible();
    expect(screen.getByLabelText(/Origination date/)).toBeVisible();
    expect(screen.getByLabelText(/Payment due day/)).toBeVisible();
    expect(screen.getByLabelText(/Effective start date/)).toBeVisible();
    expect(screen.getByLabelText(/Annual interest rate/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create debt' })).toBeVisible();
  });

  it('shows combined labels and current term values on debt cards', async () => {
    const bridge = createBridge();
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [sampleDebtSummary],
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Debts' }));

    expect(
      await screen.findByText('Fictional Equipment Note — Harbor Ridge Cooperative'),
    ).toBeVisible();
    expect(screen.queryByText('Harbor Ridge Cooperative')).toBeNull();
    expect(screen.getByText('$124,600.00')).toBeVisible();
    expect(screen.getByText('5.75%')).toBeVisible();
    expect(screen.getByText('$2,500.00')).toBeVisible();
    expect(screen.getByText('Due 2026-08-15')).toBeVisible();
    expect(screen.queryByText('Initial rate')).toBeNull();
    expect(screen.queryByText('Initial required payment')).toBeNull();
    expect(screen.queryByText('$125,000.00')).toBeNull();
  });

  it('renders simplified debt detail and hides technical history sections', async () => {
    const bridge = createBridge();
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [sampleDebtSummary],
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: sampleDebtDetail,
    }));

    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Debts' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Open Fictional Equipment Note — Harbor Ridge Cooperative/,
      }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Fictional Equipment Note — Harbor Ridge Cooperative',
      }),
    ).toBeVisible();

    expect(screen.getByText('$124,600.00 as of 2026-07-28')).toBeVisible();
    expect(screen.getByText('5.75%')).toBeVisible();
    expect(screen.getByText('$2,500.00 Monthly')).toBeVisible();
    expect(screen.getByText('Day 15')).toBeVisible();
    expect(screen.getByText('2026-08-15')).toBeVisible();
    expect(screen.getByText('Upcoming')).toBeVisible();
    expect(screen.queryByText('Original principal')).toBeNull();
    expect(screen.queryByText('Purpose')).toBeNull();
    expect(screen.queryByText('Collateral')).toBeNull();
    expect(screen.queryByText('Created')).toBeNull();
    expect(screen.queryByText('Last updated')).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Effective-dated debt terms' }),
    ).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Confirmed balance snapshots' }),
    ).toBeNull();
    expect(
      await screen.findByRole('heading', { name: 'Current activity' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Balance reconciliations' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record transaction' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record refinance' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Refinance history' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record snapshot' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reconcile balance' })).toBeVisible();
  });

  it('blocks permanent debt deletion when typed confirmation does not match', async () => {
    const bridge = createBridge();
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [sampleDebtSummary],
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: sampleDebtDetail,
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Debts' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Open Fictional Equipment Note — Harbor Ridge Cooperative/,
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete debt permanently' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete debt permanently?',
    });
    expect(within(dialog).getByText('Fictional Equipment Note')).toBeVisible();
    expect(
      within(dialog).getByText('Related records that will be deleted'),
    ).toBeVisible();
    expect(within(dialog).getByText('Required immediate backup status')).toBeVisible();
    expect(within(dialog).getByText('Debt terms')).toBeVisible();
    expect(within(dialog).getByText('Transactions')).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText('Type the debt name to confirm'), {
      target: { value: 'Wrong debt name' },
    });
    fireEvent.click(
      within(dialog).getByLabelText(
        'I understand this cannot be undone except by restoring the validated backup.',
      ),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete debt permanently' }),
    );

    expect(
      await screen.findByText('Debt name confirmation did not match.'),
    ).toBeVisible();
    expect(bridge.deleteDebtPermanently).not.toHaveBeenCalled();
  });

  it('records an in-place refinance from debt detail without creating another debt', async () => {
    const bridge = createBridge();
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [sampleDebtSummary],
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: sampleDebtDetail,
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Debts' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Open Fictional Equipment Note — Harbor Ridge Cooperative/,
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Record refinance' }));

    expect(
      await screen.findByRole('heading', { name: 'Record refinance' }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Refinance date/), {
      target: { value: '2026-07-01' },
    });
    fireEvent.change(screen.getByLabelText(/New refinanced principal balance/), {
      target: { value: '130000.00' },
    });
    fireEvent.change(screen.getByLabelText(/New annual interest rate/), {
      target: { value: '4.99' },
    });
    fireEvent.change(screen.getByLabelText(/New required payment/), {
      target: { value: '2150.00' },
    });
    fireEvent.change(screen.getByLabelText(/New maturity date/), {
      target: { value: '2056-07-01' },
    });
    fireEvent.change(screen.getByLabelText(/Refinance fees financed into loan/), {
      target: { value: '2500.00' },
    });
    fireEvent.change(screen.getByLabelText(/Refinance fees paid in cash/), {
      target: { value: '750.00' },
    });
    fireEvent.change(screen.getByLabelText('Lender payoff balance'), {
      target: { value: '124600.00' },
    });
    fireEvent.click(
      screen.getByLabelText(
        'I reviewed the calculated payoff balance and documented any lender payoff difference.',
      ),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Record refinance' })[0]!);

    await waitFor(() =>
      expect(bridge.recordRefinance).toHaveBeenCalledWith(
        expect.objectContaining({
          debtId: sampleDebtDetail.id,
          refinanceDate: '2026-07-01',
          newRefinancedPrincipal: '130000.00',
          financedFees: '2500.00',
          cashFees: '750.00',
        }),
      ),
    );
    expect(bridge.createDebt).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Refinance was recorded on this debt.'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Refinance history' })).toBeVisible();
  });

  it('permanently deletes debt after confirmations and refreshes summaries', async () => {
    const bridge = createBridge();
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [sampleDebtSummary],
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: sampleDebtDetail,
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Debts' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Open Fictional Equipment Note — Harbor Ridge Cooperative/,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Danger zone' })).toBeVisible();
    expect(screen.getByText('Debt terms')).toBeVisible();
    const listCallsBeforeDelete = vi.mocked(bridge.listDebts).mock.calls.length;
    const dashboardCallsBeforeDelete = vi.mocked(bridge.getDashboard).mock.calls.length;
    const reportCallsBeforeDelete = vi.mocked(bridge.getDebtReports).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Delete debt permanently' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete debt permanently?',
    });
    expect(
      within(dialog).getByText(
        'Not started. A validated backup will be created before deletion begins.',
      ),
    ).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText('Type the debt name to confirm'), {
      target: { value: 'Fictional Equipment Note' },
    });
    fireEvent.click(
      within(dialog).getByLabelText(
        'I understand this cannot be undone except by restoring the validated backup.',
      ),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete debt permanently' }),
    );

    await waitFor(() => expect(bridge.deleteDebtPermanently).toHaveBeenCalledTimes(1));
    expect(bridge.deleteDebtPermanently).toHaveBeenCalledWith({
      id: sampleDebtDetail.id,
      expectedUpdatedAtUtc: sampleDebtDetail.updatedAtUtc,
      typedDebtName: sampleDebtDetail.name,
      confirmed: true,
      secondConfirmed: true,
    });
    expect(vi.mocked(bridge.listDebts).mock.calls.length).toBeGreaterThanOrEqual(
      listCallsBeforeDelete + 1,
    );
    expect(vi.mocked(bridge.getDashboard).mock.calls.length).toBeGreaterThanOrEqual(
      dashboardCallsBeforeDelete + 1,
    );
    expect(vi.mocked(bridge.getDebtReports).mock.calls.length).toBeGreaterThanOrEqual(
      reportCallsBeforeDelete + 1,
    );
    expect(
      await screen.findByText(/Debt was permanently deleted after validated backup/),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Danger zone' })).toBeNull();
  });

  it('shows only current effective transaction rows while audit history keeps the full chain', async () => {
    const bridge = createBridge();
    const currentChainDetail: DebtDetailDto = {
      ...sampleDebtDetail,
      debtType: 'mortgage',
      calculatedEscrowBalance: '50.00',
      transactions: [
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c101',
          description: 'Generated reversed original payment.',
          status: 'reversed',
        },
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c102',
          transactionType: 'reversal',
          totalAmount: '500.00',
          description: 'Generated manual reversal row.',
          reversalOfTransactionId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c101',
        },
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c103',
          description: 'Generated voided escrow deposit.',
          status: 'voided',
          allocations: [
            {
              ...sampleDebtDetail.transactions[0]!.allocations[0]!,
              id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c104',
              allocationType: 'escrow',
              amount: '-40.00',
            },
          ],
        },
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c105',
          description: 'Generated void offset row.',
          transactionType: 'reversal',
          totalAmount: '40.00',
          reversalOfTransactionId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c103',
        },
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c106',
          description: 'Generated superseded escrow disbursement.',
          transactionType: 'escrow_disbursement',
          totalAmount: '75.00',
          status: 'superseded',
          allocations: [
            {
              ...sampleDebtDetail.transactions[0]!.allocations[0]!,
              id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c107',
              allocationType: 'escrow',
              amount: '75.00',
            },
          ],
        },
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c108',
          description: 'Generated superseding edit reversal row.',
          transactionType: 'reversal',
          totalAmount: '-75.00',
          reversalOfTransactionId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c106',
        },
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c109',
          description: 'Generated corrected escrow disbursement.',
          transactionType: 'escrow_disbursement',
          totalAmount: '20.00',
          supersedesTransactionId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c106',
          allocations: [
            {
              ...sampleDebtDetail.transactions[0]!.allocations[0]!,
              id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c110',
              allocationType: 'escrow',
              amount: '20.00',
            },
          ],
        },
      ],
    };
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [sampleDebtSummary],
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: currentChainDetail,
    }));

    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Debts' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Open Fictional Equipment Note — Harbor Ridge Cooperative/,
      }),
    );

    expect(
      (await screen.findAllByText('Generated corrected escrow disbursement.'))[0],
    ).toBeVisible();
    expect(screen.queryByText('Generated reversed original payment.')).toBeNull();
    expect(screen.queryByText('Generated manual reversal row.')).toBeNull();
    expect(screen.queryByText('Generated voided escrow deposit.')).toBeNull();
    expect(screen.queryByText('Generated superseded escrow disbursement.')).toBeNull();
    expect(screen.queryByText('Generated superseding edit reversal row.')).toBeNull();

    fireEvent.click(screen.getByText('View audit history'));
    expect(screen.getByText('Reversed original')).toBeVisible();
    expect(screen.getAllByText('Linked reversal').length).toBeGreaterThan(0);
    expect(screen.getByText('Voided original')).toBeVisible();
    expect(screen.getByText('Superseded original')).toBeVisible();
    expect(screen.getByText('Reversal generated by edit')).toBeVisible();
    expect(screen.getByText('Corrected')).toBeVisible();
  });

  it('edits a posted transaction through the typed bridge with positive auto-principal entry', async () => {
    const bridge = createBridge();
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [sampleDebtSummary],
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: sampleDebtDetail,
    }));
    bridge.editDebtTransaction = vi.fn(async () => ({
      ok: true as const,
      value: {
        ...sampleDebtDetail,
        currentBalance: '124550.00',
      },
    }));

    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Debts' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Open Fictional Equipment Note — Harbor Ridge Cooperative/,
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(
      await screen.findByRole('heading', { name: 'Edit transaction' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('500.00');
    expect(screen.getByLabelText(/Principal/)).toHaveValue('400.00');
    fireEvent.change(screen.getByLabelText(/Interest/), {
      target: { value: '50.00' },
    });
    expect(screen.getByLabelText(/Principal/)).toHaveValue('450.00');
    fireEvent.click(screen.getByRole('button', { name: 'Save transaction edit' }));

    expect(await screen.findByText('Transaction edit was saved.')).toBeVisible();
    expect(bridge.editDebtTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sampleDebtDetail.transactions[0]!.id,
        expectedUpdatedAtUtc: sampleDebtDetail.transactions[0]!.updatedAtUtc,
        transaction: expect.objectContaining({
          totalAmount: '500.00',
          allocations: expect.objectContaining({
            principal: '450.00',
            interest: '50.00',
          }),
        }),
      }),
    );
  });

  it('renders dashboard metrics and empty dashboard sections', async () => {
    render(<App bridge={createBridge()} />);

    expect(await screen.findByRole('heading', { name: 'Debt overview' })).toBeVisible();
    expect(screen.getByText('$124,500.00')).toBeVisible();
    expect(screen.getByText('Principal reduction YTD')).toBeVisible();
    expect(screen.queryByText(/Metrics use active debts only/)).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Total active debt: $124,500.00 as of 2026-07-28',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('region', {
        name: 'Principal reduction YTD: $400.00 as of 2026-07-28',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: /Application-calculated ledger balances/,
      }),
    ).toBeNull();
    expect(screen.getByText(/Application-calculated ledger balances/)).toHaveClass(
      'sr-only',
    );
    expect(screen.getByRole('heading', { name: 'Upcoming payments' })).toBeVisible();
    expect(
      screen.getByText(
        'No unpaid scheduled payments are past due, due today, or due in the next 30 days.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'No unreconciled, in-progress, or exception reconciliation items for active debts.',
      ),
    ).toBeVisible();
    expect(
      screen
        .getByRole('heading', { name: 'Upcoming payments' })
        .compareDocumentPosition(
          screen.getByRole('heading', { name: 'Items requiring attention' }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders unpaid dashboard upcoming payments with debt navigation', async () => {
    const bridge = createBridge();
    bridge.getDashboard = vi.fn(async () => ({
      ok: true as const,
      value: {
        ...sampleDashboard,
        upcomingPayments: [
          {
            debtId: sampleDebtDetail.id,
            debtName: sampleDebtDetail.name,
            creditor: sampleDebtDetail.creditor,
            dueDate: '2026-07-15',
            priorDueDate: '2026-06-15',
            nextDueDate: '2026-07-15',
            status: 'past_due' as const,
            earliestPastDueDate: '2026-07-15',
            reviewMessage: null,
          },
        ],
      },
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: sampleDebtDetail,
    }));
    render(<App bridge={bridge} />);

    expect(
      await screen.findByRole('heading', { name: 'Upcoming payments' }),
    ).toBeVisible();
    expect(screen.getByText('2026-07-15')).toBeVisible();
    expect(screen.getByText(/Past due/i)).toBeVisible();
    expect(screen.queryByText('Remaining due')).toBeNull();
    expect(screen.queryByText('Payments applied')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: /Open Fictional Equipment Note.*scheduled payment due 2026-07-15/,
      }),
    );

    expect(bridge.getDebt).toHaveBeenCalledWith({ id: sampleDebtDetail.id });
  });

  it('supports keyboard navigation from the full upcoming payment row', async () => {
    const bridge = createBridge();
    bridge.getDashboard = vi.fn(async () => ({
      ok: true as const,
      value: {
        ...sampleDashboard,
        upcomingPayments: [
          {
            debtId: sampleDebtDetail.id,
            debtName: sampleDebtDetail.name,
            creditor: sampleDebtDetail.creditor,
            dueDate: '2026-07-15',
            priorDueDate: '2026-06-15',
            nextDueDate: '2026-07-15',
            status: 'past_due' as const,
            earliestPastDueDate: '2026-07-15',
            reviewMessage: null,
          },
        ],
      },
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: sampleDebtDetail,
    }));
    const { unmount } = render(<App bridge={bridge} />);

    const enterRow = await screen.findByRole('button', {
      name: /Open Fictional Equipment Note.*scheduled payment due 2026-07-15/,
    });
    fireEvent.keyDown(enterRow, { key: 'Enter' });

    expect(bridge.getDebt).toHaveBeenCalledWith({ id: sampleDebtDetail.id });

    unmount();
    const secondBridge = createBridge();
    secondBridge.getDashboard = bridge.getDashboard;
    secondBridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: sampleDebtDetail,
    }));
    render(<App bridge={secondBridge} />);

    const spaceRow = await screen.findByRole('button', {
      name: /Open Fictional Equipment Note.*scheduled payment due 2026-07-15/,
    });
    fireEvent.keyDown(spaceRow, { key: ' ' });

    expect(secondBridge.getDebt).toHaveBeenCalledWith({ id: sampleDebtDetail.id });
  });

  it('navigates from dashboard total active debt to debts', async () => {
    const bridge = createBridge();
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: /Total active debt/ }));

    expect(
      await screen.findByRole('heading', { name: 'No debts to display' }),
    ).toBeVisible();
    expect(bridge.listDebts).toHaveBeenCalledWith({ includeArchived: false });
  });

  it('navigates from dashboard current escrow balance to escrow detail', async () => {
    const bridge = createBridge();
    const mortgageSummary = {
      ...sampleDebtSummary,
      debtType: 'mortgage' as const,
    };
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [mortgageSummary],
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: {
        ...sampleDebtDetail,
        debtType: 'mortgage' as const,
        calculatedEscrowBalance: '300.00',
        transactions: [
          {
            ...sampleDebtDetail.transactions[0]!,
            allocations: [
              ...sampleDebtDetail.transactions[0]!.allocations,
              {
                id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c033',
                allocationType: 'escrow' as const,
                amount: '-300.00',
                notes: null,
                createdAtUtc: '2026-07-27T13:00:00.000Z',
                updatedAtUtc: '2026-07-27T13:00:00.000Z',
              },
            ],
          },
        ],
      },
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(
      await screen.findByRole('button', { name: /Current escrow balance/ }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Escrow balances and activity' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Fictional Equipment Note — Harbor Ridge Cooperative',
      }),
    ).toBeVisible();
    expect(screen.getByText('Generated payment.')).toBeVisible();
    expect(screen.getAllByText('$300.00').length).toBeGreaterThanOrEqual(2);
  });

  it('shows signed current escrow activity that reconciles to dashboard and debt detail balances', async () => {
    const bridge = createBridge();
    const mortgageSummary = {
      ...sampleDebtSummary,
      debtType: 'mortgage' as const,
      calculatedEscrowBalance: '50.00',
    };
    const mortgageDetail: DebtDetailDto = {
      ...sampleDebtDetail,
      debtType: 'mortgage',
      calculatedEscrowBalance: '50.00',
      transactions: [
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c201',
          description: 'Generated current escrow deposit.',
          allocations: [
            {
              ...sampleDebtDetail.transactions[0]!.allocations[0]!,
              id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c202',
              allocationType: 'escrow',
              amount: '-100.00',
            },
          ],
        },
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c203',
          transactionType: 'escrow_disbursement',
          totalAmount: '30.00',
          description: 'Generated current escrow disbursement.',
          allocations: [
            {
              ...sampleDebtDetail.transactions[0]!.allocations[0]!,
              id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c204',
              allocationType: 'escrow',
              amount: '30.00',
            },
          ],
        },
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c205',
          transactionType: 'escrow_disbursement',
          totalAmount: '20.00',
          description: 'Generated corrected escrow disbursement.',
          supersedesTransactionId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c206',
          allocations: [
            {
              ...sampleDebtDetail.transactions[0]!.allocations[0]!,
              id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c207',
              allocationType: 'escrow',
              amount: '20.00',
            },
          ],
        },
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c208',
          description: 'Generated reversed escrow deposit.',
          status: 'reversed',
          allocations: [
            {
              ...sampleDebtDetail.transactions[0]!.allocations[0]!,
              id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c209',
              allocationType: 'escrow',
              amount: '-40.00',
            },
          ],
        },
        {
          ...sampleDebtDetail.transactions[0]!,
          id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c210',
          description: 'Generated voided escrow row.',
          status: 'voided',
          allocations: [
            {
              ...sampleDebtDetail.transactions[0]!.allocations[0]!,
              id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c211',
              allocationType: 'escrow',
              amount: '-25.00',
            },
          ],
        },
      ],
    };
    bridge.getDashboard = vi.fn(async () => ({
      ok: true as const,
      value: {
        ...sampleDashboard,
        totals: { ...sampleDashboard.totals, escrowBalance: '50.00' },
        escrowBalances: [
          {
            debtId: sampleDebtDetail.id,
            debtName: sampleDebtDetail.name,
            creditor: sampleDebtDetail.creditor,
            amount: '50.00',
            effectiveDate: '2026-07-28',
            basis: 'Calculated escrow balance.',
          },
        ],
      },
    }));
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [mortgageSummary],
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: mortgageDetail,
    }));

    render(<App bridge={bridge} />);

    fireEvent.click(
      await screen.findByRole('button', { name: /Current escrow balance/ }),
    );

    expect(await screen.findByText('Generated current escrow deposit.')).toBeVisible();
    expect(screen.getByText('Generated current escrow disbursement.')).toBeVisible();
    expect(screen.getByText('Generated corrected escrow disbursement.')).toBeVisible();
    expect(screen.queryByText('Generated reversed escrow deposit.')).toBeNull();
    expect(screen.queryByText('Generated voided escrow row.')).toBeNull();
    expect(screen.getByText('-$30.00')).toBeVisible();
    expect(screen.getByText('-$20.00')).toBeVisible();
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$50.00').length).toBeGreaterThanOrEqual(2);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Fictional Equipment Note — Harbor Ridge Cooperative',
      }),
    );
    expect((await screen.findAllByText('$50.00'))[0]).toBeVisible();
    expect(screen.getAllByText('Generated current escrow deposit.')[0]).toBeVisible();
    expect(screen.getByText('-$30.00')).toBeVisible();
  });

  it('posts escrow activity from escrow detail and refreshes balances', async () => {
    const bridge = createBridge();
    const mortgageSummary = {
      ...sampleDebtSummary,
      debtType: 'mortgage' as const,
    };
    const mortgageDetail = {
      ...sampleDebtDetail,
      debtType: 'mortgage' as const,
      calculatedEscrowBalance: '300.00',
    };
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [mortgageSummary],
    }));
    bridge.getDebt = vi.fn(async () => ({
      ok: true as const,
      value: mortgageDetail,
    }));
    bridge.createDebtTransaction = vi.fn(async () => ({
      ok: true as const,
      value: {
        ...mortgageDetail,
        calculatedEscrowBalance: '150.00',
      },
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(
      await screen.findByRole('button', { name: /Current escrow balance/ }),
    );
    await screen.findByRole('heading', { name: 'Escrow balances and activity' });
    fireEvent.change(screen.getByRole('combobox', { name: /Escrow activity type/ }), {
      target: { value: 'real_estate_tax' },
    });
    fireEvent.change(
      document.querySelector('[name="escrow.transactionDate"]') as HTMLInputElement,
      {
        target: { value: '2026-07-15' },
      },
    );
    fireEvent.change(
      document.querySelector('[name="escrow.amount"]') as HTMLInputElement,
      {
        target: { value: '150.00' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record escrow activity' }));

    expect(await screen.findByText('Escrow activity was recorded.')).toBeVisible();
    expect(bridge.createDebtTransaction).toHaveBeenCalledWith({
      debtId: sampleDebtDetail.id,
      transaction: {
        transactionType: 'escrow_disbursement',
        effectiveDate: '2026-07-15',
        postingDate: '2026-07-15',
        status: 'posted',
        totalAmount: '150.00',
        description: 'Real estate tax payment',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: null,
          interest: null,
          escrow: '150.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    expect(bridge.getDashboard).toHaveBeenCalledTimes(4);
    expect(bridge.getDebt).toHaveBeenCalledTimes(2);
  });

  it('orders dashboard cards with interest activity before new borrowings', async () => {
    render(<App bridge={createBridge()} />);

    await screen.findByRole('heading', { name: 'Debt overview' });
    const cardLabels = screen
      .getAllByRole('heading', { level: 3 })
      .slice(0, 4)
      .map((heading) => heading.textContent);

    expect(cardLabels).toEqual([
      'Total active debt',
      'Principal reduction YTD',
      'Interest activity YTD',
      'New borrowings YTD',
    ]);
  });

  it('opens credit-card portfolio details from dashboard metrics', async () => {
    const bridge = createBridge();
    bridge.getDashboard = vi.fn(async () => ({
      ok: true as const,
      value: {
        ...sampleDashboard,
        totals: {
          ...sampleDashboard.totals,
          creditCardBalances: '1500.00',
          availableCredit: '4000.00',
          creditUtilizationPercent: '20.0%',
        },
        creditCardPortfolio: {
          details: [
            {
              debtId: sampleDebtSummary.id,
              debtName: 'Generated Rewards Card',
              creditor: 'Harbor Ridge Cooperative',
              currentBalance: '1000.00',
              creditLimit: '5000.00',
              availableCredit: '4000.00',
              utilizationPercent: '20.0%',
              reviewFlag: null,
            },
            {
              debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c099',
              debtName: 'Generated Limit Review Card',
              creditor: 'Harbor Ridge Cooperative',
              currentBalance: '500.00',
              creditLimit: null,
              availableCredit: null,
              utilizationPercent: null,
              reviewFlag:
                'No valid credit limit; excluded from portfolio utilization calculation.',
            },
          ],
          reviewItems: [
            'Generated Limit Review Card has no valid credit limit and is excluded from utilization.',
          ],
        },
      },
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: /Credit-card utilization: 20.0%/,
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Credit-card detail summary' }),
    ).toBeVisible();
    expect(screen.getByText(/Generated Rewards Card/)).toBeVisible();
    expect(screen.getAllByText(/Generated Limit Review Card/).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText(
        'No valid credit limit; excluded from portfolio utilization calculation.',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders dashboard data-integrity exceptions for malformed reversals', async () => {
    const bridge = createBridge();
    const dashboardWithIntegrityException: DashboardDto = {
      ...sampleDashboard,
      metricBasis: {
        ...sampleDashboard.metricBasis,
        activeDebt:
          'Application-calculated ledger balances for active debts as of 2026-07-28. Data-integrity exceptions are present and affected balances require review.',
      },
      attentionItems: [
        {
          debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
          debtName: 'Fictional Equipment Note',
          creditor: 'Harbor Ridge Cooperative',
          statementDate: '2021-06-02',
          status: 'exception',
          difference: '0.00',
          sourceReference: 'generated-malformed-reversal',
          basis:
            'Malformed reversal detected; original and reversal activity do not fully offset.',
        },
      ],
    };
    bridge.getDashboard = vi.fn(async () => ({
      ok: true as const,
      value: dashboardWithIntegrityException,
    }));
    render(<App bridge={bridge} />);

    expect(await screen.findByRole('heading', { name: 'Debt overview' })).toBeVisible();
    expect(
      screen.getByText(
        'Malformed reversal detected; original and reversal activity do not fully offset.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Source generated-malformed-reversal')).toBeVisible();
    expect(screen.getByText(/Data-integrity exceptions are present/)).toHaveClass(
      'sr-only',
    );
  });

  it('renders application version and local last-changed metadata', async () => {
    const bridge = createBridge();
    render(<App bridge={bridge} />);

    expect(await screen.findByText('Version 1.5.2')).toBeVisible();
    expect(
      screen.getByText(
        `Last changed: ${formatLastChanged(bridge.appMetadata.lastChangedAtUtc)}`,
      ),
    ).toBeVisible();
  });

  it('renders advanced debt reports with labeled basis and accessible detail', async () => {
    const bridge = createBridge();
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reports' }));

    expect(
      await screen.findByRole('heading', { name: 'Debt reporting' }),
    ).toBeVisible();
    expect(screen.getByText('Monthly debt rollforward')).toBeVisible();
    expect(screen.getByText('Debt balance history by obligation')).toBeVisible();
    expect(
      [
        ...document.querySelectorAll(
          'section[aria-labelledby="advanced-reports-heading"] > div.space-y-6 > details > summary',
        ),
      ]
        .slice(0, 4)
        .map((summary) => summary.textContent?.trim()),
    ).toEqual([
      'Debt balance history by obligation',
      'Interest expense analysis',
      'Monthly debt rollforward',
      'Annual debt rollforward',
    ]);
    fireEvent.click(screen.getByText('Monthly debt rollforward'));
    expect(screen.getAllByText('Cash payments').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Principal adjustments').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Check').length).toBeGreaterThan(0);
    expect(screen.queryByText('Debt balance trend')).toBeNull();
    const historySummary = screen.getByText('Debt balance history by obligation');
    const historyReport = historySummary.closest('details');
    expect(historyReport).not.toHaveAttribute('open');
    fireEvent.click(historySummary);
    expect(historyReport).toHaveAttribute('open');
    expect(
      screen.getByRole('img', {
        name: /Line chart of debt balance history/i,
      }),
    ).toBeVisible();
    expect(screen.getByText('Ending principal balance by obligation')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Total debt balance' })).toBeVisible();
    const legendControls = screen.getByLabelText('Debt balance history chart controls');
    const selectNone = within(legendControls).getByRole('button', {
      name: 'Select none',
    });
    fireEvent.click(selectNone);
    expect(
      within(legendControls).getByRole('button', { name: 'Select all' }),
    ).toBeVisible();
    expect(screen.queryAllByTestId('balance-history-line')).toHaveLength(0);
    fireEvent.click(within(legendControls).getByRole('button', { name: 'Select all' }));
    expect(screen.queryAllByTestId('balance-history-line').length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByTestId('balance-history-tooltip')
        .some(
          (tooltip) =>
            /2026-01-31\nGenerated Home Mortgage\n/.test(tooltip.textContent ?? '') &&
            !/creditor|ending principal balance|change from prior period/i.test(
              tooltip.textContent ?? '',
            ),
        ),
    ).toBe(true);
    expect(
      screen
        .getAllByTestId('balance-history-line')
        .every((line) => !line.hasAttribute('stroke-dasharray')),
    ).toBe(true);
    const mortgageLegend = within(legendControls).getByRole('button', {
      name: 'Generated Home Mortgage',
    });
    expect(mortgageLegend).toHaveAttribute('aria-pressed', 'true');
    const initialMaximum = screen.getByTestId(
      'balance-history-y-axis-maximum',
    ).textContent;
    fireEvent.click(
      within(legendControls).getByRole('button', { name: 'Total debt balance' }),
    );
    expect(screen.getByTestId('balance-history-y-axis-maximum').textContent).not.toBe(
      initialMaximum,
    );
    expect(screen.getAllByTestId('balance-history-y-tick').length).toBeGreaterThan(2);
    expect(screen.getAllByTestId('balance-history-y-tick').length).toBeLessThanOrEqual(
      7,
    );
    fireEvent.click(mortgageLegend);
    const disabledMortgageLegend = within(legendControls).getByRole('button', {
      name: 'Generated Home Mortgage',
    });
    expect(disabledMortgageLegend).toHaveAttribute('aria-pressed', 'false');
    expect(disabledMortgageLegend).toHaveClass('opacity-50');
    expect(screen.queryByTitle(/Generated Home Mortgage/)).toBeNull();
    fireEvent.click(
      within(legendControls).getByRole('button', {
        name: 'Fictional Equipment Note',
      }),
    );
    expect(screen.getByText(/No debt lines are selected/)).toBeVisible();
    fireEvent.click(
      within(legendControls).getByRole('button', { name: 'Total debt balance' }),
    );
    const zoomStatus = screen.getByTestId('balance-history-zoom').textContent;
    const chart = screen.getByTestId('balance-history-chart');
    await waitFor(() => {
      const chartWheel = new WheelEvent('wheel', {
        cancelable: true,
        deltaY: -100,
      });
      chart.dispatchEvent(chartWheel);
      expect(chartWheel.defaultPrevented).toBe(true);
    });
    expect(screen.getByTestId('balance-history-zoom').textContent).not.toBe(zoomStatus);
    const zoomedStatus = screen.getByTestId('balance-history-zoom').textContent;
    await waitFor(() => {
      const panWheel = new WheelEvent('wheel', {
        cancelable: true,
        deltaY: -100,
        shiftKey: true,
      });
      chart.dispatchEvent(panWheel);
      expect(panWheel.defaultPrevented).toBe(true);
    });
    expect(screen.getByTestId('balance-history-zoom').textContent).not.toBe(
      zoomedStatus,
    );
    expect(screen.getByTestId('balance-history-y-axis-maximum').textContent).not.toBe(
      initialMaximum,
    );
    const draggedStatus = screen.getByTestId('balance-history-zoom').textContent;
    fireEvent.pointerDown(chart, {
      clientX: 180,
      pointerId: 1,
    });
    fireEvent.pointerMove(chart, {
      clientX: 178,
      pointerId: 1,
    });
    expect(screen.getByTestId('balance-history-zoom').textContent).toBe(draggedStatus);
    fireEvent.pointerMove(chart, {
      clientX: 100,
      pointerId: 1,
    });
    expect(document.body.style.userSelect).toBe('none');
    expect(window.getSelection()?.toString() ?? '').toBe('');
    expect(screen.getByTestId('balance-history-zoom').textContent).not.toBe(
      draggedStatus,
    );
    fireEvent.pointerUp(chart, {
      pointerId: 1,
    });
    expect(document.body.style.userSelect).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    expect(screen.getByTestId('balance-history-zoom').textContent).toBe(zoomedStatus);
    const outsideWheel = new WheelEvent('wheel', {
      cancelable: true,
      deltaY: -100,
    });
    document.body.dispatchEvent(outsideWheel);
    expect(outsideWheel.defaultPrevented).toBe(false);
    expect(screen.getAllByTestId('balance-history-x-tick').length).toBeLessThanOrEqual(
      8,
    );
    expect(screen.queryAllByTestId('balance-history-line').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('balance-history-active-marker')[0]).toHaveClass(
      'opacity-0',
    );
    expect(screen.getAllByText('View chart data')[0]).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(screen.getByTestId('balance-history-zoom')).toHaveTextContent(
      '2026-01-31 through 2026-03-31',
    );
    expect(screen.queryByRole('table', { name: /Debt balance history/i })).toBeNull();
    fireEvent.click(screen.getAllByText('View chart data')[0]!);
    expect(screen.getAllByText('$371,800.13').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Interest expense analysis'));
    expect(
      screen.getByText('Monthly interest expense by month and year'),
    ).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'Chronological trend' })).toBeNull();
    expect(
      screen.queryByRole('radio', { name: 'Compare months across years' }),
    ).toBeNull();
    for (const control of [
      'Previous month',
      'Next month',
      'Reset monthly zoom',
      'Return to latest months',
    ]) {
      expect(screen.queryByRole('button', { name: control })).toBeNull();
    }
    expect(
      within(screen.getByTestId('monthly-interest-chart')).queryByText(
        /Visible range:/,
      ),
    ).toBeNull();
    expect(screen.getAllByText(/Date range:/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('img', {
        name: /Bar chart of annual interest expense/i,
      }),
    ).toBeVisible();
    expect(screen.queryByText('Interest-rate sensitivity')).toBeNull();
    expect(screen.queryByText('Actual-versus-plan variance')).toBeNull();
    expect(screen.getByTestId('annual-interest-total-2026')).toHaveTextContent(
      '$1,200.00',
    );
    const annualSegment = screen.getByTestId('annual-interest-segment-tooltip');
    expect(annualSegment).not.toHaveTextContent(/annual total/);
    expect(annualSegment).toHaveTextContent(/% of annual interest/);
    expect(annualSegment.parentElement).not.toHaveAttribute('stroke-dasharray');
    expect(
      screen.getByRole('img', {
        name: /Grouped bar chart comparing monthly interest expense across years/i,
      }),
    ).toBeVisible();
    expect(screen.getAllByTestId('interest-comparison-tooltip')[0]).toHaveTextContent(
      /Jan 2026\s+\$100.00/,
    );
    expect(screen.getAllByTestId('interest-comparison-y-tick')[0]).toHaveTextContent(
      '$0.00',
    );
    expect(
      screen
        .getAllByTestId('interest-comparison-bar')
        .every(
          (bar) => !bar.hasAttribute('stroke') && !bar.hasAttribute('stroke-dasharray'),
        ),
    ).toBe(true);
    expect(
      screen
        .getAllByTestId('interest-comparison-month-label')
        .map((label) => label.textContent),
    ).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
    expect(screen.getAllByText('Interest expense').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Date preset'), {
      target: { value: 'all_activity' },
    });
    expect(screen.getByLabelText('Start date')).toHaveValue('2019-01-01');
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2018-12-31' },
    });
    expect(screen.getByLabelText('Start date')).toHaveValue('2019-01-01');
    expect(bridge.getDebtReports).toHaveBeenCalledWith({
      startDate: null,
      endDate: null,
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });
  });

  it('preserves report filters during navigation and resets to defaults explicitly', async () => {
    const bridge = createBridge();
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [sampleDebtSummary],
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reports' }));
    await screen.findByRole('heading', { name: 'Debt reporting' });
    fireEvent.change(screen.getByLabelText('Date preset'), {
      target: { value: 'custom' },
    });
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-02-01' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-03-31' },
    });
    fireEvent.change(screen.getByLabelText('Debt'), {
      target: { value: sampleDebtSummary.id },
    });
    fireEvent.change(screen.getByLabelText('Debt type'), {
      target: { value: 'business' },
    });
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'active' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(bridge.getDebtReports).toHaveBeenLastCalledWith({
      startDate: '2026-02-01',
      endDate: '2026-03-31',
      debtId: sampleDebtSummary.id,
      ownerEntity: null,
      debtType: 'business',
      status: 'active',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    await screen.findByRole('heading', { name: 'Debt overview' });
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));

    expect(await screen.findByLabelText('Start date')).toHaveValue('2026-02-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-03-31');
    expect(screen.getByLabelText('Debt')).toHaveValue(sampleDebtSummary.id);
    expect(screen.getByLabelText('Debt type')).toHaveValue('business');
    expect(screen.getByLabelText('Status')).toHaveValue('active');

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getByLabelText('Date preset')).toHaveValue('current_year');
    expect(screen.getByLabelText('Debt')).toHaveValue('');
    expect(screen.getByLabelText('Debt type')).toHaveValue('');
    expect(screen.getByLabelText('Status')).toHaveValue('');
    expect(bridge.getDebtReports).toHaveBeenLastCalledWith({
      startDate: null,
      endDate: null,
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });
  });

  it('renders monthly interest comparison across all years without obsolete trend controls', async () => {
    const bridge = createBridge();
    bridge.getDebtReports = vi.fn(async () => ({
      ok: true as const,
      value: longRangeInterestReports(),
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reports' }));
    fireEvent.click(await screen.findByText('Interest expense analysis'));

    const monthlyChart = screen.getByTestId('monthly-interest-chart');
    expect(
      screen.getByText('Monthly interest expense by month and year'),
    ).toBeVisible();
    expect(screen.queryByText('Monthly interest expense trend')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Chronological trend' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset monthly zoom' })).toBeNull();
    expect(within(monthlyChart).queryByText(/Visible range:/)).toBeNull();
    expect(
      within(monthlyChart).getByRole('img', {
        name: /Grouped bar chart comparing monthly interest expense across years/i,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('img', { name: /Line chart of monthly interest/i }),
    ).toBeNull();
    expect(
      screen.getAllByTestId('interest-comparison-month-label').map((label) => ({
        text: label.textContent,
        x: Number(label.getAttribute('x')),
      })),
    ).toMatchObject([
      { text: 'Jan' },
      { text: 'Feb' },
      { text: 'Mar' },
      { text: 'Apr' },
      { text: 'May' },
      { text: 'Jun' },
      { text: 'Jul' },
      { text: 'Aug' },
      { text: 'Sep' },
      { text: 'Oct' },
      { text: 'Nov' },
      { text: 'Dec' },
    ]);
    const monthLabelXs = screen
      .getAllByTestId('interest-comparison-month-label')
      .map((label) => Number(label.getAttribute('x')));
    expect(
      monthLabelXs.every((x, index) => index === 0 || x > monthLabelXs[index - 1]!),
    ).toBe(true);
    expect(
      screen
        .getAllByTestId('interest-month-group')
        .map((group) =>
          group
            .querySelector('[data-testid="interest-comparison-month-label"]')
            ?.getAttribute('x'),
        ),
    ).toEqual(
      screen
        .getAllByTestId('interest-comparison-month-label')
        .map((label) => label.getAttribute('x')),
    );
    expect(
      screen
        .getAllByTestId('interest-comparison-tooltip')
        .some((tooltip) => /Jan 2019\s+\$125.00/.test(tooltip.textContent ?? '')),
    ).toBe(true);
    expect(
      screen
        .getAllByTestId('interest-comparison-tooltip')
        .some((tooltip) => /May 2023\s+\$225.00/.test(tooltip.textContent ?? '')),
    ).toBe(true);
    for (const year of [
      '2019',
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
    ]) {
      expect(screen.getByTestId(`interest-year-treatment-${year}`)).toBeVisible();
    }
    const yearColors = [
      '2019',
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
    ].map((year) =>
      screen
        .getByTestId(`interest-year-treatment-${year}`)
        .querySelector('span')
        ?.getAttribute('style'),
    );
    expect(new Set(yearColors)).toHaveProperty('size', 8);
    const year2019 = within(monthlyChart).getByRole('button', { name: '2019' });
    fireEvent.click(year2019);
    expect(year2019).toHaveAttribute('aria-pressed', 'false');
    expect(year2019).toHaveClass('opacity-45');
    expect(
      within(monthlyChart)
        .queryAllByTestId('interest-comparison-tooltip')
        .some((tooltip) => /Jan 2019/.test(tooltip.textContent ?? '')),
    ).toBe(false);
    fireEvent.click(within(monthlyChart).getByRole('button', { name: 'Select none' }));
    expect(
      within(monthlyChart).queryAllByTestId('interest-comparison-bar'),
    ).toHaveLength(0);
    fireEvent.click(within(monthlyChart).getByRole('button', { name: 'Select all' }));
    expect(within(monthlyChart).getByRole('button', { name: '2019' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(monthlyChart).queryAllByTestId('interest-comparison-bar').length,
    ).toBeGreaterThan(0);
    expect(
      screen
        .getAllByTestId('interest-comparison-bar')
        .every(
          (bar) => !bar.hasAttribute('stroke') && !bar.hasAttribute('stroke-dasharray'),
        ),
    ).toBe(true);
    expect(screen.queryByRole('table', { name: /Interest expense/i })).toBeNull();

    const monthlyTotals = new Map<string, number>();
    for (const row of longRangeInterestReports().activityTrends.rows) {
      const year = row.period.slice(0, 4);
      monthlyTotals.set(
        year,
        (monthlyTotals.get(year) ?? 0) + Number(row.interestActivity),
      );
    }
    for (const row of longRangeInterestReports().activityTrends.annualInterestByDebt) {
      expect(Number(row.interestExpense)).toBe(monthlyTotals.get(row.year));
    }
  });

  it('keeps year treatments solid and distinct before repeating', () => {
    const fills = Array.from(
      { length: 10 },
      (_, index) => interestYearTreatment(index).fill,
    );
    expect(new Set(fills)).toHaveProperty('size', 10);
    expect(interestYearTreatment(10).fill).toBe(interestYearTreatment(0).fill);
    expect(interestYearTreatment(0).stroke).not.toBe(interestYearTreatment(1).stroke);
  });

  it('keeps debt-series colors distinct for the tested portfolio size', () => {
    const fills = Array.from({ length: 12 }, (_, index) => debtSeriesColor(index));
    expect(new Set(fills)).toHaveProperty('size', 12);
    expect(debtSeriesColor(12)).toBe(debtSeriesColor(0));
  });

  it('builds readable chart scales with nice major units for short and long ranges', () => {
    const highDebtScale = buildChartScale({
      values: [248000, 250000],
      chartHeight: 218,
      includeZero: false,
      allowExcludeZero: true,
      formatLabel: (value) => `$${value.toFixed(0)}`,
    });
    expect(highDebtScale.minimum).toBeGreaterThan(0);
    expect(highDebtScale.tickValues.length).toBeGreaterThanOrEqual(4);
    expect(highDebtScale.tickValues.length).toBeLessThanOrEqual(7);
    expect([1, 2, 2.5, 5, 10]).toContain(
      highDebtScale.majorUnit /
        Math.pow(10, Math.floor(Math.log10(highDebtScale.majorUnit))),
    );

    const zeroScale = buildChartScale({
      values: [0, 25, 90],
      chartHeight: 112,
      includeZero: true,
      formatLabel: (value) => `$${value.toFixed(0)}`,
    });
    expect(zeroScale.minimum).toBe(0);
    expect(zeroScale.tickValues).toContain(50);
    expect(zeroScale.tickValues.length).toBeLessThanOrEqual(7);
  });

  it('renders data-management status and runs backup and export actions', async () => {
    const bridge = createBridge();
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Data management' }));

    expect(
      await screen.findByRole('heading', { name: 'Backup, restore, and export' }),
    ).toBeVisible();
    expect(
      screen.getByText('manual-2026-07-28T134400-000Z.sqlite3'),
    ).toBeInTheDocument();
    expect(screen.getByText(/C:\\Generated\\Debt Tracker\\backups/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));
    expect(
      await screen.findByText('Database backup was created and validated.'),
    ).toBeVisible();
    expect(bridge.createManualBackup).toHaveBeenCalledWith({});

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV files' }));
    expect(
      await screen.findByText('Export completed with 12 CSV files.'),
    ).toBeVisible();
    expect(bridge.exportData).toHaveBeenCalledWith({
      format: 'csv',
      includeReports: true,
    });

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringMatching(/Delete this manual backup created/),
    );
    expect(bridge.deleteBackup).toHaveBeenCalledWith({
      backupId: 'manual-2026-07-28T134400-000Z.sqlite3',
      confirmed: true,
    });
  });

  it('does not expose workbook import in the normal navigation', async () => {
    render(<App bridge={createBridge()} />);

    await screen.findByRole('button', { name: 'Debts' });

    expect(screen.queryByRole('button', { name: 'Workbook import' })).toBeNull();
    expect('selectWorkbookForImport' in createBridge()).toBe(false);
  });

  it('keeps the primary navigation in the approved order', async () => {
    render(<App bridge={createBridge()} />);

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    await waitFor(() =>
      expect(within(navigation).getAllByRole('button')).toHaveLength(8),
    );
    expect(
      within(navigation)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Dashboard',
      'Milestones',
      'Debts',
      'Extra-cash allocation',
      'Payoff scenarios',
      'Reports',
      'Data health',
      'Data management',
    ]);
  });

  it('renders saved payoff scenarios and scenario-only assumptions', async () => {
    const bridge = createBridge();
    bridge.listPayoffScenarios = vi.fn(async () => ({
      ok: true as const,
      value: [samplePayoffScenario],
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Payoff scenarios' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Projection and payoff scenarios',
      }),
    ).toBeVisible();
    expect(screen.getAllByText('Generated avalanche scenario').length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText('Required payments only').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$11,250.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$1,250.00').length).toBeGreaterThan(0);
    expect(bridge.calculatePayoffBaseline).toHaveBeenCalledWith({
      scenarioStartDate: '2026-07-28',
      maxProjectionMonths: 360,
    });
    expect(
      screen.getByText(/do not create, edit, or post ledger transactions/i),
    ).toBeVisible();
    expect(screen.getByText(/highest interest rate/i)).toBeVisible();
    expect(screen.getByText(/Assumed total monthly cash requirement/i)).toBeVisible();
    expect(
      screen.getByRole('img', {
        name: /Projected total principal balance by scenario/i,
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByText('Payoff order summary'));
    expect(screen.getByText('Interest saved')).toBeVisible();
    fireEvent.click(screen.getByText('Monthly extra-payment allocation schedule'));
    expect(screen.getByText('Extra payment debt')).toBeVisible();
    expect(screen.getAllByText('$250.00').length).toBeGreaterThan(0);
  });

  it('uses debt names for custom payoff ordering instead of raw debt IDs', async () => {
    const bridge = createBridge();
    bridge.listDebts = vi.fn(async () => ({
      ok: true as const,
      value: [sampleDebtSummary],
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Payoff scenarios' }));
    fireEvent.change(await screen.findByLabelText('Payoff strategy'), {
      target: { value: 'custom' },
    });

    expect(screen.getByText('Custom payoff priority')).toBeVisible();
    expect(screen.getAllByText('Fictional Equipment Note').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Custom priority debt IDs')).toBeNull();
    expect(screen.getByRole('button', { name: 'Move up' })).toBeDisabled();
  });

  it('identifies unsupported payoff scenario debt results without precise interest totals', async () => {
    const bridge = createBridge();
    bridge.listPayoffScenarios = vi.fn(async () => ({
      ok: true as const,
      value: [unsupportedPayoffScenario],
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Payoff scenarios' }));

    expect(
      (await screen.findAllByText('Generated unsupported scenario')).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Assumptions, debt results, and warnings'));
    expect(screen.getAllByText('Unsupported').length).toBeGreaterThan(0);
    expect(screen.getByText('Not reliable')).toBeVisible();
    expect(
      screen.getByText(
        'Payment frequency irregular is not yet supported for reliable payoff projection.',
      ),
    ).toBeVisible();
  });

  it('renders the record-transaction form controls', () => {
    render(
      <RecordTransactionForm
        busy={false}
        debt={sampleDebtDetail}
        fieldErrors={undefined}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Transaction type/)).toBeVisible();
    expect(screen.getByLabelText(/Transaction date/)).toBeVisible();
    expect(screen.queryByLabelText(/Source type/)).toBeNull();
    expect(screen.getByLabelText(/Amount/)).toBeVisible();
    expect(screen.getByLabelText(/Principal/)).toBeVisible();
    expect(screen.queryByText(/Principal is auto-calculated/)).toBeNull();
    expect(screen.queryByLabelText(/Extra principal/)).toBeNull();
    expect(screen.queryByLabelText(/^Other/)).toBeNull();
  });

  it('auto-calculates principal for payment allocation entry', () => {
    const onSubmit = vi.fn();
    render(
      <RecordTransactionForm
        busy={false}
        debt={sampleDebtDetail}
        fieldErrors={undefined}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), {
      target: { value: '1000.00' },
    });
    expect(screen.getByLabelText(/Principal/)).toHaveValue('1000.00');

    fireEvent.change(screen.getByLabelText(/Interest/), {
      target: { value: '125.00' },
    });
    expect(screen.getByLabelText(/Principal/)).toHaveValue('875.00');

    fireEvent.change(screen.getByLabelText(/Escrow/), {
      target: { value: '200.00' },
    });
    fireEvent.change(screen.getByLabelText(/Fees/), {
      target: { value: '25.00' },
    });
    fireEvent.change(screen.getByLabelText(/Penalties/), {
      target: { value: '50.00' },
    });
    expect(screen.getByLabelText(/Principal/)).toHaveValue('600.00');

    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), {
      target: { value: '1200.00' },
    });
    expect(screen.getByLabelText(/Principal/)).toHaveValue('800.00');

    fireEvent.click(screen.getByRole('button', { name: 'Record transaction' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining({
          totalAmount: '1200.00',
          allocations: expect.objectContaining({
            principal: '800.00',
            interest: '125.00',
            escrow: '200.00',
            fee: '25.00',
            penalty: '50.00',
          }),
        }),
      }),
    );
  });

  it('blocks payment posting when nonprincipal allocations exceed the amount', () => {
    const onSubmit = vi.fn();
    render(
      <RecordTransactionForm
        busy={false}
        debt={sampleDebtDetail}
        fieldErrors={undefined}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), {
      target: { value: '100.00' },
    });
    fireEvent.change(screen.getByLabelText(/Interest/), {
      target: { value: '125.00' },
    });

    expect(
      screen.getByText(
        'Interest, escrow, fees, and penalties cannot exceed the payment amount.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record transaction' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Record transaction' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not carry auto-calculated payment principal into nonpayment transactions', () => {
    const onSubmit = vi.fn();
    render(
      <RecordTransactionForm
        busy={false}
        debt={sampleDebtDetail}
        fieldErrors={undefined}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), {
      target: { value: '125.00' },
    });
    expect(screen.getByLabelText(/Principal/)).toHaveValue('125.00');

    fireEvent.change(screen.getByLabelText(/Transaction type/), {
      target: { value: 'escrow_disbursement' },
    });
    expect(screen.getByLabelText(/Principal/)).toHaveValue('');

    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), {
      target: { value: '125.00' },
    });
    fireEvent.change(screen.getByLabelText(/Escrow/), {
      target: { value: '125.00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record transaction' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining({
          transactionType: 'escrow_disbursement',
          allocations: expect.objectContaining({
            principal: null,
            escrow: '125.00',
          }),
        }),
      }),
    );
  });

  it('renders the record-balance-reconciliation form controls', () => {
    render(
      <RecordBalanceReconciliationForm
        busy={false}
        debt={sampleDebtDetail}
        fieldErrors={undefined}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Reconciliation date/)).toBeVisible();
    expect(screen.getByLabelText(/Verified lender balance/)).toBeVisible();
    expect(screen.queryByLabelText(/Reconciliation status/)).toBeNull();
    expect(screen.queryByLabelText(/Explanation/)).toBeNull();
    expect(screen.queryByLabelText(/Supporting notes/)).toBeNull();
    expect(screen.queryByLabelText(/Include an approved adjustment/)).toBeNull();
    expect(screen.queryByLabelText(/Statement reference/)).toBeNull();
  });

  it('renders a recoverable failure state when the secure bridge fails', async () => {
    const bridge = createBridge();
    bridge.getDashboard = vi.fn(async () => {
      throw new Error('Generated bridge failure.');
    });

    render(<App bridge={bridge} />);

    expect(
      await screen.findByText(
        'The secure application bridge did not return a valid response.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
