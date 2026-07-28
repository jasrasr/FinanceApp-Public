// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DebtBridge } from '../../shared/app-bridge';
import type { DebtDetailDto, DebtSummaryDto } from '../../shared/debt-contracts';
import { App } from './app';
import { RecordBalanceSnapshotForm } from './components/record-balance-snapshot-form';
import { RecordBalanceReconciliationForm } from './components/record-balance-reconciliation-form';
import { RecordTransactionForm } from './components/record-transaction-form';

const createBridge = (): DebtBridge => ({
  listDebts: vi.fn(async () => ({ ok: true as const, value: [] })),
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

const sampleDebtDetail: DebtDetailDto = {
  id: '6cc0ac8c-f8d9-4de8-a6d2-1f0d3854c001',
  name: 'Fictional Equipment Note',
  creditor: 'Harbor Ridge Cooperative',
  ownerEntity: 'Generated Example Entity',
  debtType: 'business',
  purpose: 'Generated equipment acquisition',
  status: 'active',
  originalPrincipal: '125000.00',
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
    expect(
      await screen.findByRole('heading', { name: 'No debts to display' }),
    ).toBeVisible();
    expect(
      screen.getByRole('checkbox', { name: 'Include archived debts' }),
    ).not.toBeChecked();
  });

  it('renders the complete create-debt and initial-term form', async () => {
    render(<App bridge={createBridge()} />);

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

    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
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
    expect(screen.getByRole('button', { name: 'Record snapshot' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record reconciliation' })).toBeVisible();
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
    expect(screen.getByLabelText(/Source type/)).toBeVisible();
    expect(screen.getByLabelText(/Total amount/)).toBeVisible();
    expect(screen.getByLabelText(/Principal/)).toBeVisible();
  });

  it('renders the record-balance-snapshot form controls', () => {
    render(
      <RecordBalanceSnapshotForm
        busy={false}
        debt={sampleDebtDetail}
        fieldErrors={undefined}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Effective date/)).toBeVisible();
    expect(screen.getByLabelText(/Confirmed balance/)).toBeVisible();
    expect(screen.getByLabelText(/Source type/)).toBeVisible();
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

    expect(screen.getByLabelText(/Statement date/)).toBeVisible();
    expect(screen.getByLabelText(/Statement ending balance/)).toBeVisible();
    expect(screen.getByLabelText(/Reconciliation status/)).toBeVisible();
  });

  it('renders a recoverable failure state when the secure bridge fails', async () => {
    const bridge = createBridge();
    bridge.listDebts = vi.fn(async () => {
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
