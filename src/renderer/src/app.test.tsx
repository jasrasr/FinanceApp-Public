// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppBridge } from '../../shared/app-bridge';
import type {
  DashboardDto,
  DebtReportsDto,
  DebtDetailDto,
  DebtSummaryDto,
  ImportBatchDto,
  ImportPostingPreviewDto,
  PayoffScenarioDto,
} from '../../shared/debt-contracts';
import { App } from './app';
import { formatLastChanged } from './components/display-format';
import { RecordBalanceReconciliationForm } from './components/record-balance-reconciliation-form';
import { RecordTransactionForm } from './components/record-transaction-form';

const createBridge = (): AppBridge => ({
  appName: 'Debt Tracker',
  bridgeVersion: 14,
  appMetadata: {
    version: '0.14.0',
    lastChangedAtUtc: '2026-07-28T13:42:00.000Z',
  },
  listDebts: vi.fn(async () => ({ ok: true as const, value: [] })),
  getDashboard: vi.fn(async () => ({ ok: true as const, value: sampleDashboard })),
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
  selectWorkbookForImport: vi.fn(async () => ({
    ok: true as const,
    value: sampleImportBatch,
  })),
  listImportBatches: vi.fn(async () => ({ ok: true as const, value: [] })),
  getImportBatch: vi.fn(async () => ({ ok: true as const, value: sampleImportBatch })),
  previewImportBatchPosting: vi.fn(async () => ({
    ok: true as const,
    value: sampleImportPostingPreview,
  })),
  postImportBatch: vi.fn(async () => ({
    ok: true as const,
    value: { ...sampleImportPostingPreview, postedAtUtc: null, createdRecordCount: 0 },
  })),
  updateImportSheetMapping: vi.fn(async () => ({
    ok: true as const,
    value: sampleImportBatch,
  })),
  updateStagedImportRowReview: vi.fn(async () => ({
    ok: true as const,
    value: sampleImportBatch,
  })),
  createPayoffScenario: vi.fn(async () => ({
    ok: true as const,
    value: samplePayoffScenario,
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
  getDebt: vi.fn(),
  createDebt: vi.fn(),
  updateDebt: vi.fn(),
  addDebtTerm: vi.fn(),
  createDebtTransaction: vi.fn(),
  reverseDebtTransaction: vi.fn(),
  createBalanceSnapshot: vi.fn(),
  createBalanceReconciliation: vi.fn(),
  archiveDebt: vi.fn(),
  restoreDebt: vi.fn(),
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
  },
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
        interestActivity: '-100.00',
        adjustmentsAndOther: '0.00',
        endingBalance: '124500.13',
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
        interestActivity: '-100.00',
        adjustmentsAndOther: '0.00',
        endingBalance: '124500.13',
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
        effectiveDate: '2026-07-28',
        calculatedBalance: '124500.13',
        confirmedBalance: '124500.00',
        basis:
          'Calculated ledger balance and latest confirmed snapshot are shown separately.',
      },
    ],
  },
  activityTrends: {
    basis: sampleReportBasis,
    rows: [
      {
        period: '2026-01',
        principalReduction: '400.00',
        interestActivity: '-100.00',
        borrowings: '0.00',
        payments: '500.00',
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
  interestRateSensitivity: {
    basis: sampleReportBasis,
    rows: [
      {
        scenarioLabel: 'Current rates',
        assumption: 'Saved terms as of report effective date.',
        projectedPayoffDate: '2030-06-28',
        totalProjectedInterest: '11250.00',
        monthlyCashRequirement: '2450.00',
        warnings: [],
      },
    ],
  },
  extraPaymentSensitivity: {
    basis: sampleReportBasis,
    rows: [
      {
        scenarioLabel: 'Extra $250/month',
        assumption: 'Debt avalanche strategy with generated extra payment.',
        projectedPayoffDate: '2029-12-28',
        totalProjectedInterest: '10000.00',
        monthlyCashRequirement: '2700.00',
        warnings: [],
      },
    ],
  },
  actualVersusPlanVariance: {
    basis: sampleReportBasis,
    rows: [
      {
        scenarioId: '77777777-7777-4777-8777-777777777777',
        scenarioName: 'Generated avalanche scenario',
        debtId: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
        debtName: 'Fictional Equipment Note',
        actualPrincipalReduction: '400.00',
        plannedPrincipalReduction: null,
        variance: null,
        basis:
          'Saved payoff scenarios do not yet persist period-by-period planned balances.',
        warnings: ['Variance is limited until monthly plan snapshots are saved.'],
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

const sampleImportBatch: ImportBatchDto = {
  id: '44444444-4444-4444-4444-444444444444',
  sourceWorkbookName: 'generated-debt-schedule.xlsx',
  sourceWorkbookFingerprint: 'generated-fingerprint',
  sourceWorkbookModifiedAtUtc: '2026-07-28T10:00:00.000Z',
  status: 'open',
  importedAtUtc: '2026-07-28T10:00:00.000Z',
  createdAtUtc: '2026-07-28T10:00:00.000Z',
  updatedAtUtc: '2026-07-28T10:00:00.000Z',
  sheetMappings: [
    {
      id: '55555555-5555-5555-5555-555555555555',
      batchId: '44444444-4444-4444-4444-444444444444',
      sourceSheetName: 'Generated Transactions',
      proposedRecordType: 'transaction',
      reviewStatus: 'needs_review',
      fieldMapping: { date: 'date', amount: 'amount' },
      notes: null,
      createdAtUtc: '2026-07-28T10:00:00.000Z',
      updatedAtUtc: '2026-07-28T10:00:00.000Z',
    },
  ],
  stagedRows: [
    {
      id: '66666666-6666-6666-6666-666666666666',
      batchId: '44444444-4444-4444-4444-444444444444',
      sheetMappingId: '55555555-5555-5555-5555-555555555555',
      sourceSheetName: 'Generated Transactions',
      sourceRowNumber: 2,
      sourceCellReferences: { date: 'A2', amount: 'B2', status: 'C2' },
      sourceDisplayedValues: {
        date: '2026-01-15',
        amount: '-250.00',
        status: 'projected or actual',
      },
      sourceFormulas: { amount: 'B1*-1' },
      proposedRecordType: 'transaction',
      activityClassification: 'ambiguous',
      normalizedValues: {
        date: '2026-01-15',
        amount: '-250.00',
        status: 'projected or actual',
      },
      validationMessages: ['Actual versus projected classification requires review.'],
      duplicateCandidate: 'transaction:unknown:2026-01-15:-250.00',
      reconciliationException: null,
      reviewStatus: 'needs_review',
      reviewNotes: null,
      reviewedAtUtc: null,
      createdAtUtc: '2026-07-28T10:00:00.000Z',
      updatedAtUtc: '2026-07-28T10:00:00.000Z',
    },
  ],
  controlTotals: {
    totalRows: 1,
    needsReviewRows: 1,
    approvedRows: 0,
    rejectedRows: 0,
    deferredRows: 0,
    ambiguousRows: 1,
    duplicateCandidateRows: 1,
    invalidRows: 1,
    reconciliationExceptionRows: 0,
    candidateTotalsByType: {
      debt: 0,
      transaction: 1,
      term: 0,
      balance_snapshot: 0,
      unknown: 0,
    },
  },
};

const sampleImportPostingPreview: ImportPostingPreviewDto = {
  batchId: '44444444-4444-4444-4444-444444444444',
  batchStatus: 'open',
  approvedMappings: 0,
  unapprovedMappings: 1,
  approvedRows: 0,
  rejectedRows: 0,
  deferredRows: 0,
  postableRows: 0,
  exceptionRows: 1,
  alreadyPosted: false,
  rowResults: [
    {
      stagedRowId: '66666666-6666-6666-6666-666666666666',
      sourceSheetName: 'Generated Transactions',
      sourceRowNumber: 2,
      proposedRecordType: 'transaction',
      reviewStatus: 'needs_review',
      canPost: false,
      validationMessages: ['Actual versus projected classification requires review.'],
      createdRecords: [],
    },
  ],
};

const samplePayoffScenario: PayoffScenarioDto = {
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Generated avalanche scenario',
  strategy: 'avalanche',
  status: 'active',
  scenarioStartDate: '2026-07-28',
  extraMonthlyPayment: '250.00',
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
  creditLimit: null,
  collateralDescription: 'Generated equipment description',
  taxCategory: 'business',
  deductiblePercentage: '37.25',
  notes: 'Fictional detail record.',
  terms: [
    {
      id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c011',
      effectiveStartDate: '2025-01-15',
      effectiveEndDate: null,
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
      explanation: 'Generated reconciliation.',
      approvedAdjustmentTransactionId: null,
      sourceReference: 'STAT-2026-01',
      supportingNotes: null,
      createdAtUtc: '2026-07-27T13:00:00.000Z',
      updatedAtUtc: '2026-07-27T13:00:00.000Z',
    },
  ],
  calculatedEscrowBalance: '0.00',
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
    expect(screen.getByLabelText(/Effective start date/)).toBeVisible();
    expect(screen.getByLabelText(/Annual interest rate/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create debt' })).toBeVisible();
  });

  it('renders posted-activity and snapshot sections on the debt detail screen', async () => {
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
      await screen.findByRole('button', { name: /Open Fictional Equipment Note/ }),
    );
    expect(
      await screen.findByRole('heading', { name: sampleDebtDetail.name }),
    ).toBeVisible();

    expect(
      await screen.findByRole('heading', { name: 'Posted transactions' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Confirmed balance snapshots' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Balance reconciliations' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record transaction' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Record snapshot' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reconcile balance' })).toBeVisible();
  });

  it('renders dashboard metrics and empty dashboard sections', async () => {
    render(<App bridge={createBridge()} />);

    expect(await screen.findByRole('heading', { name: 'Debt overview' })).toBeVisible();
    expect(screen.getByText('$124,500.00')).toBeVisible();
    expect(screen.getByText('Principal reduction YTD')).toBeVisible();
    expect(
      screen.getByText(
        'No unreconciled, in-progress, or exception reconciliation items for active debts.',
      ),
    ).toBeVisible();
  });

  it('renders application version and local last-changed metadata', async () => {
    const bridge = createBridge();
    render(<App bridge={bridge} />);

    expect(await screen.findByText('Version 0.14.0')).toBeVisible();
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
    const trendsSummary = screen.getByText(
      'Principal, interest, borrowing, and payment trends',
    );
    const trendsReport = trendsSummary.closest('details');
    expect(trendsReport).not.toHaveAttribute('open');
    fireEvent.click(trendsSummary);
    expect(trendsReport).toHaveAttribute('open');
    expect(
      screen.getAllByText(
        /Application-calculated ledger balances from posted actual activity/i,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('img', { name: /principal reduction by period/i }),
    ).toBeVisible();
    expect(bridge.getDebtReports).toHaveBeenCalledWith({
      startDate: null,
      endDate: null,
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });
  });

  it('renders data-management status and runs backup and export actions', async () => {
    const bridge = createBridge();
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Data management' }));

    expect(
      await screen.findByRole('heading', { name: 'Backup, restore, and export' }),
    ).toBeVisible();
    expect(screen.getByText('manual-2026-07-28T134400-000Z.sqlite3')).toBeVisible();
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
  });

  it('renders the workbook import empty state', async () => {
    render(<App bridge={createBridge()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Workbook import' }));

    expect(
      await screen.findByRole('heading', { name: 'Stage and map workbook rows' }),
    ).toBeVisible();
    expect(screen.getByText(/No staged workbook imports yet/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Select workbook' })).toBeVisible();
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
    expect(screen.getByText('Generated avalanche scenario')).toBeVisible();
    expect(screen.getAllByText('$11,250.00').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/do not create, edit, or post ledger transactions/i),
    ).toBeVisible();
  });

  it('identifies unsupported payoff scenario debt results without precise interest totals', async () => {
    const bridge = createBridge();
    bridge.listPayoffScenarios = vi.fn(async () => ({
      ok: true as const,
      value: [unsupportedPayoffScenario],
    }));
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Payoff scenarios' }));

    expect(await screen.findByText('Generated unsupported scenario')).toBeVisible();
    fireEvent.click(screen.getByText('Assumptions, debt results, and warnings'));
    expect(screen.getAllByText('Unsupported').length).toBeGreaterThan(0);
    expect(screen.getByText('Not reliable')).toBeVisible();
    expect(
      screen.getByText(
        'Payment frequency irregular is not yet supported for reliable payoff projection.',
      ),
    ).toBeVisible();
  });

  it('stages a generated workbook and displays review-only import rows', async () => {
    const bridge = createBridge();
    render(<App bridge={bridge} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Workbook import' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select workbook' }));

    expect(await screen.findByText('generated-debt-schedule.xlsx')).toBeVisible();
    expect(screen.getByText('Ambiguous rows')).toBeVisible();
    expect(screen.getByText('Posting preview')).toBeVisible();
    expect(
      screen.getByText('Actual versus projected classification requires review.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Post approved rows' })).toBeDisabled();
    expect(screen.getAllByText('Generated Transactions row 2')).toHaveLength(2);
    expect(screen.getByText('Formula source preserved')).toBeVisible();
    expect(bridge.selectWorkbookForImport).toHaveBeenCalledWith({});
    expect(bridge.previewImportBatchPosting).toHaveBeenCalledWith({
      batchId: sampleImportBatch.id,
    });
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
    expect(screen.queryByLabelText(/Extra principal/)).toBeNull();
    expect(screen.queryByLabelText(/^Other/)).toBeNull();
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
    expect(screen.getByLabelText(/Include an approved adjustment/)).toBeVisible();
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
