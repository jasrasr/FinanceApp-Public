// @vitest-environment node

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreateDebtRequest } from '../../shared/debt-contracts';
import type { DatabaseContext } from '../database/connection';
import { openMigratedDatabase } from '../database/connection';
import {
  auditEvents,
  balanceReconciliations,
  balanceSnapshots,
  debtTerms,
  debtTransactions,
  debts,
  importBatches,
  importPostings,
  importSheetMappings,
  payoffScenarios,
  refinanceEvents,
  stagedImportRows,
  transactionAllocations,
} from '../database/schema';
import {
  createTemporaryDatabaseLocation,
  type TemporaryDatabaseLocation,
} from '../database/temporary-database';
import { deleteDebtPermanentlyRecord } from '../database/debt-maintenance-repository';
import { ApplicationServiceError } from './application-error';
import { createDataManagementService } from './data-management-service';
import {
  createDebtMaintenanceService,
  type DebtMaintenanceService,
} from './debt-maintenance-service';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'drizzle');

let context: DatabaseContext;
let temporary: TemporaryDatabaseLocation;
let service: DebtMaintenanceService;
let clock: number;

const validRequest = (name = 'Fictional Equipment Note'): CreateDebtRequest => ({
  debt: {
    name,
    creditor: 'Harbor Ridge Cooperative',
    ownerEntity: 'Generated Example Entity',
    debtType: 'business',
    purpose: 'Generated equipment acquisition',
    status: 'active',
    originalPrincipal: '$125,000.125',
    originationDate: '2025-01-15',
    maturityDate: '2030-01-15',
    minimumPayment: '2,450.00',
    paymentFrequency: 'monthly',
    paymentDueDay: null,
    paymentScheduleStartDate: null,
    creditLimit: null,
    collateralDescription: 'Generated equipment description',
    taxCategory: 'business',
    deductiblePercentage: '37.25%',
    financingChainName: null,
    refinancedFromDebtId: null,
    refinancedIntoDebtId: null,
    refinanceDate: null,
    notes: 'Fictional integration-test record.',
  },
  initialTerm: {
    effectiveStartDate: '2025-01-15',
    interestRateType: 'fixed',
    annualInterestRatePercent: '5.4900%',
    dayCountConvention: 'actual_365',
    calculationConvention: 'simple_daily',
    requiredPayment: '$2,450.00',
    paymentFrequency: 'monthly',
    notes: 'Generated opening terms.',
  },
});

const validTransactionRequest = (debtId: string) => ({
  debtId,
  transaction: {
    transactionType: 'payment' as const,
    effectiveDate: '2026-01-15',
    postingDate: '2026-01-16',
    status: 'posted' as const,
    totalAmount: '500.00',
    description: 'Generated payment.',
    sourceType: 'manual' as const,
    sourceReference: 'CHK-1001',
    allocations: {
      principal: '400.00',
      interest: '100.00',
      escrow: null,
      fee: null,
      penalty: null,
      extraPrincipal: null,
      other: null,
    },
  },
});

const validSnapshotRequest = (debtId: string) => ({
  debtId,
  snapshot: {
    effectiveDate: '2026-01-31',
    confirmedBalance: '124500.00',
    sourceType: 'statement' as const,
    sourceReference: 'STAT-2026-01',
    notes: 'Generated statement balance.',
  },
});

const validBorrowingRequest = (debtId: string) => ({
  debtId,
  transaction: {
    transactionType: 'borrowing_draw' as const,
    effectiveDate: '2026-02-01',
    postingDate: '2026-02-01',
    status: 'posted' as const,
    totalAmount: '1000.00',
    description: 'Generated borrowing draw.',
    sourceType: 'manual' as const,
    sourceReference: 'DRAW-1001',
    allocations: {
      principal: '1000.00',
      interest: null,
      escrow: null,
      fee: null,
      penalty: null,
      extraPrincipal: null,
      other: null,
    },
  },
});

const validReconciliationRequest = (debtId: string) => ({
  debtId,
  reconciliation: {
    statementDate: '2026-01-31',
    statementEndingBalance: '124600.13',
    reconciliationStatus: 'reconciled' as const,
    explanation: 'Generated statement matches the calculated ledger balance.',
    approvedAdjustment: null,
    sourceReference: 'STAT-2026-01',
    supportingNotes: 'Fictional reconciliation support.',
  },
});

const createService = (createId: () => string = randomUUID): DebtMaintenanceService =>
  createDebtMaintenanceService({
    database: context.database,
    createId,
    now: () => {
      clock += 1_000;
      return new Date(clock).toISOString();
    },
  });

beforeEach(() => {
  temporary = createTemporaryDatabaseLocation();
  context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);
  clock = Date.parse('2026-07-27T13:00:00.000Z');
  service = createService();
});

afterEach(() => {
  context.close();
  temporary.cleanup();
});

describe('debt creation', () => {
  it('creates a valid debt and initial term with scaled boundary values', () => {
    const detail = service.createDebt(validRequest());
    const debtRow = context.database
      .select()
      .from(debts)
      .where(eq(debts.id, detail.id))
      .get();
    const termRow = context.database
      .select()
      .from(debtTerms)
      .where(eq(debtTerms.debtId, detail.id))
      .get();

    expect(debtRow).toMatchObject({
      deductiblePercentageBps: 3_725,
      originalPrincipalCents: 12_500_013,
    });
    expect(termRow).toMatchObject({
      interestRateMicros: 54_900,
      requiredPaymentCents: 245_000,
    });
    expect(detail.terms).toHaveLength(1);
    expect(context.database.select().from(auditEvents).all()).toHaveLength(2);
  });

  it('rejects invalid debt validation without inserting a debt', () => {
    const request = validRequest();
    request.debt.name = '';

    expect(() => service.createDebt(request)).toThrow(ApplicationServiceError);
    expect(context.database.select().from(debts).all()).toHaveLength(0);
  });

  it('rejects invalid initial-term validation without inserting a debt', () => {
    const request = validRequest();
    request.initialTerm.interestRateType = 'zero';

    expect(() => service.createDebt(request)).toThrow('Review the highlighted fields.');
    expect(context.database.select().from(debts).all()).toHaveLength(0);
    expect(context.database.select().from(debtTerms).all()).toHaveLength(0);
  });

  it('records a posted transaction with allocations and audit events', () => {
    const created = service.createDebt(validRequest());
    const updated = service.createDebtTransaction(validTransactionRequest(created.id));
    const transactions = context.database.select().from(debtTransactions).all();
    const allocations = context.database.select().from(transactionAllocations).all();
    const eventTypes = context.database
      .select({ eventType: auditEvents.eventType })
      .from(auditEvents)
      .all()
      .map((event) => event.eventType);

    expect(updated.transactions).toHaveLength(1);
    expect(updated.transactions[0]).toMatchObject({
      transactionType: 'payment',
      totalAmount: '-500.00',
      status: 'posted',
    });
    expect(transactions).toHaveLength(1);
    expect(allocations).toHaveLength(2);
    expect(eventTypes).toContain('transaction_recorded');
  });

  it('records linked transfers without changing portfolio debt, payment cash flow, or borrowing totals', () => {
    const source = service.createDebt(validRequest('Fictional Card A'));
    const destination = service.createDebt(validRequest('Fictional HELOC B'));
    const before = service.getDashboard({}).totals;
    const sourceAfter = service.createDebtTransfer({
      sourceDebtId: source.id,
      destinationDebtId: destination.id,
      effectiveDate: '2026-02-01',
      postingDate: '2026-02-01',
      amount: '8000.00',
      description: 'Generated balance transfer.',
      sourceReference: 'TRANSFER-8000',
    });
    const destinationAfter = service.getDebt({ id: destination.id });
    expect(sourceAfter.currentBalance).toBe('117000.13');
    expect(destinationAfter.currentBalance).toBe('133000.13');
    expect(service.getDashboard({}).totals.activeDebt).toBe(before.activeDebt);
    expect(service.getDashboard({}).totals.newBorrowingsYtd).toBe(
      before.newBorrowingsYtd,
    );
    expect(service.getDashboard({}).totals.principalReductionYtd).toBe(
      before.principalReductionYtd,
    );
    const transferRows = sourceAfter.transactions.filter(
      (transaction) => transaction.transactionType === 'transfer',
    );
    expect(transferRows).toHaveLength(1);
    expect(transferRows[0]?.transferId).toBeTruthy();
    const reports = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-02-28',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });
    const february = reports.monthlyRollforward.rows.find(
      (row) => row.period === '2026-02',
    );
    expect(february).toMatchObject({
      purchases: '0.00',
      transferIn: '8000.00',
      transferOut: '8000.00',
      netTransfers: '0.00',
      principalReduction: '0.00',
      payments: '0.00',
      borrowings: '0.00',
    });
    expect(reports.progressSummary).toMatchObject({
      purchases: '0.00',
      newBorrowing: '0.00',
      netDebtReduction: '0.00',
      transferIn: '8000.00',
      transferOut: '8000.00',
      netTransfers: '0.00',
    });
    const destinationReport = service.getDebtReports({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      debtId: destination.id,
      ownerEntity: null,
      debtType: null,
      status: null,
    });
    expect(destinationReport.monthlyRollforward.rows[0]).toMatchObject({
      transferIn: '8000.00',
      transferOut: '0.00',
      netTransfers: '8000.00',
    });
    const transfer = transferRows[0]!;
    service.reverseDebtTransaction({
      id: transfer.id,
      expectedUpdatedAtUtc: transfer.updatedAtUtc,
      reversalDate: '2026-02-02',
      confirmed: true,
    });
    expect(service.getDebt({ id: source.id }).currentBalance).toBe('125000.13');
    expect(service.getDebt({ id: destination.id }).currentBalance).toBe('125000.13');
    const linkedRows = context.database
      .select()
      .from(debtTransactions)
      .all()
      .filter((row) => row.transferId === transfer.transferId);
    expect(linkedRows.filter((row) => row.transactionType === 'reversal')).toHaveLength(
      2,
    );
    expect(() =>
      service.reverseDebtTransaction({
        id: transfer.id,
        expectedUpdatedAtUtc: transfer.updatedAtUtc,
        reversalDate: '2026-02-03',
        confirmed: true,
      }),
    ).toThrow('Only a currently posted transaction can be reversed.');
    const reversal = linkedRows.find((row) => row.transactionType === 'reversal')!;
    expect(() =>
      service.reverseDebtTransaction({
        id: reversal.id,
        expectedUpdatedAtUtc: reversal.updatedAtUtc,
        reversalDate: '2026-02-03',
        confirmed: true,
      }),
    ).toThrow('Generated reversal transactions cannot be reversed.');
  });

  it('rejects isolated transfer creation and blocks deletion that would orphan transfer history', () => {
    const source = service.createDebt(validRequest('Fictional Transfer Source'));
    const destination = service.createDebt(
      validRequest('Fictional Transfer Destination'),
    );
    expect(() =>
      service.createDebtTransaction({
        debtId: source.id,
        transaction: {
          ...validBorrowingRequest(source.id).transaction,
          transactionType: 'transfer',
          transferId: randomUUID(),
        },
      }),
    ).toThrow('Use the debt transfer workflow');

    const sourceAfter = service.createDebtTransfer({
      sourceDebtId: source.id,
      destinationDebtId: destination.id,
      effectiveDate: '2026-02-01',
      postingDate: '2026-02-01',
      amount: '8000.00',
      description: 'Generated deletion-protection transfer.',
      sourceReference: 'TRANSFER-DELETE-GUARD',
    });
    expect(() =>
      service.deleteDebtPermanently(
        {
          id: source.id,
          expectedUpdatedAtUtc: sourceAfter.updatedAtUtc,
          typedDebtName: 'Fictional Transfer Source',
          confirmed: true,
          secondConfirmed: true,
        },
        'validated-generated-backup.sqlite3',
      ),
    ).toThrow('transfer history is linked to another debt');
    expect(service.getDebt({ id: destination.id }).transactions).toHaveLength(1);
  });

  it('keeps credit-card purchases separate from borrowing draws', () => {
    const request = validRequest('Fictional Credit Card');
    request.debt.debtType = 'credit_card';
    request.debt.creditLimit = '25000.00';
    const card = service.createDebt(request);
    service.createDebtTransaction({
      debtId: card.id,
      transaction: {
        ...validBorrowingRequest(card.id).transaction,
        transactionType: 'purchase',
        totalAmount: '800.00',
        description: 'Generated card purchase.',
        allocations: {
          ...validBorrowingRequest(card.id).transaction.allocations,
          principal: '800.00',
        },
      },
    });
    service.createDebtTransaction(validBorrowingRequest(card.id));
    expect(service.getDebt({ id: card.id }).currentBalance).toBe('126800.13');
    const reports = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-02-28',
      debtId: card.id,
      ownerEntity: null,
      debtType: null,
      status: null,
    });
    const february = reports.monthlyRollforward.rows.find(
      (row) => row.period === '2026-02',
    );
    expect(february).toMatchObject({ purchases: '800.00', borrowings: '1000.00' });
    expect(february?.rollforwardCheck).toBe('0.00');
    expect(
      reports.creditCardActivity.rows.find((row) => row.period === '2026-02'),
    ).toMatchObject({
      purchases: '800.00',
      borrowings: '1000.00',
      rollforwardCheck: '0.00',
    });
    expect(reports.creditCardActivity.cards).toHaveLength(1);
    expect(reports.creditCardActivity.cards[0]).toMatchObject({
      debtId: card.id,
      purchases: '800.00',
      borrowings: '1000.00',
      currentBalance: '126800.13',
    });
    expect(reports.cashFlowAnalysis.rows[1]).toMatchObject({
      totalPayments: '0.00',
      paymentCount: 0,
    });
    expect(service.getDashboard({}).totals).toMatchObject({
      principalReductionYtd: '0.00',
      purchaseChargesYtd: '800.00',
      newBorrowingsYtd: '1000.00',
      netDebtReductionYtd: '-1800.00',
    });
    const balanceBeforeAnalysis = service.getDebt({ id: card.id }).currentBalance;
    service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-02-28',
      debtId: null,
      ownerEntity: null,
      debtType: 'credit_card',
      status: 'active',
    });
    expect(service.getDebt({ id: card.id }).currentBalance).toBe(balanceBeforeAnalysis);
  });

  it('accepts positive simplified transaction input without user-facing source or description fields', () => {
    const created = service.createDebt(validRequest());
    const updated = service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2026-02-01',
        postingDate: '2026-02-01',
        status: 'posted',
        totalAmount: '750.00',
        description: null,
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '600.00',
          interest: '150.00',
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    expect(updated.transactions[0]).toMatchObject({
      effectiveDate: '2026-02-01',
      postingDate: '2026-02-01',
      sourceType: 'manual',
      sourceReference: null,
    });
    expect(updated.transactions[0]?.description).toContain('Manual payment');
    expect(updated.transactions[0]?.totalAmount).toBe('-750.00');
  });

  it('normalizes positive user-entered transaction amounts to ledger signs by transaction type', () => {
    const created = service.createDebt(validRequest());
    const post = (
      transactionType:
        'payment' | 'borrowing_draw' | 'fee' | 'escrow_disbursement' | 'escrow_refund',
      amount: string,
      allocations: Record<string, string | null>,
    ) =>
      service.createDebtTransaction({
        debtId: created.id,
        transaction: {
          transactionType,
          effectiveDate: '2026-02-01',
          postingDate: '2026-02-01',
          status: 'posted',
          totalAmount: amount,
          description: null,
          sourceType: 'manual',
          sourceReference: null,
          allocations: {
            principal: allocations.principal ?? null,
            interest: allocations.interest ?? null,
            escrow: allocations.escrow ?? null,
            fee: allocations.fee ?? null,
            penalty: allocations.penalty ?? null,
            extraPrincipal: null,
            other: null,
          },
        },
      });

    post('payment', '500.00', { principal: '400.00', interest: '100.00' });
    post('borrowing_draw', '250.00', { principal: '250.00' });
    post('fee', '25.00', { fee: '25.00' });
    post('payment', '300.00', { escrow: '300.00' });
    post('escrow_disbursement', '125.00', { escrow: '125.00' });
    post('escrow_refund', '50.00', { escrow: '50.00' });

    const persisted = context.database
      .select()
      .from(debtTransactions)
      .where(eq(debtTransactions.debtId, created.id))
      .all();
    const signsByType = new Map(
      persisted.map((transaction) => [
        transaction.transactionType,
        transaction.totalAmountCents,
      ]),
    );

    expect(signsByType.get('payment')).toBe(-30_000);
    expect(signsByType.get('borrowing_draw')).toBe(25_000);
    expect(signsByType.get('fee')).toBe(2_500);
    expect(signsByType.get('escrow_disbursement')).toBe(12_500);
    expect(signsByType.get('escrow_refund')).toBe(5_000);

    const cashFlow = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-02-28',
      debtId: created.id,
      ownerEntity: null,
      debtType: null,
      status: null,
    }).cashFlowAnalysis;
    expect(cashFlow.rows[1]).toMatchObject({
      totalPayments: '800.00',
      principal: '400.00',
      interest: '100.00',
      fees: '25.00',
      paymentCount: 2,
    });
    expect(cashFlow.debts[0]).toMatchObject({
      totalPayments: '800.00',
      principalPaid: '400.00',
      interestPaid: '100.00',
    });

    const latest = service.getDebt({ id: created.id });
    expect(latest.calculatedEscrowBalance).toBe('125.00');
  });

  it('aggregates actual income transactions without mutating ledger activity', () => {
    const created = service.createDebt(validRequest('Generated Income Analysis Debt'));
    const beforeTransactions = context.database.select().from(debtTransactions).all();
    const beforeBalance = service.getDebt({ id: created.id }).currentBalance;

    service.createIncomeTransaction({
      receivedDate: '2026-01-15',
      amount: '3250.00',
      incomeType: 'regular_paycheck',
      source: 'Generated Employer',
      notes: null,
      grossAmount: '4500.00',
      netAmount: '3250.00',
    });
    service.createIncomeTransaction({
      receivedDate: '2026-01-29',
      amount: '3250.00',
      incomeType: 'regular_paycheck',
      source: 'Generated Employer',
      notes: null,
      grossAmount: '4500.00',
      netAmount: '3250.00',
    });
    service.createIncomeTransaction({
      receivedDate: '2026-03-15',
      amount: '1000.00',
      incomeType: 'bonus',
      source: 'Generated Employer',
      notes: 'Generated bonus',
      grossAmount: '1400.00',
      netAmount: '1000.00',
    });

    const cashFlow = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    }).cashFlowAnalysis;

    expect(cashFlow.incomeDataAvailable).toBe(true);
    expect(cashFlow.incomeRows.map((row) => row.netIncome)).toEqual([
      '6500.00',
      null,
      '1000.00',
    ]);
    expect(cashFlow.incomeRows[0]?.grossIncome).toBe('9000.00');
    expect(cashFlow.incomeRows[0]?.debtPaymentsPercentNet).toBe('0.0%');
    expect(context.database.select().from(debtTransactions).all()).toEqual(
      beforeTransactions,
    );
    expect(service.getDebt({ id: created.id }).currentBalance).toBe(beforeBalance);

    const secondIncome = service.listIncomeTransactions({ includeArchived: false })[1]!;
    const updatedIncome = service.updateIncomeTransaction({
      id: secondIncome.id,
      expectedUpdatedAtUtc: secondIncome.updatedAtUtc,
      receivedDate: secondIncome.receivedDate,
      amount: '3300.00',
      incomeType: secondIncome.incomeType,
      source: secondIncome.source,
      notes: secondIncome.notes,
      grossAmount: '4550.00',
      netAmount: '3300.00',
    });
    expect(updatedIncome.amount).toBe('3300.00');

    const firstIncome = service.listIncomeTransactions({ includeArchived: false })[0]!;
    service.archiveIncomeTransaction({
      id: firstIncome.id,
      expectedUpdatedAtUtc: firstIncome.updatedAtUtc,
    });
    expect(service.listIncomeTransactions({ includeArchived: false })).toHaveLength(2);
  });

  it('leaves income ratios unavailable when no income transaction exists', () => {
    service.createDebt(validRequest('Generated Missing Income Debt'));
    const cashFlow = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    }).cashFlowAnalysis;
    expect(cashFlow.incomeDataAvailable).toBe(false);
    expect(cashFlow.incomeRows[0]).toMatchObject({
      netIncome: null,
      debtPaymentsPercentNet: null,
      remainingNetIncome: null,
    });
  });

  it('edits a posted payment by superseding it with a linked reversal and replacement', () => {
    const created = service.createDebt(validRequest());
    const afterPayment = service.createDebtTransaction(
      validTransactionRequest(created.id),
    );
    const original = afterPayment.transactions[0]!;

    const updated = service.editDebtTransaction({
      id: original.id,
      debtId: created.id,
      expectedUpdatedAtUtc: original.updatedAtUtc,
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2026-01-15',
        postingDate: '2026-01-15',
        status: 'posted',
        totalAmount: '500.00',
        description: 'Generated corrected payment.',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '450.00',
          interest: '50.00',
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    const transactions = context.database
      .select()
      .from(debtTransactions)
      .where(eq(debtTransactions.debtId, created.id))
      .all();
    const originalRecord = transactions.find(
      (transaction) => transaction.id === original.id,
    );
    const reversal = transactions.find(
      (transaction) => transaction.reversalOfTransactionId === original.id,
    );
    const replacement = transactions.find(
      (transaction) => transaction.supersedesTransactionId === original.id,
    );
    const dashboard = service.getDashboard({});
    const reports = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });
    const eventTypes = context.database
      .select({ eventType: auditEvents.eventType })
      .from(auditEvents)
      .all()
      .map((event) => event.eventType);

    expect(originalRecord?.status).toBe('superseded');
    expect(reversal).toMatchObject({
      transactionType: 'reversal',
      totalAmountCents: 50_000,
      reversalOfTransactionId: original.id,
    });
    expect(replacement).toMatchObject({
      transactionType: 'payment',
      totalAmountCents: -50_000,
      supersedesTransactionId: original.id,
    });
    expect(updated.currentBalance).toBe('124550.13');
    expect(dashboard.totals.principalReductionYtd).toBe('450.00');
    expect(dashboard.totals.interestActivityYtd).toBe('50.00');
    expect(reports.monthlyRollforward.rows[0]).toEqual(
      expect.objectContaining({
        principalReduction: '450.00',
        endingBalance: '124550.13',
      }),
    );
    expect(reports.cashFlowAnalysis.rows[0]).toMatchObject({
      totalPayments: '500.00',
      paymentCount: 1,
    });
    expect(eventTypes).toContain('transaction_superseded');
    expect(eventTypes).toContain('transaction_replacement_recorded');
  });

  it('uses one current transaction-chain calculation for edited and voided escrow activity', () => {
    const request = validRequest('Generated Escrow Integrity Mortgage');
    request.debt.debtType = 'mortgage';
    request.debt.taxCategory = 'mortgage_interest';
    request.debt.originalPrincipal = '100000.00';
    request.debt.originationDate = '2026-01-01';
    request.initialTerm.effectiveStartDate = '2026-01-01';
    const created = service.createDebt(request);

    service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2026-03-01',
        postingDate: '2026-03-01',
        status: 'posted',
        totalAmount: '1500.00',
        description: 'Generated mortgage payment with escrow.',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '1000.00',
          interest: '300.00',
          escrow: '200.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    const afterExpense = service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'escrow_disbursement',
        effectiveDate: '2026-03-15',
        postingDate: '2026-03-15',
        status: 'posted',
        totalAmount: '75.00',
        description: 'Generated real estate tax payment.',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: null,
          interest: null,
          escrow: '75.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    const expense = afterExpense.transactions.find(
      (transaction) => transaction.transactionType === 'escrow_disbursement',
    )!;

    const afterEdit = service.editDebtTransaction({
      id: expense.id,
      debtId: created.id,
      expectedUpdatedAtUtc: expense.updatedAtUtc,
      transaction: {
        transactionType: 'escrow_disbursement',
        effectiveDate: '2026-03-15',
        postingDate: '2026-03-15',
        status: 'posted',
        totalAmount: '50.00',
        description: 'Generated corrected real estate tax payment.',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: null,
          interest: null,
          escrow: '50.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    const dashboardAfterEdit = service.getDashboard({});
    const dashboardEscrow = dashboardAfterEdit.escrowBalances.find(
      (item) => item.debtId === created.id,
    );

    expect(afterEdit.calculatedEscrowBalance).toBe('150.00');
    expect(dashboardAfterEdit.totals.escrowBalance).toBe('150.00');
    expect(dashboardEscrow?.amount).toBe('150.00');

    const replacement = afterEdit.transactions.find(
      (transaction) => transaction.supersedesTransactionId === expense.id,
    )!;
    const afterVoid = service.voidDebtTransaction({
      id: replacement.id,
      expectedUpdatedAtUtc: replacement.updatedAtUtc,
      voidDate: '2026-03-15',
      confirmed: true,
    });
    const dashboardAfterVoid = service.getDashboard({});
    const originalRecord = context.database
      .select()
      .from(debtTransactions)
      .where(eq(debtTransactions.id, replacement.id))
      .get();
    const voidingReversal = context.database
      .select()
      .from(debtTransactions)
      .where(eq(debtTransactions.reversalOfTransactionId, replacement.id))
      .get();

    expect(afterVoid.calculatedEscrowBalance).toBe('200.00');
    expect(dashboardAfterVoid.totals.escrowBalance).toBe('200.00');
    expect(originalRecord?.status).toBe('voided');
    expect(voidingReversal).toMatchObject({
      transactionType: 'reversal',
      totalAmountCents: -5_000,
      reversalOfTransactionId: replacement.id,
    });
  });

  it('prevents duplicate active replacements for a transaction edit', () => {
    const created = service.createDebt(validRequest());
    const afterPayment = service.createDebtTransaction(
      validTransactionRequest(created.id),
    );
    const original = afterPayment.transactions[0]!;
    const request = {
      ...validTransactionRequest(created.id),
      id: original.id,
      expectedUpdatedAtUtc: original.updatedAtUtc,
    };

    service.editDebtTransaction(request);

    expect(() => service.editDebtTransaction(request)).toThrow(
      /already has a current replacement/,
    );
  });

  it('marks current reconciliations for review when edited activity affects the statement date', () => {
    const created = service.createDebt(validRequest());
    const afterPayment = service.createDebtTransaction(
      validTransactionRequest(created.id),
    );
    const original = afterPayment.transactions[0]!;
    service.createBalanceReconciliation(validReconciliationRequest(created.id));

    const updated = service.editDebtTransaction({
      id: original.id,
      debtId: created.id,
      expectedUpdatedAtUtc: original.updatedAtUtc,
      transaction: {
        ...validTransactionRequest(created.id).transaction,
        totalAmount: '500.00',
        allocations: {
          principal: '450.00',
          interest: '50.00',
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    const currentReconciliation = updated.balanceReconciliations.find(
      (reconciliation) => reconciliation.lifecycleStatus === 'current',
    );

    expect(currentReconciliation).toMatchObject({
      reconciliationStatus: 'exception',
    });
  });

  it('tracks mortgage escrow deposits and disbursements separately from principal debt balance', () => {
    const request = validRequest('Fictional Mortgage With Escrow');
    request.debt.debtType = 'mortgage';
    request.debt.taxCategory = 'mortgage_interest';
    const created = service.createDebt(request);

    const afterPayment = service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2026-03-01',
        postingDate: '2026-03-01',
        status: 'posted',
        totalAmount: '1800.00',
        description: null,
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '1000.00',
          interest: '500.00',
          escrow: '300.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    const afterDisbursement = service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'escrow_disbursement',
        effectiveDate: '2026-04-01',
        postingDate: '2026-04-01',
        status: 'posted',
        totalAmount: '125.00',
        description: 'Generated real estate tax escrow disbursement.',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: null,
          interest: null,
          escrow: '125.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    expect(afterPayment.calculatedEscrowBalance).toBe('300.00');
    expect(afterDisbursement.calculatedEscrowBalance).toBe('175.00');
    expect(
      afterDisbursement.transactions
        .flatMap((transaction) => transaction.allocations)
        .filter((allocation) => allocation.allocationType === 'escrow'),
    ).toHaveLength(2);
  });

  it('records a confirmed balance snapshot without altering posted activity', () => {
    const created = service.createDebt(validRequest());
    const updated = service.createBalanceSnapshot(validSnapshotRequest(created.id));
    const snapshots = context.database.select().from(balanceSnapshots).all();
    const eventTypes = context.database
      .select({ eventType: auditEvents.eventType })
      .from(auditEvents)
      .all()
      .map((event) => event.eventType);

    expect(updated.transactions).toHaveLength(0);
    expect(updated.balanceSnapshots).toHaveLength(1);
    expect(snapshots).toHaveLength(1);
    expect(eventTypes).toContain('balance_snapshot_recorded');
  });

  it('records a reconciliation using the calculated ledger balance through the statement date', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));

    const updated = service.createBalanceReconciliation(
      validReconciliationRequest(created.id),
    );
    const reconciliations = context.database
      .select()
      .from(balanceReconciliations)
      .all();
    const eventTypes = context.database
      .select({ eventType: auditEvents.eventType })
      .from(auditEvents)
      .all()
      .map((event) => event.eventType);

    expect(updated.balanceReconciliations).toHaveLength(1);
    expect(updated.balanceSnapshots).toHaveLength(1);
    expect(updated.balanceReconciliations[0]).toMatchObject({
      statementEndingBalance: '124600.13',
      applicationCalculatedBalance: '124600.13',
      calculatedDifference: '0.00',
      reconciliationStatus: 'reconciled',
    });
    expect(reconciliations).toHaveLength(1);
    expect(context.database.select().from(balanceSnapshots).all()).toHaveLength(1);
    expect(eventTypes).toContain('balance_reconciliation_recorded');
    expect(eventTypes).toContain('balance_snapshot_recorded');
  });

  it('accepts an eligible application balance without changing ledger activity', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));
    const transactionCount = context.database
      .select()
      .from(debtTransactions)
      .all().length;

    const updated = service.acceptCurrentBalance!({
      debtId: created.id,
      confirmed: true,
    });
    const reconciliations = context.database
      .select()
      .from(balanceReconciliations)
      .all();
    const snapshots = context.database.select().from(balanceSnapshots).all();
    const eventTypes = context.database
      .select({ eventType: auditEvents.eventType })
      .from(auditEvents)
      .all()
      .map((event) => event.eventType);

    expect(context.database.select().from(debtTransactions).all()).toHaveLength(
      transactionCount,
    );
    expect(updated.transactions).toHaveLength(transactionCount);
    expect(reconciliations).toHaveLength(1);
    expect(snapshots).toHaveLength(1);
    expect(reconciliations[0]).toMatchObject({
      reconciliationStatus: 'reconciled',
      sourceReference: 'application-calculated-acceptance',
    });
    expect(snapshots[0]).toMatchObject({
      sourceType: 'manual',
      notes: 'Accepted application balance; not lender-verified.',
    });
    expect(eventTypes).toContain('application_balance_accepted');
    expect(eventTypes).toContain('application_balance_snapshot_recorded');
  });

  it('rejects a nonzero reconciliation difference before saving', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));

    expect(() =>
      service.createBalanceReconciliation({
        ...validReconciliationRequest(created.id),
        reconciliation: {
          ...validReconciliationRequest(created.id).reconciliation,
          statementEndingBalance: '124500.13',
          reconciliationStatus: 'reconciled',
        },
      }),
    ).toThrow(
      /Verified lender balance 124500\.13; calculated ledger balance 124600\.13; difference -100\.00/,
    );
    expect(context.database.select().from(balanceReconciliations).all()).toHaveLength(
      0,
    );
  });

  it('supersedes an incorrect current reconciliation with a corrected same-date reconciliation', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));

    const incorrect = service.createBalanceReconciliation(
      validReconciliationRequest(created.id),
    ).balanceReconciliations[0]!;

    const corrected = service.createBalanceReconciliation({
      debtId: created.id,
      reconciliation: {
        statementDate: incorrect.statementDate,
        statementEndingBalance: '124600.13',
        approvedAdjustment: null,
        supersedesReconciliationId: incorrect.id,
        sourceReference: null,
        supportingNotes: null,
      },
    });
    const reconciliations = corrected.balanceReconciliations;
    const current = reconciliations.find(
      (reconciliation) => reconciliation.lifecycleStatus === 'current',
    );
    const superseded = reconciliations.find(
      (reconciliation) => reconciliation.id === incorrect.id,
    );

    expect(reconciliations).toHaveLength(2);
    expect(current).toMatchObject({
      statementDate: '2026-01-31',
      reconciliationStatus: 'reconciled',
      lifecycleStatus: 'current',
      supersedesReconciliationId: incorrect.id,
    });
    expect(superseded).toMatchObject({
      lifecycleStatus: 'superseded',
      supersededByReconciliationId: current?.id,
    });
    expect(service.getDashboard({}).attentionItems).toHaveLength(0);
    expect(context.database.select().from(balanceSnapshots).all()).toHaveLength(2);
  });

  it('posts and links an approved reconciliation adjustment explicitly', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));

    const updated = service.createBalanceReconciliation({
      debtId: created.id,
      reconciliation: {
        statementDate: '2026-01-31',
        statementEndingBalance: '124700.13',
        approvedAdjustment: {
          totalAmount: '100.00',
          description: 'Generated approved reconciliation adjustment.',
          allocations: {
            principal: '100.00',
            interest: null,
            escrow: null,
            fee: null,
            penalty: null,
            extraPrincipal: null,
            other: null,
          },
        },
        sourceReference: null,
        supportingNotes: null,
      },
    });
    const reconciliation = updated.balanceReconciliations[0];
    const adjustment = updated.transactions.find(
      (transaction) =>
        transaction.id === reconciliation?.approvedAdjustmentTransactionId,
    );
    const eventTypes = context.database
      .select({ eventType: auditEvents.eventType })
      .from(auditEvents)
      .all()
      .map((event) => event.eventType);

    expect(reconciliation).toMatchObject({
      calculatedDifference: '100.00',
      reconciliationStatus: 'reconciled_with_adjustment',
    });
    expect(adjustment).toMatchObject({
      transactionType: 'approved_reconciliation_adjustment',
      sourceType: 'reconciliation',
      totalAmount: '100.00',
    });
    expect(eventTypes).toContain('approved_reconciliation_adjustment_recorded');
    expect(eventTypes).toContain('balance_reconciliation_recorded');
  });

  it('rejects an approved adjustment that does not equal the calculated difference', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));

    expect(() =>
      service.createBalanceReconciliation({
        debtId: created.id,
        reconciliation: {
          statementDate: '2026-01-31',
          statementEndingBalance: '124600.13',
          reconciliationStatus: 'reconciled_with_adjustment',
          explanation: 'Generated mismatch.',
          approvedAdjustment: {
            totalAmount: '99.99',
            description: 'Generated invalid adjustment.',
            allocations: {
              principal: '99.99',
              interest: null,
              escrow: null,
              fee: null,
              penalty: null,
              extraPrincipal: null,
              other: null,
            },
          },
          sourceReference: 'STAT-2026-01',
          supportingNotes: null,
        },
      }),
    ).toThrow('Review the highlighted fields.');
    expect(context.database.select().from(balanceReconciliations).all()).toHaveLength(
      0,
    );
    expect(
      context.database
        .select()
        .from(debtTransactions)
        .where(
          eq(debtTransactions.transactionType, 'approved_reconciliation_adjustment'),
        )
        .all(),
    ).toHaveLength(0);
  });

  it('reverses a posted transaction without deleting the original', () => {
    const created = service.createDebt(validRequest());
    const recorded = service.createDebtTransaction(validTransactionRequest(created.id));
    const originalTransaction = recorded.transactions[0];

    expect(originalTransaction).toBeDefined();

    const updated = service.reverseDebtTransaction({
      id: originalTransaction!.id,
      expectedUpdatedAtUtc: originalTransaction!.updatedAtUtc,
      reversalDate: originalTransaction!.effectiveDate,
      confirmed: true,
    });
    const transactions = context.database
      .select()
      .from(debtTransactions)
      .where(eq(debtTransactions.debtId, created.id))
      .all();
    const eventTypes = context.database
      .select({ eventType: auditEvents.eventType })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, originalTransaction!.id))
      .all()
      .map((event) => event.eventType);

    expect(updated.transactions).toHaveLength(2);
    expect(transactions).toHaveLength(2);
    expect(
      updated.transactions.find(
        (transaction) => transaction.id === originalTransaction!.id,
      )?.status,
    ).toBe('reversed');
    expect(
      updated.transactions.find(
        (transaction) =>
          transaction.reversalOfTransactionId === originalTransaction!.id,
      ),
    ).toMatchObject({
      transactionType: 'reversal',
      status: 'posted',
    });
    expect(eventTypes).toContain('transaction_reversed');
  });

  it('reverses principal interest and escrow using the explicit financial reversal date', () => {
    const created = service.createDebt({
      ...validRequest('Generated Historical Mortgage'),
      debt: {
        ...validRequest('Generated Historical Mortgage').debt,
        originationDate: '2020-01-01',
      },
      initialTerm: {
        ...validRequest('Generated Historical Mortgage').initialTerm,
        effectiveStartDate: '2020-01-01',
      },
    });
    const recorded = service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        ...validTransactionRequest(created.id).transaction,
        effectiveDate: '2021-06-01',
        postingDate: '2021-06-01',
        totalAmount: '1500.00',
        allocations: {
          principal: '1000.00',
          interest: '200.00',
          escrow: '300.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    const originalTransaction = recorded.transactions[0]!;

    expect(recorded.currentBalance).toBe('124000.13');
    expect(recorded.calculatedEscrowBalance).toBe('300.00');
    expect(service.getDashboard({}).totals.principalReductionYtd).toBe('0.00');
    expect(service.getDashboard({}).totals.interestActivityYtd).toBe('0.00');

    const reversed = service.reverseDebtTransaction({
      id: originalTransaction.id,
      expectedUpdatedAtUtc: originalTransaction.updatedAtUtc,
      reversalDate: '2021-06-02',
      confirmed: true,
    });
    const reversal = reversed.transactions.find(
      (transaction) => transaction.reversalOfTransactionId === originalTransaction.id,
    );

    expect(reversal).toMatchObject({
      effectiveDate: '2021-06-02',
      postingDate: '2021-06-02',
      transactionType: 'reversal',
    });
    expect(reversed.currentBalance).toBe(created.originalPrincipal);
    expect(reversed.calculatedEscrowBalance).toBe('0.00');
    expect(service.getDashboard({}).totals.principalReductionYtd).toBe('0.00');
    expect(service.getDashboard({}).totals.interestActivityYtd).toBe('0.00');
    expect(service.getDashboard({}).totals.escrowBalance).toBe('0.00');
  });

  it('surfaces malformed reversal data-integrity exceptions without rewriting posted history', () => {
    const created = service.createDebt({
      ...validRequest('Generated Malformed Reversal Mortgage'),
      debt: {
        ...validRequest('Generated Malformed Reversal Mortgage').debt,
        debtType: 'mortgage',
        originationDate: '2020-01-01',
        originalPrincipal: '100000.00',
      },
      initialTerm: {
        ...validRequest('Generated Malformed Reversal Mortgage').initialTerm,
        effectiveStartDate: '2020-01-01',
      },
    });
    const recorded = service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        ...validTransactionRequest(created.id).transaction,
        effectiveDate: '2021-06-01',
        postingDate: '2021-06-01',
        totalAmount: '1500.00',
        allocations: {
          principal: '1000.00',
          interest: '200.00',
          escrow: '300.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    const originalTransaction = recorded.transactions[0]!;
    const malformedReversalId = randomUUID();
    const timestamp = '2026-07-27T13:30:00.000Z';

    context.sqlite
      .prepare(
        `INSERT INTO debt_transactions (
          id, debt_id, transaction_type, effective_date, posting_date,
          total_amount_cents, status, description, source_type,
          source_reference, reversal_of_transaction_id, supersedes_transaction_id,
          created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        malformedReversalId,
        created.id,
        'reversal',
        '2021-06-02',
        '2021-06-02',
        150_000,
        'posted',
        'Generated malformed legacy reversal.',
        'manual',
        null,
        originalTransaction.id,
        null,
        timestamp,
        timestamp,
      );
    context.sqlite
      .prepare(
        `INSERT INTO transaction_allocations (
          id, transaction_id, allocation_type, amount_cents, notes,
          created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        malformedReversalId,
        'principal',
        100_000,
        null,
        timestamp,
        timestamp,
      );
    context.sqlite
      .prepare(
        `INSERT INTO transaction_allocations (
          id, transaction_id, allocation_type, amount_cents, notes,
          created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        malformedReversalId,
        'interest',
        20_000,
        null,
        timestamp,
        timestamp,
      );

    const transactionsBefore = context.database.select().from(debtTransactions).all();
    const dashboard = service.getDashboard({});
    const reports = service.getDebtReports({
      startDate: '2021-01-01',
      endDate: '2026-07-27',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });

    expect(dashboard.attentionItems).toEqual([
      expect.objectContaining({
        debtId: created.id,
        status: 'exception',
        sourceReference: malformedReversalId,
        basis: expect.stringContaining('Malformed reversal detected'),
      }),
    ]);
    expect(dashboard.metricBasis.activeDebt).toContain(
      'Data-integrity exceptions are present',
    );
    expect(dashboard.metricBasis.escrowBalance).toContain(
      'Data-integrity exceptions are present',
    );
    expect(reports.reconciliationAndDataQuality.rows).toEqual([
      expect.objectContaining({
        category: 'Data integrity',
        severity: 'exception',
        sourceId: malformedReversalId,
        message: expect.stringContaining('escrow -300.00'),
      }),
    ]);
    expect(context.database.select().from(debtTransactions).all()).toEqual(
      transactionsBefore,
    );
  });

  it('rolls back the debt when the initial-term insert fails', () => {
    const existing = service.createDebt(validRequest('Existing Fictional Debt'));
    const existingTermId = existing.terms[0]?.id;
    const newDebtId = randomUUID();
    const identifiers = [newDebtId, existingTermId ?? '', randomUUID(), randomUUID()];
    const collidingService = createService(() => identifiers.shift() ?? randomUUID());

    expect(() =>
      collidingService.createDebt(validRequest('Rolled Back Fictional Debt')),
    ).toThrow();
    expect(
      context.database.select().from(debts).where(eq(debts.id, newDebtId)).get(),
    ).toBeUndefined();
  });
});

describe('payoff milestones', () => {
  it('builds milestone totals from reports without altering ledger activity', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));
    const transactionsBefore = context.database.select().from(debtTransactions).all();

    const milestones = service.getMilestones!({ scenarioId: null });

    expect(milestones.totalDebtReducedSinceTracking).toBe('400.00');
    expect(milestones.debtReducedYtd).toBe('400.00');
    expect(milestones.interestPaidYtd).toBe('100.00');
    expect(milestones.percentageStartingDebtRemaining).toBe('99.7%');
    expect(milestones.balanceHistory.length).toBeGreaterThan(0);
    expect(milestones.annualPrincipalReduction.at(-1)).toMatchObject({
      year: '2026',
      amount: '400.00',
    });
    expect(milestones.scenarioComparison).toEqual([]);
    expect(context.database.select().from(debtTransactions).all()).toEqual(
      transactionsBefore,
    );
  });
});

describe('debt outlook', () => {
  it('returns twelve scheduled months and excludes debts without usable scheduling', () => {
    const scheduled = validRequest('Generated Outlook Scheduled Debt');
    scheduled.debt.paymentDueDay = 15;
    scheduled.debt.paymentScheduleStartDate = '2026-07-01';
    service.createDebt(scheduled);
    const missing = validRequest('Generated Outlook Missing Schedule');
    service.createDebt(missing);

    const outlook = service.getDebtOutlook!({ scenarioId: null });

    expect(outlook.months).toHaveLength(12);
    expect(outlook.months[0]?.month).toBe('2026-07-01');
    expect(outlook.months.at(-1)?.month).toBe('2027-06-01');
    expect(outlook.months.every((month) => month.plannedExtraPayments === '0.00')).toBe(
      true,
    );
    expect(outlook.months[0]?.details.map((detail) => detail.debtName)).toEqual([
      'Generated Outlook Scheduled Debt',
    ]);
    expect(outlook.requiredPaymentsTotal).toBe('29400.00');
    expect(outlook.warnings).toContain(
      'Generated Outlook Missing Schedule: missing due day; payment not projected.',
    );
  });

  it('uses selected scenario extras and reports payoff events without changing the ledger', () => {
    const request = validRequest('Generated Outlook Scenario Debt');
    request.debt.originalPrincipal = '20000.00';
    request.debt.minimumPayment = '1000.00';
    request.debt.paymentDueDay = 15;
    request.debt.paymentScheduleStartDate = '2026-07-01';
    request.initialTerm.requiredPayment = '1000.00';
    const debt = service.createDebt(request);
    const beforeTransactions = context.database.select().from(debtTransactions).all();
    const scenario = service.createPayoffScenario({
      name: 'Generated Outlook Extra Scenario',
      scenarioStartDate: '2026-07-27',
      strategy: 'avalanche',
      extraMonthlyPayment: '5000.00',
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 12,
    });

    const outlook = service.getDebtOutlook!({ scenarioId: scenario.id });

    expect(outlook.scenario).toEqual({ id: scenario.id, name: scenario.name });
    expect(Number(outlook.plannedExtraPaymentsTotal)).toBeGreaterThan(0);
    expect(
      outlook.months.some((month) =>
        month.debtPayoffs.some((row) => row.debtId === debt.id),
      ),
    ).toBe(true);
    expect(outlook.events.some((event) => event.eventType === 'payoff')).toBe(true);
    expect(context.database.select().from(debtTransactions).all()).toEqual(
      beforeTransactions,
    );
  });
});

describe('interest analysis', () => {
  it('reconciles YTD interest, baseline shares, rankings, and extra-payment savings', () => {
    const interestBearing = validRequest('Generated Interest Concentration Debt');
    interestBearing.debt.originalPrincipal = '20000.00';
    interestBearing.debt.minimumPayment = '1000.00';
    interestBearing.debt.paymentDueDay = 15;
    interestBearing.debt.paymentScheduleStartDate = '2026-01-01';
    interestBearing.initialTerm.requiredPayment = '1000.00';
    const interestDebt = service.createDebt(interestBearing);
    service.createDebtTransaction(validTransactionRequest(interestDebt.id));

    const zeroRate = validRequest('Generated Zero Rate Debt');
    zeroRate.debt.originalPrincipal = '10000.00';
    zeroRate.debt.minimumPayment = '500.00';
    zeroRate.debt.paymentDueDay = 15;
    zeroRate.debt.paymentScheduleStartDate = '2026-01-01';
    zeroRate.initialTerm.requiredPayment = '500.00';
    zeroRate.initialTerm.interestRateType = 'zero';
    zeroRate.initialTerm.annualInterestRatePercent = '0.00%';
    const zeroDebt = service.createDebt(zeroRate);

    const analysis = service.getInterestAnalysis!({ debtType: null, segment: 'all' });
    const interestRow = analysis.rows.find((row) => row.debtId === interestDebt.id)!;
    const zeroRow = analysis.rows.find((row) => row.debtId === zeroDebt.id)!;
    const shareTotal = analysis.rows.reduce(
      (total, row) => total + Number(row.shareOfPortfolioInterest.replace('%', '')),
      0,
    );

    expect(interestRow.interestPaidYtd).toBe('100.00');
    expect(Number(analysis.baselinePortfolioInterest)).toBeGreaterThan(0);
    expect(shareTotal).toBeGreaterThanOrEqual(99.9);
    expect(shareTotal).toBeLessThanOrEqual(100.1);
    expect(zeroRow.lumpSumSavings.directInterestSaved).toBe('0.00');
    expect(zeroRow.monthlySavings.directInterestSaved).toBe('0.00');
    expect(analysis.interpretations.map((item) => item.debtName)).toContain(
      'Generated Interest Concentration Debt',
    );
    expect(
      Number(interestRow.lumpSumSavings.totalInterestSaved) >=
        Number(zeroRow.lumpSumSavings.totalInterestSaved),
    ).toBe(true);
  });

  it('excludes zero-balance and inactive debts from the analysis', () => {
    const active = validRequest('Generated Included Interest Debt');
    active.debt.paymentDueDay = 15;
    active.debt.paymentScheduleStartDate = '2026-01-01';
    service.createDebt(active);
    const inactive = validRequest('Generated Closed Interest Debt');
    inactive.debt.status = 'closed';
    service.createDebt(inactive);
    const analysis = service.getInterestAnalysis!({ debtType: null, segment: 'all' });
    expect(analysis.rows.map((row) => row.debtName)).toEqual([
      'Generated Included Interest Debt',
    ]);
  });
});

describe('payoff scenarios', () => {
  it('returns a complete required-payments-only monthly baseline schedule', () => {
    const request = validRequest('Generated Baseline Schedule Note');
    request.debt.originalPrincipal = '20000.00';
    request.debt.minimumPayment = '1000.00';
    request.initialTerm.requiredPayment = '1000.00';
    service.createDebt(request);

    const baseline = service.calculatePayoffBaseline({
      scenarioStartDate: '2026-07-27',
      maxProjectionMonths: 12,
    });

    expect(baseline.extraMonthlyPayment).toBe('0.00');
    expect(baseline.lumpSum).toBe('0.00');
    expect(baseline.result.monthlySchedule.length).toBeGreaterThan(1);
    expect(baseline.result.monthlySchedule[0]?.month).toBe('2026-07-27');
    expect(
      Number(baseline.result.monthlySchedule[1]?.totalProjectedBalance) <
        Number(baseline.result.monthlySchedule[0]?.totalProjectedBalance),
    ).toBe(true);
  });

  it('adds selected saved scenario comparison data to milestones', () => {
    const request = validRequest('Generated Milestone Scenario Note');
    request.debt.originalPrincipal = '20000.00';
    request.debt.minimumPayment = '1000.00';
    request.initialTerm.requiredPayment = '1000.00';
    const debt = service.createDebt(request);
    service.createDebtTransaction(validTransactionRequest(debt.id));
    const scenario = service.createPayoffScenario({
      name: 'Generated milestone scenario',
      scenarioStartDate: '2026-07-28',
      strategy: 'avalanche',
      extraMonthlyPayment: '5000.00',
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 360,
    });

    const milestones = service.getMilestones!({ scenarioId: scenario.id });

    expect(milestones.selectedScenario).toEqual({
      id: scenario.id,
      name: 'Generated milestone scenario',
    });
    expect(milestones.interestSavedFromSelectedScenario).toBe(
      scenario.result.interestSavings,
    );
    expect(milestones.scenarioComparison.length).toBeGreaterThan(0);
    const currentPoint = milestones.scenarioComparison.find(
      (point) => point.date === '2026-07-27',
    );
    expect(currentPoint?.actualPrincipalBalance).toBe('19600.00');
    expect(currentPoint?.baselinePrincipalBalance).toBe('19600.00');
    expect(currentPoint?.selectedScenarioPrincipalBalance).toBe('19600.00');
    expect(
      milestones.scenarioComparison.some(
        (point) => point.actualPrincipalBalance !== null,
      ),
    ).toBe(true);
    expect(milestones.baselinePayoffDate).not.toBeNull();
    expect(milestones.selectedScenarioPayoffDate).not.toBeNull();
    expect(
      milestones.selectedScenarioPayoffDate! < milestones.baselinePayoffDate!,
    ).toBe(true);
    expect(
      milestones.scenarioComparison.some(
        (point) => point.baselinePrincipalBalance !== null,
      ),
    ).toBe(true);
  });

  it('creates, saves, reruns, and archives a scenario without writing projected ledger activity', () => {
    const debt = service.createDebt(validRequest('Generated Payoff Scenario Note'));
    service.createDebtTransaction(validTransactionRequest(debt.id));

    const scenario = service.createPayoffScenario({
      name: 'Generated avalanche payoff',
      scenarioStartDate: '2026-07-28',
      strategy: 'avalanche',
      extraMonthlyPayment: '5000.00',
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 360,
    });

    expect(scenario).toMatchObject({
      name: 'Generated avalanche payoff',
      strategy: 'avalanche',
      scenarioStartDate: '2026-07-28',
      extraMonthlyPayment: '5000.00',
      calculationEngineVersion: 'payoff-engine-v2',
    });
    expect(scenario.result.projectedPayoffDate).not.toBeNull();
    expect(scenario.result.assumptions).toContain(
      'Projected activity is scenario-only and is not written to the posted ledger.',
    );
    expect(context.database.select().from(payoffScenarios).all()).toHaveLength(1);
    expect(context.database.select().from(debtTransactions).all()).toHaveLength(1);

    const saved = service.getPayoffScenario({ id: scenario.id });
    expect(saved.result.debts[0]).toMatchObject({
      debtId: debt.id,
      startingBalance: '124600.13',
    });

    const rerun = service.rerunPayoffScenario({ id: scenario.id });
    expect(rerun.updatedAtUtc).not.toBe(scenario.updatedAtUtc);
    expect(context.database.select().from(payoffScenarios).all()).toHaveLength(1);
    expect(context.database.select().from(debtTransactions).all()).toHaveLength(1);

    const archived = service.archivePayoffScenario({
      id: scenario.id,
      expectedUpdatedAtUtc: rerun.updatedAtUtc,
      confirmed: true,
    });
    expect(archived.status).toBe('archived');
    expect(service.listPayoffScenarios({ includeArchived: false })).toHaveLength(0);
    expect(service.listPayoffScenarios({ includeArchived: true })).toHaveLength(1);

    const scenarioAuditEvents = context.database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityType, 'payoff_scenario'))
      .all();
    expect(scenarioAuditEvents.map((event) => event.eventType)).toEqual([
      'payoff_scenario_created',
      'payoff_scenario_rerun',
      'payoff_scenario_archived',
    ]);
  });

  it('rejects scenarios when no active calculated debt balance exists', () => {
    expect(() =>
      service.createPayoffScenario({
        name: 'Generated empty scenario',
        scenarioStartDate: '2026-07-28',
        strategy: 'snowball',
        extraMonthlyPayment: '100.00',
        customPriority: [],
        variableRateOverrides: {},
        maxProjectionMonths: 120,
      }),
    ).toThrow(ApplicationServiceError);
  });
});

describe('debt maintenance', () => {
  it('returns an empty dashboard without using archived debts', () => {
    const dashboard = service.getDashboard({});

    expect(dashboard).toMatchObject({
      effectiveDate: '2026-07-27',
      yearToDateStartDate: '2026-01-01',
      activeDebtCount: 0,
      totals: {
        activeDebt: '0.00',
        weightedAverageInterestRate: null,
      },
    });
  });

  it('calculates basic dashboard metrics from active posted activity and current terms', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));
    service.createDebtTransaction(validBorrowingRequest(created.id));

    const dashboard = service.getDashboard({});

    expect(dashboard).toMatchObject({
      effectiveDate: '2026-07-27',
      activeDebtCount: 1,
      totals: {
        activeDebt: '125600.13',
        principalReductionYtd: '400.00',
        purchaseChargesYtd: '0.00',
        newBorrowingsYtd: '1000.00',
        netDebtReductionYtd: '-600.00',
        interestActivityYtd: '100.00',
        requiredMonthlyPayments: '2450.00',
        weightedAverageInterestRate: '5.49',
      },
    });
    expect(dashboard.metricBasis.activeDebt).toContain(
      'Application-calculated ledger balances',
    );
  });

  it('calculates dashboard credit-card availability and excludes no-limit cards from utilization', () => {
    const cardWithLimit = validRequest('Generated Rewards Card');
    cardWithLimit.debt.debtType = 'credit_card';
    cardWithLimit.debt.originalPrincipal = '1000.00';
    cardWithLimit.debt.creditLimit = '5000.00';
    cardWithLimit.initialTerm.requiredPayment = '75.00';
    service.createDebt(cardWithLimit);

    const noLimitCard = validRequest('Generated Limit Review Card');
    noLimitCard.debt.debtType = 'credit_card';
    noLimitCard.debt.originalPrincipal = '500.00';
    noLimitCard.debt.creditLimit = '500.00';
    noLimitCard.initialTerm.requiredPayment = '25.00';
    const noLimit = service.createDebt(noLimitCard);
    context.database
      .update(debts)
      .set({ creditLimitCents: null })
      .where(eq(debts.id, noLimit.id))
      .run();

    const closedCard = validRequest('Generated Closed Card');
    closedCard.debt.debtType = 'credit_card';
    closedCard.debt.status = 'closed';
    closedCard.debt.originalPrincipal = '3000.00';
    closedCard.debt.creditLimit = '3000.00';
    service.createDebt(closedCard);

    const dashboard = service.getDashboard({});

    expect(dashboard.totals.creditCardBalances).toBe('1500.00');
    expect(dashboard.totals.availableCredit).toBe('4000.00');
    expect(dashboard.totals.creditUtilizationPercent).toBe('20.0%');
    expect(dashboard.totals.creditCardOverLimit).toBe('0.00');
    expect(dashboard.creditCardPortfolio.details).toHaveLength(2);
    expect(dashboard.creditCardPortfolio.reviewItems[0]).toContain(
      'Generated Limit Review Card',
    );
    expect(
      dashboard.creditCardPortfolio.details.find(
        (detail) => detail.debtName === 'Generated Limit Review Card',
      ),
    ).toMatchObject({
      creditLimit: null,
      utilizationPercent: null,
      reviewFlag:
        'No valid credit limit; excluded from portfolio utilization calculation.',
    });
  });

  it('returns unpaid upcoming payments from the same schedule calculation used by debt detail', () => {
    const request = validRequest('Generated Scheduled Mortgage');
    request.debt.originationDate = '2026-06-01';
    request.debt.maturityDate = '2036-06-01';
    request.debt.paymentDueDay = 15;
    request.debt.paymentScheduleStartDate = '2026-07-01';
    request.initialTerm.effectiveStartDate = '2026-06-01';
    request.initialTerm.requiredPayment = '1000.00';
    const created = service.createDebt(request);

    service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        ...validTransactionRequest(created.id).transaction,
        effectiveDate: '2026-06-15',
        postingDate: '2026-06-15',
        totalAmount: '1000.00',
        allocations: {
          principal: '900.00',
          interest: '100.00',
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    const dashboard = service.getDashboard({});
    const detail = service.getDebt({ id: created.id });
    const dashboardPayment = dashboard.upcomingPayments.find(
      (entry) => entry.debtId === created.id,
    );

    expect(dashboardPayment).toMatchObject({
      debtName: 'Generated Scheduled Mortgage',
      dueDate: '2026-07-15',
      status: 'past_due',
    });
    expect(detail.paymentSchedule).toMatchObject(dashboardPayment!);
  });

  it('satisfies due dates by qualifying payment occurrence rather than required amount', () => {
    const request = validRequest('Generated Boundary Schedule Loan');
    request.debt.originationDate = '2026-06-01';
    request.debt.paymentDueDay = 12;
    request.debt.paymentScheduleStartDate = '2026-07-01';
    request.initialTerm.effectiveStartDate = '2026-06-01';
    request.initialTerm.requiredPayment = '2500.00';
    const created = service.createDebt(request);

    for (const [effectiveDate, totalAmount] of [
      ['2026-06-12', '100.00'],
      ['2026-07-01', '25.00'],
    ] as const) {
      service.createDebtTransaction({
        debtId: created.id,
        transaction: {
          ...validTransactionRequest(created.id).transaction,
          effectiveDate,
          postingDate: effectiveDate,
          totalAmount,
          allocations: {
            principal: totalAmount,
            interest: null,
            escrow: null,
            fee: null,
            penalty: null,
            extraPrincipal: null,
            other: null,
          },
        },
      });
    }

    const detail = service.getDebt({ id: created.id });

    expect(detail.paymentSchedule).toMatchObject({
      dueDate: '2026-08-12',
      nextDueDate: '2026-08-12',
      status: 'upcoming',
      earliestPastDueDate: null,
    });
    expect(
      service
        .getDashboard({})
        .upcomingPayments.some(
          (entry) => entry.debtId === created.id && entry.dueDate === '2026-07-12',
        ),
    ).toBe(false);
  });

  it('satisfies an August 1 due date with an August 1 payment', () => {
    const request = validRequest('Generated First-Day Schedule Loan');
    request.debt.originationDate = '2026-07-01';
    request.debt.paymentDueDay = 1;
    request.debt.paymentScheduleStartDate = '2026-07-01';
    request.initialTerm.effectiveStartDate = '2026-07-01';
    const created = service.createDebt(request);

    for (const effectiveDate of ['2026-07-01', '2026-08-01']) {
      service.createDebtTransaction({
        debtId: created.id,
        transaction: {
          ...validTransactionRequest(created.id).transaction,
          effectiveDate,
          postingDate: effectiveDate,
        },
      });
    }

    clock = Date.parse('2026-08-02T13:00:00.000Z');
    const detail = service.getDebt({ id: created.id });

    expect(detail.paymentSchedule).toMatchObject({
      dueDate: '2026-09-01',
      nextDueDate: '2026-09-01',
      status: 'upcoming',
      earliestPastDueDate: null,
    });
  });

  it('uses corrected replacement payments and excludes voided or reversed payments', () => {
    const request = validRequest('Generated Payment Chain Schedule Loan');
    request.debt.originationDate = '2026-06-01';
    request.debt.paymentDueDay = 15;
    request.debt.paymentScheduleStartDate = '2026-07-01';
    request.initialTerm.effectiveStartDate = '2026-06-01';
    const created = service.createDebt(request);

    const original = service
      .createDebtTransaction({
        debtId: created.id,
        transaction: {
          ...validTransactionRequest(created.id).transaction,
          effectiveDate: '2026-06-15',
          postingDate: '2026-06-15',
          totalAmount: '10.00',
          allocations: {
            principal: '10.00',
            interest: null,
            escrow: null,
            fee: null,
            penalty: null,
            extraPrincipal: null,
            other: null,
          },
        },
      })
      .transactions.at(-1)!;

    service.editDebtTransaction({
      id: original.id,
      expectedUpdatedAtUtc: original.updatedAtUtc,
      debtId: created.id,
      transaction: {
        ...validTransactionRequest(created.id).transaction,
        effectiveDate: '2026-06-15',
        postingDate: '2026-06-15',
        totalAmount: '20.00',
        allocations: {
          principal: '20.00',
          interest: null,
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    const voided = service
      .createDebtTransaction({
        debtId: created.id,
        transaction: {
          ...validTransactionRequest(created.id).transaction,
          effectiveDate: '2026-07-15',
          postingDate: '2026-07-15',
        },
      })
      .transactions.at(-1)!;
    service.voidDebtTransaction({
      id: voided.id,
      expectedUpdatedAtUtc: voided.updatedAtUtc,
      voidDate: '2026-07-15',
      confirmed: true,
    });

    const reversed = service
      .createDebtTransaction({
        debtId: created.id,
        transaction: {
          ...validTransactionRequest(created.id).transaction,
          effectiveDate: '2026-07-16',
          postingDate: '2026-07-16',
        },
      })
      .transactions.at(-1)!;
    service.reverseDebtTransaction({
      id: reversed.id,
      expectedUpdatedAtUtc: reversed.updatedAtUtc,
      reversalDate: '2026-07-16',
      confirmed: true,
    });

    const detail = service.getDebt({ id: created.id });

    expect(detail.paymentSchedule).toMatchObject({
      dueDate: '2026-07-15',
      status: 'past_due',
      earliestPastDueDate: '2026-07-15',
    });
  });

  it('does not reopen a satisfied credit-card due date after later charges', () => {
    const request = validRequest('Generated Scheduled Credit Card');
    request.debt.debtType = 'credit_card';
    request.debt.originationDate = '2026-07-01';
    request.debt.paymentDueDay = 15;
    request.debt.paymentScheduleStartDate = '2026-07-01';
    request.debt.creditLimit = '5000.00';
    request.initialTerm.effectiveStartDate = '2026-07-01';
    request.initialTerm.requiredPayment = '75.00';
    const created = service.createDebt(request);

    service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        ...validTransactionRequest(created.id).transaction,
        effectiveDate: '2026-07-15',
        postingDate: '2026-07-15',
        totalAmount: '25.00',
        allocations: {
          principal: '25.00',
          interest: null,
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        ...validBorrowingRequest(created.id).transaction,
        effectiveDate: '2026-07-20',
        postingDate: '2026-07-20',
        totalAmount: '200.00',
        allocations: {
          principal: '200.00',
          interest: null,
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    const detail = service.getDebt({ id: created.id });

    expect(detail.paymentSchedule).toMatchObject({
      dueDate: '2026-08-15',
      status: 'upcoming',
      earliestPastDueDate: null,
    });
    expect(detail.currentBalance).toBe('125175.13');
  });

  it('records and removes a scheduling-only confirmation without changing the ledger', () => {
    const request = validRequest('Generated Scheduling Override Loan');
    request.debt.originationDate = '2026-07-01';
    request.debt.paymentDueDay = 15;
    request.debt.paymentScheduleStartDate = '2026-07-01';
    request.initialTerm.effectiveStartDate = '2026-07-01';
    const created = service.createDebt(request);
    const beforeBalance = created.currentBalance;

    const confirmed = service.confirmScheduledPayment({
      debtId: created.id,
      dueDate: '2026-07-15',
      reason: 'starting_schedule_after_historical_data',
      confirmed: true,
    });
    expect(confirmed.paymentSchedule.nextDueDate).toBe('2026-08-15');
    expect(confirmed.currentBalance).toBe(beforeBalance);
    expect(confirmed.paymentSchedule.manualConfirmation).toMatchObject({
      dueDate: '2026-07-15',
      reason: 'starting_schedule_after_historical_data',
    });

    const restored = service.removeScheduledPaymentConfirmation({
      debtId: created.id,
      dueDate: '2026-07-15',
      confirmed: true,
    });
    expect(restored.paymentSchedule.dueDate).toBe('2026-07-15');
    expect(restored.paymentSchedule.status).toBe('past_due');
    expect(restored.currentBalance).toBe(beforeBalance);
  });

  it('flags missing due-day debts for scheduling review without inventing a due date', () => {
    const request = validRequest('Generated Missing Schedule Loan');
    request.debt.originationDate = '2026-06-01';
    request.initialTerm.effectiveStartDate = '2026-06-01';
    const created = service.createDebt(request);

    const dashboard = service.getDashboard({});
    const detail = service.getDebt({ id: created.id });

    expect(
      dashboard.upcomingPayments.some((entry) => entry.debtId === created.id),
    ).toBe(false);
    expect(
      dashboard.schedulingReviewItems.find((entry) => entry.debtId === created.id),
    ).toMatchObject({
      status: 'missing_due_day',
      dueDate: null,
      reviewMessage:
        'Payment due day is missing; edit the debt to add scheduling information.',
    });
    expect(detail.paymentDueDay).toBeNull();
    expect(detail.paymentSchedule.status).toBe('missing_due_day');
  });

  it('persists due-day edits and recalculates the next scheduled due date', () => {
    const request = validRequest('Generated Editable Schedule Loan');
    request.debt.originationDate = '2026-06-01';
    request.debt.paymentDueDay = 31;
    request.initialTerm.effectiveStartDate = '2026-06-01';
    const created = service.createDebt(request);

    const updated = service.updateDebt({
      id: created.id,
      expectedUpdatedAtUtc: created.updatedAtUtc,
      changes: {
        name: created.name,
        creditor: created.creditor,
        ownerEntity: created.ownerEntity,
        debtType: created.debtType,
        purpose: created.purpose,
        status: created.status,
        maturityDate: created.maturityDate,
        paymentDueDay: 10,
        paymentScheduleStartDate: '2026-06-01',
        creditLimit: created.creditLimit,
        collateralDescription: created.collateralDescription,
        taxCategory: created.taxCategory,
        deductiblePercentage: created.deductiblePercentage,
        financingChainName: created.financingChainName,
        refinancedFromDebtId: created.refinancedFromDebtId,
        refinancedIntoDebtId: created.refinancedIntoDebtId,
        refinanceDate: created.refinanceDate,
        notes: created.notes,
      },
    });

    expect(updated.paymentDueDay).toBe(10);
    expect(updated.paymentSchedule.dueDate).toBe('2026-06-10');
  });

  it('includes current-year originated debt opening principal in new borrowings YTD', () => {
    const request = validRequest('Fictional Current-Year Opening Loan');
    request.debt.originationDate = '2026-03-15';
    request.initialTerm.effectiveStartDate = '2026-03-15';
    const created = service.createDebt(request);

    const dashboard = service.getDashboard({});
    const reports = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });

    expect(created.currentBalance).toBe('125000.13');
    expect(dashboard.totals.newBorrowingsYtd).toBe('125000.13');
    expect(dashboard.metricBasis.newBorrowingsYtd).toContain('Opening principal');
    expect(
      reports.monthlyRollforward.rows.find((row) => row.period === '2026-03')
        ?.borrowings,
    ).toBe('125000.13');
    expect(reports.annualRollforward.rows[0]?.borrowings).toBe(
      dashboard.totals.newBorrowingsYtd,
    );
  });

  it('excludes prior-year originated debt opening principal from new borrowings YTD', () => {
    service.createDebt(validRequest('Fictional Prior-Year Opening Loan'));

    expect(service.getDashboard({}).totals.newBorrowingsYtd).toBe('0.00');
  });

  it('continues counting current-year HELOC draws by transaction date', () => {
    const request = validRequest('Fictional HELOC');
    request.debt.debtType = 'heloc';
    request.debt.originationDate = '2024-01-01';
    request.debt.creditLimit = '150000.00';
    request.initialTerm.effectiveStartDate = '2024-01-01';
    const created = service.createDebt(request);

    service.createDebtTransaction(validBorrowingRequest(created.id));

    expect(service.getDashboard({}).totals.newBorrowingsYtd).toBe('1000.00');
  });

  it('counts opening principal and later draws without requiring an artificial opening transaction', () => {
    const request = validRequest('Fictional Current-Year Loan With Draw');
    request.debt.originationDate = '2026-03-15';
    request.initialTerm.effectiveStartDate = '2026-03-15';
    const created = service.createDebt(request);

    service.createDebtTransaction({
      ...validBorrowingRequest(created.id),
      transaction: {
        ...validBorrowingRequest(created.id).transaction,
        effectiveDate: '2026-04-01',
        postingDate: '2026-04-01',
      },
    });

    expect(service.getDashboard({}).totals.newBorrowingsYtd).toBe('126000.13');
  });

  it('does not double-count opening principal when a same-date borrowing draw represents it', () => {
    const request = validRequest('Fictional Explicit Opening Draw');
    request.debt.originationDate = '2026-03-15';
    request.initialTerm.effectiveStartDate = '2026-03-15';
    const created = service.createDebt(request);

    service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'borrowing_draw',
        effectiveDate: '2026-03-15',
        postingDate: '2026-03-15',
        status: 'posted',
        totalAmount: '125000.13',
        description: 'Generated explicit opening draw.',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '125000.13',
          interest: null,
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    const dashboard = service.getDashboard({});
    const reports = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });

    expect(dashboard.totals.newBorrowingsYtd).toBe('125000.13');
    expect(reports.monthlyRollforward.rows[2]?.borrowings).toBe('125000.13');
    expect(reports.annualRollforward.rows[0]?.borrowings).toBe('125000.13');
  });

  it('uses principal-only balance impact and excludes prior-year activity from current-year dashboard metrics', () => {
    const request = validRequest('Fictional Multi-Year Mortgage');
    request.debt.debtType = 'mortgage';
    request.debt.originationDate = '2020-01-01';
    request.initialTerm.effectiveStartDate = '2020-01-01';
    const created = service.createDebt(request);

    service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2021-06-01',
        postingDate: '2021-06-01',
        status: 'posted',
        totalAmount: '1500.00',
        description: null,
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '1000.00',
          interest: '200.00',
          escrow: '300.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2026-03-01',
        postingDate: '2026-03-01',
        status: 'posted',
        totalAmount: '800.00',
        description: null,
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '400.00',
          interest: '100.00',
          escrow: '300.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'borrowing_draw',
        effectiveDate: '2026-04-01',
        postingDate: '2026-04-01',
        status: 'posted',
        totalAmount: '500.00',
        description: null,
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '500.00',
          interest: null,
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    const detail = service.getDebt({ id: created.id });
    const dashboard = service.getDashboard({});

    expect(detail.currentBalance).toBe('124100.13');
    expect(detail.calculatedEscrowBalance).toBe('600.00');
    expect(dashboard.totals).toMatchObject({
      activeDebt: '124100.13',
      principalReductionYtd: '400.00',
      purchaseChargesYtd: '0.00',
      interestActivityYtd: '100.00',
      newBorrowingsYtd: '500.00',
      netDebtReductionYtd: '-100.00',
      escrowBalance: '600.00',
    });
  });

  it('surfaces upcoming maturities without creating a mismatched reconciliation', () => {
    const request = validRequest('Fictional Short Note');
    request.debt.maturityDate = '2026-12-31';
    const created = service.createDebt(request);
    service.createDebtTransaction(validTransactionRequest(created.id));
    service.createBalanceReconciliation({
      debtId: created.id,
      reconciliation: {
        statementDate: '2026-01-31',
        statementEndingBalance: '124600.13',
        approvedAdjustment: null,
        sourceReference: 'STAT-2026-01',
        supportingNotes: null,
      },
    });

    const dashboard = service.getDashboard({});

    expect(dashboard.upcomingMaturities).toEqual([
      expect.objectContaining({
        debtId: created.id,
        debtName: 'Fictional Short Note',
        effectiveDate: '2026-12-31',
        amount: '124600.13',
      }),
    ]);
    expect(dashboard.attentionItems).toHaveLength(0);
  });

  it('builds advanced reports from posted activity with explicit balance labels', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));
    service.createBalanceSnapshot(validSnapshotRequest(created.id));
    service.createBalanceReconciliation({
      debtId: created.id,
      reconciliation: {
        statementDate: '2026-01-31',
        statementEndingBalance: '124600.13',
        approvedAdjustment: null,
        sourceReference: 'STAT-2026-01',
        supportingNotes: null,
      },
    });

    const reports = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-07-28',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });

    expect(reports.filters).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-07-28',
      effectiveDate: '2026-07-28',
    });
    expect(reports.monthlyRollforward.basis.balanceBasis).toContain(
      'Application-calculated ledger balances',
    );
    expect(reports.monthlyRollforward.rows[0]).toMatchObject({
      period: '2026-01',
      beginningBalance: '125000.13',
      borrowings: '0.00',
      payments: '500.00',
      principalReduction: '400.00',
      interestActivity: '100.00',
      endingBalance: '124600.13',
    });
    expect(reports.balanceTrends.rows[0]).toMatchObject({
      period: '2026-01',
      periodEndDate: '2026-01-31',
      grouping: 'Total debt',
      endingBalance: '124600.13',
      changeFromPriorPeriod: null,
    });
    expect(reports.activityTrends.rows[0]).toMatchObject({
      period: '2026-01',
      interestActivity: '100.00',
    });
    expect(
      reports.balanceHistory.rows.find((row) => row.effectiveDate === '2026-07-28'),
    ).toMatchObject({
      debtId: created.id,
      calculatedBalance: '124600.13',
      confirmedBalance: '124600.13',
    });
    expect(
      reports.balanceHistory.rows
        .filter((row) => row.debtId === created.id)
        .map((row) => row.effectiveDate),
    ).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-28',
    ]);
    expect(reports.balanceHistory.rows[0]?.basis).toContain('ending principal');
    expect(reports.maturitySchedule.rows[0]).toMatchObject({
      debtId: created.id,
      requiredMonthlyPayment: '2450.00',
      currentInterestRate: '5.49',
      calculatedBalance: '124600.13',
    });
    expect(reports.reconciliationAndDataQuality.rows).toEqual([]);
  });

  it('uses the selected report date range consistently for monthly and annual interest', () => {
    const request = validRequest('Generated Long-Range Mortgage');
    request.debt.debtType = 'mortgage';
    request.debt.originationDate = '2019-01-01';
    request.initialTerm.effectiveStartDate = '2019-01-01';
    const created = service.createDebt(request);
    const interestByDate = new Map<string, string>([
      ['2019-01-15', '125.00'],
      ['2020-04-15', '150.00'],
      ['2021-07-15', '175.00'],
      ['2022-10-15', '200.00'],
      ['2023-05-15', '225.00'],
      ['2024-02-15', '250.00'],
      ['2025-08-15', '275.00'],
      ['2026-03-15', '300.00'],
    ]);

    for (const [effectiveDate, interest] of interestByDate) {
      const payment = validTransactionRequest(created.id);
      payment.transaction.effectiveDate = effectiveDate;
      payment.transaction.postingDate = effectiveDate;
      payment.transaction.totalAmount = (Number(interest) + 1).toFixed(2);
      payment.transaction.allocations.principal = '1.00';
      payment.transaction.allocations.interest = interest;
      service.createDebtTransaction(payment);
    }

    const reports = service.getDebtReports({
      startDate: '2019-01-01',
      endDate: '2026-03-31',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });

    expect(reports.activityTrends.rows[0]?.period).toBe('2019-01');
    expect(reports.activityTrends.rows.at(-1)?.period).toBe('2026-03');
    expect(reports.activityTrends.rows).toHaveLength(87);
    expect(
      reports.activityTrends.rows.find((row) => row.period === '2023-05'),
    ).toMatchObject({ interestActivity: '225.00' });
    expect(
      reports.activityTrends.rows.find((row) => row.period === '2023-06'),
    ).toMatchObject({ interestActivity: '0.00' });
    expect(reports.activityTrends.annualInterestByDebt.map((row) => row.year)).toEqual([
      '2019',
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
    ]);

    const monthlyTotals = new Map<string, number>();
    for (const row of reports.activityTrends.rows) {
      const year = row.period.slice(0, 4);
      monthlyTotals.set(
        year,
        (monthlyTotals.get(year) ?? 0) + Number(row.interestActivity),
      );
    }
    for (const annual of reports.activityTrends.annualInterestByDebt) {
      expect(Number(annual.interestExpense)).toBe(monthlyTotals.get(annual.year));
    }

    const customReports = service.getDebtReports({
      startDate: '2021-07-01',
      endDate: '2023-05-31',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });

    expect(customReports.activityTrends.rows[0]?.period).toBe('2021-07');
    expect(customReports.activityTrends.rows.at(-1)?.period).toBe('2023-05');
    expect(
      customReports.activityTrends.annualInterestByDebt.map((row) => row.year),
    ).toEqual(['2021', '2022', '2023']);
    expect(customReports.annualRollforward.rows.map((row) => row.period)).toEqual([
      '2021',
      '2022',
      '2023',
    ]);
  });

  it('classifies principal rollforward activity without escrow or opening-principal offsets', () => {
    const mortgageRequest = validRequest('Generated Rollforward Mortgage');
    mortgageRequest.debt.debtType = 'mortgage';
    mortgageRequest.debt.originationDate = '2026-01-15';
    mortgageRequest.initialTerm.effectiveStartDate = '2026-01-15';
    const mortgage = service.createDebt(mortgageRequest);

    const helocRequest = validRequest('Generated Rollforward HELOC');
    helocRequest.debt.debtType = 'heloc';
    helocRequest.debt.originationDate = '2025-01-01';
    helocRequest.debt.creditLimit = '200000.00';
    helocRequest.initialTerm.effectiveStartDate = '2025-01-01';
    const heloc = service.createDebt(helocRequest);

    service.createDebtTransaction({
      debtId: mortgage.id,
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2026-02-01',
        postingDate: '2026-02-01',
        status: 'posted',
        totalAmount: '1000.00',
        description: null,
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '700.00',
          interest: '200.00',
          escrow: '100.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    service.createDebtTransaction({
      debtId: mortgage.id,
      transaction: {
        transactionType: 'escrow_disbursement',
        effectiveDate: '2026-03-01',
        postingDate: '2026-03-01',
        status: 'posted',
        totalAmount: '300.00',
        description: 'Generated real estate tax escrow disbursement.',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: null,
          interest: null,
          escrow: '300.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    service.createDebtTransaction({
      debtId: heloc.id,
      transaction: {
        transactionType: 'borrowing_draw',
        effectiveDate: '2026-04-01',
        postingDate: '2026-04-01',
        status: 'posted',
        totalAmount: '2000.00',
        description: 'Generated HELOC draw.',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '2000.00',
          interest: null,
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    service.createDebtTransaction({
      debtId: mortgage.id,
      transaction: {
        transactionType: 'principal_adjustment',
        effectiveDate: '2026-05-01',
        postingDate: '2026-05-01',
        status: 'posted',
        totalAmount: '500.00',
        description: 'Generated approved principal adjustment.',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '500.00',
          interest: null,
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    const reports = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });
    const annual = reports.annualRollforward.rows[0];

    expect(annual).toMatchObject({
      beginningBalance: '125000.13',
      borrowings: '127000.13',
      payments: '1000.00',
      principalReduction: '700.00',
      interestActivity: '200.00',
      adjustmentsAndOther: '500.00',
      endingBalance: '251800.26',
      rollforwardCheck: '0.00',
    });
    expect(
      reports.monthlyRollforward.rows.every((row) => row.rollforwardCheck === '0.00'),
    ).toBe(true);
    expect(
      reports.monthlyRollforward.rows.find((row) => row.period === '2026-01'),
    ).toMatchObject({
      borrowings: '125000.13',
      adjustmentsAndOther: '0.00',
      rollforwardCheck: '0.00',
    });
    expect(
      reports.monthlyRollforward.rows.find((row) => row.period === '2026-03'),
    ).toMatchObject({
      borrowings: '0.00',
      principalReduction: '0.00',
      adjustmentsAndOther: '0.00',
      rollforwardCheck: '0.00',
    });
    expect(
      reports.monthlyRollforward.rows.find((row) => row.period === '2026-04'),
    ).toMatchObject({
      borrowings: '2000.00',
      adjustmentsAndOther: '0.00',
      rollforwardCheck: '0.00',
    });
    expect(
      reports.monthlyRollforward.rows.find((row) => row.period === '2026-05'),
    ).toMatchObject({
      borrowings: '0.00',
      adjustmentsAndOther: '500.00',
      rollforwardCheck: '0.00',
    });
  });

  it('records an in-place refinance on one continuous debt without double-counting borrowings', () => {
    const request = validRequest('Generated Original Mortgage');
    request.debt.debtType = 'mortgage';
    request.debt.originationDate = '2025-01-01';
    request.debt.maturityDate = '2055-01-01';
    request.initialTerm.effectiveStartDate = '2025-01-01';
    const created = service.createDebt(request);
    const afterPayment = service.createDebtTransaction(
      validTransactionRequest(created.id),
    );
    service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'escrow_adjustment',
        effectiveDate: '2026-02-01',
        postingDate: '2026-02-01',
        status: 'posted',
        totalAmount: '500.00',
        description: 'Generated escrow opening balance.',
        sourceType: 'manual',
        sourceReference: 'ESCROW-OPEN',
        allocations: {
          principal: null,
          interest: null,
          escrow: '500.00',
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    const refinanced = service.recordRefinance({
      debtId: created.id,
      expectedUpdatedAtUtc: afterPayment.updatedAtUtc,
      refinanceDate: '2026-03-01',
      newRefinancedPrincipal: '130000.13',
      newAnnualInterestRatePercent: '4.99',
      newRequiredPayment: '2150.00',
      newPaymentFrequency: 'monthly',
      newMaturityDate: '2056-03-01',
      interestRateType: 'fixed',
      dayCountConvention: 'actual_365',
      calculationConvention: 'simple_daily',
      financedFees: '2500.00',
      cashFees: '750.00',
      escrowHandling: 'reset_opening_balance',
      escrowAmount: '900.00',
      lenderPayoffBalance: '124600.13',
      payoffDifferenceAcknowledged: true,
      notes: 'Generated refinance closing statement was reviewed.',
    });
    const reports = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-04-30',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });
    const debtRows = service.listDebts({ includeArchived: false });

    expect(debtRows).toHaveLength(1);
    expect(refinanced.id).toBe(created.id);
    expect(refinanced.currentBalance).toBe('130000.13');
    expect(refinanced.calculatedEscrowBalance).toBe('900.00');
    expect(refinanced.maturityDate).toBe('2056-03-01');
    expect(refinanced.minimumPayment).toBe('2150.00');
    expect(refinanced.currentTerm).toMatchObject({
      effectiveStartDate: '2026-03-01',
      annualInterestRatePercent: '4.99',
      requiredPayment: '2150.00',
      paymentFrequency: 'monthly',
    });
    expect(refinanced.terms).toHaveLength(2);
    expect(refinanced.terms[0]).toMatchObject({
      effectiveStartDate: '2025-01-01',
      effectiveEndDate: '2026-02-28',
    });
    expect(refinanced.refinanceEvents[0]).toMatchObject({
      refinanceDate: '2026-03-01',
      preRefinancePrincipal: '124600.13',
      newRefinancedPrincipal: '130000.13',
      principalChange: '5400.00',
      financedFees: '2500.00',
      cashFees: '750.00',
      escrowHandling: 'reset_opening_balance',
      escrowAmount: '900.00',
    });
    expect(
      refinanced.transactions.map((entry) => ({
        type: entry.transactionType,
        total: entry.totalAmount,
        allocationType: entry.allocations[0]?.allocationType,
      })),
    ).toEqual(
      expect.arrayContaining([
        { type: 'principal_adjustment', total: '5400.00', allocationType: 'principal' },
        { type: 'other', total: '750.00', allocationType: 'other' },
        { type: 'escrow_adjustment', total: '400.00', allocationType: 'escrow' },
      ]),
    );
    expect(new Set(reports.balanceHistory.rows.map((row) => row.debtId))).toEqual(
      new Set([created.id]),
    );
    expect(
      reports.monthlyRollforward.rows.find((row) => row.period === '2026-03'),
    ).toMatchObject({
      borrowings: '0.00',
      payments: '0.00',
      principalReduction: '0.00',
      adjustmentsAndOther: '5400.00',
      endingBalance: '130000.13',
      rollforwardCheck: '0.00',
    });
    expect(
      reports.balanceTrends.rows.find((row) => row.period === '2026-03'),
    ).toMatchObject({
      grouping: 'Total debt',
      endingBalance: '130000.13',
      refinanceDate: '2026-03-01',
    });
  });

  it('clamps advanced report activity to the configured reporting history start date', () => {
    const request = validRequest('Fictional Pre-History Loan');
    request.debt.originationDate = '2018-01-01';
    request.initialTerm.effectiveStartDate = '2018-01-01';
    const created = service.createDebt(request);
    service.createDebtTransaction({
      debtId: created.id,
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2018-12-31',
        postingDate: '2018-12-31',
        status: 'posted',
        totalAmount: '500.00',
        description: 'Generated pre-history payment.',
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: '400.00',
          interest: '100.00',
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });

    const reports = service.getDebtReports({
      startDate: '1900-01-01',
      endDate: '2019-02-28',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });

    expect(reports.filters.startDate).toBe('2019-01-01');
    expect(reports.monthlyRollforward.rows.map((row) => row.period)).toEqual([
      '2019-01',
      '2019-02',
    ]);
    expect(
      reports.monthlyRollforward.rows.some((row) => row.period.startsWith('2018')),
    ).toBe(false);
    expect(reports.monthlyRollforward.basis.assumptions).toContain(
      'Reporting history currently starts on 2019-01-01; older underlying records are preserved but excluded from report periods.',
    );
  });

  it('omits deferred sensitivity and actual-versus-plan reports from normal debt reports', () => {
    const debt = service.createDebt(validRequest('Generated Variance Report Note'));
    service.createDebtTransaction(validTransactionRequest(debt.id));
    service.createPayoffScenario({
      name: 'Generated report variance scenario',
      scenarioStartDate: '2026-07-28',
      strategy: 'avalanche',
      extraMonthlyPayment: '250.00',
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 360,
    });

    const reports = service.getDebtReports({
      startDate: '2026-01-01',
      endDate: '2026-07-28',
      debtId: debt.id,
      ownerEntity: null,
      debtType: null,
      status: null,
    });

    expect('interestRateSensitivity' in reports).toBe(false);
    expect('extraPaymentSensitivity' in reports).toBe(false);
    expect('actualVersusPlanVariance' in reports).toBe(false);
    expect(reports.monthlyRollforward.rows.length).toBeGreaterThan(0);
  });

  it('saves payoff scenarios with monthly extra-payment allocations and payoff order', () => {
    const request = validRequest('Generated Variable Rate Sensitivity Loan');
    request.debt.maturityDate = null;
    const debt = service.createDebt(request);

    const scenario = service.createPayoffScenario({
      name: 'Generated payoff allocation scenario',
      scenarioStartDate: '2026-07-28',
      strategy: 'avalanche',
      extraMonthlyPayment: '500.00',
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 360,
    });

    expect(scenario.result.monthlySchedule[0]).toMatchObject({
      debtId: debt.id,
      debtName: 'Generated Variable Rate Sensitivity Loan',
      extraPayment: '500.00',
    });
    expect(
      Number(scenario.result.monthlySchedule[0]?.totalProjectedBalance),
    ).toBeGreaterThan(0);
    expect(scenario.result.payoffOrder[0]).toMatchObject({
      debtId: debt.id,
      priority: 1,
    });
  });

  it('renames a saved payoff scenario without changing its calculation or identity', () => {
    const debt = service.createDebt(validRequest('Generated Rename Debt'));
    service.createDebtTransaction(validTransactionRequest(debt.id));
    const original = service.createPayoffScenario({
      name: 'Generated original scenario',
      scenarioStartDate: '2026-07-28',
      strategy: 'avalanche',
      extraMonthlyPayment: '100.00',
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 360,
    });
    const renamed = service.renamePayoffScenario({
      id: original.id,
      expectedUpdatedAtUtc: original.updatedAtUtc,
      name: '  Generated renamed scenario  ',
    });
    expect(renamed.id).toBe(original.id);
    expect(renamed.name).toBe('Generated renamed scenario');
    expect(renamed.result).toEqual(original.result);
    expect(renamed.createdAtUtc).toBe(original.createdAtUtc);
    expect(renamed.updatedAtUtc).not.toBe(original.updatedAtUtc);
  });

  it('retrieves a debt through the application service', () => {
    const created = service.createDebt(validRequest());
    expect(service.getDebt({ id: created.id })).toMatchObject({
      id: created.id,
      name: 'Fictional Equipment Note',
      originalPrincipal: '125000.13',
    });
  });

  it('excludes archived debts by default and includes them explicitly', () => {
    const created = service.createDebt(validRequest());
    service.archiveDebt({
      id: created.id,
      expectedUpdatedAtUtc: created.updatedAtUtc,
      confirmed: true,
    });

    expect(service.listDebts({ includeArchived: false })).toHaveLength(0);
    expect(service.listDebts({ includeArchived: true })).toHaveLength(1);
  });

  it('archives and restores without removing terms and records both events', () => {
    const created = service.createDebt(validRequest());
    const archived = service.archiveDebt({
      id: created.id,
      expectedUpdatedAtUtc: created.updatedAtUtc,
      confirmed: true,
    });
    const restored = service.restoreDebt({
      id: archived.id,
      expectedUpdatedAtUtc: archived.updatedAtUtc,
      confirmed: true,
    });
    const eventTypes = context.database
      .select({ eventType: auditEvents.eventType })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, created.id))
      .all()
      .map((event) => event.eventType);

    expect(archived.archivedAtUtc).not.toBeNull();
    expect(restored.archivedAtUtc).toBeNull();
    expect(restored.terms).toHaveLength(1);
    expect(eventTypes).toContain('debt_archived');
    expect(eventTypes).toContain('debt_restored');
  });

  it('requires backup context and exact debt-name confirmation before permanent deletion', () => {
    const created = service.createDebt(validRequest('Generated Deletion Guard Note'));

    expect(() =>
      service.deleteDebtPermanently(
        {
          id: created.id,
          expectedUpdatedAtUtc: created.updatedAtUtc,
          typedDebtName: created.name,
          confirmed: true,
          secondConfirmed: true,
        },
        '',
      ),
    ).toThrow('A validated backup is required');

    expect(() =>
      service.deleteDebtPermanently(
        {
          id: created.id,
          expectedUpdatedAtUtc: created.updatedAtUtc,
          typedDebtName: 'Generated deletion guard note',
          confirmed: true,
          secondConfirmed: true,
        },
        'manual-generated-backup.sqlite3',
      ),
    ).toThrow('Type the debt name exactly');

    expect(service.getDebt({ id: created.id }).name).toBe(created.name);
  });

  it('keeps legacy separate refinance links readable and clears them when deleting a test replacement debt', () => {
    const originalRequest = validRequest('Generated Legacy Original Mortgage');
    originalRequest.debt.debtType = 'mortgage';
    originalRequest.debt.financingChainName = 'Legacy Home Mortgage';
    const original = service.createDebt(originalRequest);

    const replacementRequest = validRequest('Generated Legacy Replacement Mortgage');
    replacementRequest.debt.debtType = 'mortgage';
    replacementRequest.debt.financingChainName = 'Legacy Home Mortgage';
    replacementRequest.debt.refinancedFromDebtId = original.id;
    replacementRequest.debt.refinanceDate = '2026-03-01';
    replacementRequest.debt.originationDate = '2026-03-01';
    replacementRequest.initialTerm.effectiveStartDate = '2026-03-01';
    const replacement = service.createDebt(replacementRequest);
    const linkedOriginal = service.updateDebt({
      id: original.id,
      expectedUpdatedAtUtc: original.updatedAtUtc,
      changes: {
        name: original.name,
        creditor: original.creditor,
        ownerEntity: original.ownerEntity,
        debtType: original.debtType,
        purpose: original.purpose,
        status: 'refinanced',
        maturityDate: original.maturityDate,
        creditLimit: original.creditLimit,
        collateralDescription: original.collateralDescription,
        taxCategory: original.taxCategory,
        deductiblePercentage: original.deductiblePercentage,
        financingChainName: original.financingChainName,
        refinancedFromDebtId: null,
        refinancedIntoDebtId: replacement.id,
        refinanceDate: '2026-03-01',
        notes: original.notes,
      },
    });

    expect(service.getDebt({ id: replacement.id })).toMatchObject({
      refinancedFromDebtId: original.id,
      refinancedFromDebtName: original.name,
      refinanceDate: '2026-03-01',
    });

    service.deleteDebtPermanently(
      {
        id: replacement.id,
        expectedUpdatedAtUtc: replacement.updatedAtUtc,
        typedDebtName: replacement.name,
        confirmed: true,
        secondConfirmed: true,
      },
      'manual-generated-backup.sqlite3',
    );

    expect(service.getDebt({ id: linkedOriginal.id })).toMatchObject({
      refinancedIntoDebtId: null,
      refinancedIntoDebtName: null,
      refinanceDate: null,
    });
  });

  it('permanently deletes a debt and dependent records atomically after backup confirmation', () => {
    const created = service.createDebt(
      validRequest('Generated Permanent Deletion Note'),
    );
    const afterTransaction = service.createDebtTransaction(
      validTransactionRequest(created.id),
    );
    const originalTransaction = afterTransaction.transactions[0]!;
    service.editDebtTransaction({
      id: originalTransaction.id,
      debtId: created.id,
      expectedUpdatedAtUtc: originalTransaction.updatedAtUtc,
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2026-01-15',
        postingDate: '2026-01-16',
        status: 'posted',
        totalAmount: '500.00',
        description: 'Generated corrected payment.',
        sourceType: 'manual',
        sourceReference: 'CHK-1001-CORRECTED',
        allocations: {
          principal: '450.00',
          interest: '50.00',
          escrow: null,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
    service.createBalanceSnapshot(validSnapshotRequest(created.id));
    service.createBalanceReconciliation({
      ...validReconciliationRequest(created.id),
      reconciliation: {
        ...validReconciliationRequest(created.id).reconciliation,
        statementEndingBalance: '124550.13',
      },
    });
    service.createPayoffScenario({
      name: 'Generated deletion scenario',
      scenarioStartDate: '2026-07-28',
      strategy: 'avalanche',
      extraMonthlyPayment: '250.00',
      customPriority: [created.id],
      variableRateOverrides: {},
      maxProjectionMonths: 360,
    });
    const afterRefinance = service.recordRefinance({
      debtId: created.id,
      expectedUpdatedAtUtc: created.updatedAtUtc,
      refinanceDate: '2026-06-01',
      newRefinancedPrincipal: '125000.13',
      newAnnualInterestRatePercent: '4.99',
      newRequiredPayment: '2150.00',
      newPaymentFrequency: 'monthly',
      newMaturityDate: '2056-06-01',
      interestRateType: 'fixed',
      dayCountConvention: 'actual_365',
      calculationConvention: 'simple_daily',
      financedFees: '0.00',
      cashFees: '25.00',
      escrowHandling: 'carry_forward',
      escrowAmount: null,
      lenderPayoffBalance: '124550.13',
      payoffDifferenceAcknowledged: true,
      notes: 'Generated deletion refinance event.',
    });

    const batchId = randomUUID();
    const mappingId = randomUUID();
    const rowId = randomUUID();
    const postingId = randomUUID();
    const transactionId = originalTransaction.id;
    context.database
      .insert(importBatches)
      .values({
        id: batchId,
        sourceWorkbookName: 'generated-delete-source.xlsx',
        sourceWorkbookFingerprint: randomUUID(),
        sourceWorkbookModifiedAtUtc: '2026-07-27T12:00:00.000Z',
        status: 'closed',
        importedAtUtc: '2026-07-27T12:00:00.000Z',
        createdAtUtc: '2026-07-27T12:00:00.000Z',
        updatedAtUtc: '2026-07-27T12:00:00.000Z',
      })
      .run();
    context.database
      .insert(importSheetMappings)
      .values({
        id: mappingId,
        batchId,
        sourceSheetName: 'Generated Rows',
        proposedRecordType: 'transaction',
        reviewStatus: 'approved',
        fieldMappingJson: '{}',
        notes: null,
        createdAtUtc: '2026-07-27T12:00:00.000Z',
        updatedAtUtc: '2026-07-27T12:00:00.000Z',
      })
      .run();
    context.database
      .insert(stagedImportRows)
      .values({
        id: rowId,
        batchId,
        sheetMappingId: mappingId,
        sourceSheetName: 'Generated Rows',
        sourceRowNumber: 2,
        sourceCellReferencesJson: '{}',
        sourceDisplayedValuesJson: '{}',
        sourceFormulasJson: '{}',
        proposedRecordType: 'transaction',
        activityClassification: 'actual',
        normalizedValuesJson: '{}',
        validationMessagesJson: '[]',
        duplicateCandidateJson: null,
        reconciliationExceptionJson: null,
        reviewStatus: 'approved',
        reviewNotes: null,
        reviewedAtUtc: '2026-07-27T12:00:00.000Z',
        createdAtUtc: '2026-07-27T12:00:00.000Z',
        updatedAtUtc: '2026-07-27T12:00:00.000Z',
      })
      .run();
    context.database
      .insert(importPostings)
      .values({
        id: postingId,
        batchId,
        stagedRowId: rowId,
        liveEntityType: 'debt_transaction',
        liveEntityId: transactionId,
        postedAtUtc: '2026-07-27T12:00:00.000Z',
        createdAtUtc: '2026-07-27T12:00:00.000Z',
      })
      .run();

    const preview = service.getDebt({ id: created.id }).permanentDeletionPreview;
    expect(preview).toMatchObject({
      debtTerms: 2,
      transactions: 5,
      allocations: 8,
      balanceSnapshots: 2,
      reconciliations: 1,
      importProvenance: 1,
      payoffScenarioReferences: 1,
      otherRelatedRecords: 1,
    });

    const deleted = service.deleteDebtPermanently(
      {
        id: created.id,
        expectedUpdatedAtUtc: afterRefinance.updatedAtUtc,
        typedDebtName: created.name,
        confirmed: true,
        secondConfirmed: true,
      },
      'manual-generated-backup.sqlite3',
    );

    expect(deleted).toEqual({
      deletedDebtId: created.id,
      deletedDebtName: created.name,
      backupId: 'manual-generated-backup.sqlite3',
    });
    expect(
      context.database.select().from(debts).where(eq(debts.id, created.id)).all(),
    ).toHaveLength(0);
    expect(
      context.database
        .select()
        .from(debtTransactions)
        .where(eq(debtTransactions.debtId, created.id))
        .all(),
    ).toHaveLength(0);
    expect(
      context.database
        .select()
        .from(transactionAllocations)
        .where(eq(transactionAllocations.transactionId, transactionId))
        .all(),
    ).toHaveLength(0);
    expect(
      context.database
        .select()
        .from(balanceSnapshots)
        .where(eq(balanceSnapshots.debtId, created.id))
        .all(),
    ).toHaveLength(0);
    expect(
      context.database
        .select()
        .from(balanceReconciliations)
        .where(eq(balanceReconciliations.debtId, created.id))
        .all(),
    ).toHaveLength(0);
    expect(
      context.database
        .select()
        .from(importPostings)
        .where(eq(importPostings.liveEntityId, transactionId))
        .all(),
    ).toHaveLength(0);
    expect(context.database.select().from(payoffScenarios).all()).toHaveLength(0);
    expect(
      context.database
        .select()
        .from(refinanceEvents)
        .where(eq(refinanceEvents.debtId, created.id))
        .all(),
    ).toHaveLength(0);
    expect(
      context.database
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.eventType, 'debt_permanently_deleted'))
        .all(),
    ).toHaveLength(1);
  });

  it('rolls back permanent deletion when a dependent delete fails', () => {
    const created = service.createDebt(validRequest('Generated Rollback Delete Note'));
    const afterTransaction = service.createDebtTransaction(
      validTransactionRequest(created.id),
    );
    const transactionId = afterTransaction.transactions[0]!.id;

    expect(() =>
      deleteDebtPermanentlyRecord(context.database, {
        debtId: created.id,
        expectedUpdatedAtUtc: created.updatedAtUtc,
        simulateFailure: true,
        audit: {
          id: randomUUID(),
          eventType: 'debt_permanently_deleted',
          entityType: 'application',
          entityId: 'permanent-debt-deletion',
          action: 'delete',
          occurredAtUtc: new Date(clock).toISOString(),
          source: 'user',
          summary: 'Generated rollback test deletion.',
          beforeMetadataJson: null,
          afterMetadataJson: JSON.stringify({ backupId: 'rollback-backup.sqlite3' }),
        },
      }),
    ).toThrow('Simulated permanent deletion failure.');

    expect(
      context.database.select().from(debts).where(eq(debts.id, created.id)).all(),
    ).toHaveLength(1);
    expect(
      context.database
        .select()
        .from(debtTransactions)
        .where(eq(debtTransactions.id, transactionId))
        .all(),
    ).toHaveLength(1);
  });

  it('updates descriptive fields without overwriting historical terms', () => {
    const created = service.createDebt(validRequest());
    const originalTerm = created.terms[0];
    const updated = service.updateDebt({
      id: created.id,
      expectedUpdatedAtUtc: created.updatedAtUtc,
      changes: {
        name: 'Updated Fictional Equipment Note',
        creditor: created.creditor,
        ownerEntity: created.ownerEntity,
        debtType: created.debtType,
        purpose: 'Updated generated purpose',
        status: created.status,
        maturityDate: created.maturityDate,
        creditLimit: created.creditLimit,
        collateralDescription: created.collateralDescription,
        taxCategory: created.taxCategory,
        deductiblePercentage: created.deductiblePercentage,
        financingChainName: created.financingChainName,
        refinancedFromDebtId: created.refinancedFromDebtId,
        refinancedIntoDebtId: created.refinancedIntoDebtId,
        refinanceDate: created.refinanceDate,
        notes: created.notes,
      },
    });

    expect(updated.name).toBe('Updated Fictional Equipment Note');
    expect(updated.terms).toEqual([originalTerm]);
  });

  it('adds a new term, closes the prior open period, and preserves history', () => {
    const created = service.createDebt(validRequest());
    const updated = service.addDebtTerm({
      debtId: created.id,
      expectedUpdatedAtUtc: created.updatedAtUtc,
      term: {
        effectiveStartDate: '2026-01-01',
        interestRateType: 'variable',
        annualInterestRatePercent: '5.75',
        dayCountConvention: 'actual_365',
        calculationConvention: 'simple_daily',
        requiredPayment: '2,500.00',
        paymentFrequency: 'monthly',
        notes: 'Generated replacement term.',
      },
    });

    expect(updated.terms).toHaveLength(2);
    expect(updated.terms[0]?.effectiveEndDate).toBe('2025-12-31');
    expect(updated.terms[1]).toMatchObject({
      effectiveStartDate: '2026-01-01',
      annualInterestRatePercent: '5.75',
    });
    expect(updated.currentTerm).toMatchObject({
      effectiveStartDate: '2026-01-01',
      annualInterestRatePercent: '5.75',
      requiredPayment: '2500.00',
    });
    expect(service.listDebts({ includeArchived: false })[0]?.currentTerm).toMatchObject(
      {
        effectiveStartDate: '2026-01-01',
        annualInterestRatePercent: '5.75',
        requiredPayment: '2500.00',
      },
    );
  });

  it('rejects an overlapping or nonchronological term', () => {
    const created = service.createDebt(validRequest());

    expect(() =>
      service.addDebtTerm({
        debtId: created.id,
        expectedUpdatedAtUtc: created.updatedAtUtc,
        term: {
          effectiveStartDate: '2025-01-15',
          interestRateType: 'fixed',
          annualInterestRatePercent: '6.00',
          dayCountConvention: 'actual_365',
          calculationConvention: 'simple_daily',
          requiredPayment: '2,500.00',
          paymentFrequency: 'monthly',
          notes: null,
        },
      }),
    ).toThrow('Review the highlighted fields.');
    expect(service.getDebt({ id: created.id }).terms).toHaveLength(1);
  });

  it('creates and validates a manual SQLite backup outside the repository', async () => {
    service.createDebt(validRequest('Generated Backup Note'));
    const backupRoot = mkdtempSync(join(tmpdir(), 'debt-tracker-backups-'));
    const dataService = createDataManagementService({
      applicationRootDirectory: process.cwd(),
      backupRootDirectory: backupRoot,
      databasePath: temporary.databasePath,
      getContext: () => context,
      getDashboard: () => service.getDashboard({}),
      getReports: () =>
        service.getDebtReports({
          startDate: null,
          endDate: null,
          debtId: null,
          ownerEntity: null,
          debtType: null,
          status: null,
        }),
      reopenContext: () => {
        context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);
        service = createService();
      },
    });

    try {
      const status = await dataService.createManualBackup({});
      expect(status.availableBackups).toHaveLength(1);
      expect(status.availableBackups[0]).toMatchObject({
        kind: 'manual',
        integrityStatus: 'valid',
      });
      expect(existsSync(join(backupRoot, status.availableBackups[0]!.fileName))).toBe(
        true,
      );
      expect(
        context.database
          .select({ eventType: auditEvents.eventType })
          .from(auditEvents)
          .all()
          .map((event) => event.eventType),
      ).toContain('database_backup_created');
    } finally {
      rmSync(backupRoot, { force: true, recursive: true });
    }
  });

  it('limits automatic startup backups to one successful backup per local day', async () => {
    service.createDebt(validRequest('Generated Automatic Backup Note'));
    const backupRoot = mkdtempSync(join(tmpdir(), 'debt-tracker-auto-backups-'));
    let currentTime = '2026-07-28T13:44:00.000Z';
    const dataService = createDataManagementService({
      applicationRootDirectory: process.cwd(),
      backupRootDirectory: backupRoot,
      databasePath: temporary.databasePath,
      getContext: () => context,
      getDashboard: () => service.getDashboard({}),
      getReports: () =>
        service.getDebtReports({
          startDate: null,
          endDate: null,
          debtId: null,
          ownerEntity: null,
          debtType: null,
          status: null,
        }),
      now: () => currentTime,
      reopenContext: () => {
        context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);
        service = createService();
      },
    });

    try {
      await dataService.createAutomaticBackup('startup');
      currentTime = '2026-07-28T20:44:00.000Z';
      await dataService.createAutomaticBackup('startup');
      expect(
        dataService
          .getDataManagementStatus({})
          .availableBackups.filter((backup) => backup.kind === 'automatic'),
      ).toHaveLength(1);

      currentTime = '2026-07-29T13:44:00.000Z';
      await dataService.createAutomaticBackup('startup');
      expect(
        dataService
          .getDataManagementStatus({})
          .availableBackups.filter((backup) => backup.kind === 'automatic'),
      ).toHaveLength(2);
    } finally {
      rmSync(backupRoot, { force: true, recursive: true });
    }
  });

  it('removes expired automatic backups while retaining manual and pre-restore backups', async () => {
    service.createDebt(validRequest('Generated Backup Retention Note'));
    const backupRoot = mkdtempSync(join(tmpdir(), 'debt-tracker-retention-'));
    let currentTime = '2026-07-25T12:00:00.000Z';
    const dataService = createDataManagementService({
      applicationRootDirectory: process.cwd(),
      backupRootDirectory: backupRoot,
      databasePath: temporary.databasePath,
      getContext: () => context,
      getDashboard: () => service.getDashboard({}),
      getReports: () =>
        service.getDebtReports({
          startDate: null,
          endDate: null,
          debtId: null,
          ownerEntity: null,
          debtType: null,
          status: null,
        }),
      now: () => currentTime,
      reopenContext: () => {
        context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);
        service = createService();
      },
    });

    try {
      await dataService.createAutomaticBackup('startup');
      await dataService.createManualBackup({});
      await dataService.createAutomaticBackup('pre_restore');
      currentTime = '2026-07-26T12:00:00.000Z';
      await dataService.createAutomaticBackup('startup');
      currentTime = '2026-08-01T12:00:00.000Z';
      await dataService.createAutomaticBackup('startup');

      const backups = dataService.getDataManagementStatus({}).availableBackups;
      expect(backups.filter((backup) => backup.kind === 'automatic')).toHaveLength(1);
      expect(backups.some((backup) => backup.kind === 'manual')).toBe(true);
      expect(backups.some((backup) => backup.kind === 'pre_restore')).toBe(true);
      expect(
        service.createDebt(validRequest('Generated Post Retention Note')).name,
      ).toBe('Generated Post Retention Note');
      expect(
        context.database
          .select({ eventType: auditEvents.eventType })
          .from(auditEvents)
          .all()
          .map((event) => event.eventType),
      ).toContain('database_backup_retention_cleaned');
    } finally {
      rmSync(backupRoot, { force: true, recursive: true });
    }
  });

  it('deletes a selected backup with sidecars but preserves the last valid backup', async () => {
    service.createDebt(validRequest('Generated Backup Deletion Note'));
    const backupRoot = mkdtempSync(join(tmpdir(), 'debt-tracker-delete-backup-'));
    let currentTime = '2026-07-28T13:44:00.000Z';
    const dataService = createDataManagementService({
      applicationRootDirectory: process.cwd(),
      backupRootDirectory: backupRoot,
      databasePath: temporary.databasePath,
      getContext: () => context,
      getDashboard: () => service.getDashboard({}),
      getReports: () =>
        service.getDebtReports({
          startDate: null,
          endDate: null,
          debtId: null,
          ownerEntity: null,
          debtType: null,
          status: null,
        }),
      now: () => currentTime,
      reopenContext: () => {
        context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);
        service = createService();
      },
    });

    try {
      const firstStatus = await dataService.createManualBackup({});
      const firstBackup = firstStatus.availableBackups[0]!;
      currentTime = '2026-07-28T13:45:00.000Z';
      await dataService.createManualBackup({});
      writeFileSync(join(backupRoot, `${firstBackup.fileName}-wal`), '');
      writeFileSync(join(backupRoot, `${firstBackup.fileName}-shm`), '');

      const afterDelete = await dataService.deleteBackup({
        backupId: firstBackup.id,
        confirmed: true,
      });
      expect(afterDelete.availableBackups.map((backup) => backup.id)).not.toContain(
        firstBackup.id,
      );
      expect(existsSync(join(backupRoot, firstBackup.fileName))).toBe(false);
      expect(existsSync(join(backupRoot, `${firstBackup.fileName}-wal`))).toBe(false);
      expect(existsSync(join(backupRoot, `${firstBackup.fileName}-shm`))).toBe(false);
      await expect(
        dataService.deleteBackup({
          backupId: afterDelete.availableBackups[0]!.id,
          confirmed: true,
        }),
      ).rejects.toThrow('At least one valid backup must be retained.');
      expect(
        context.database
          .select({ eventType: auditEvents.eventType })
          .from(auditEvents)
          .all()
          .map((event) => event.eventType),
      ).toContain('database_backup_deleted');
    } finally {
      rmSync(backupRoot, { force: true, recursive: true });
    }
  });

  it('restores from a validated backup and creates a pre-restore safety backup', async () => {
    const original = service.createDebt(validRequest('Generated Restored Note'));
    const restoredCardRequest = validRequest('Generated Restored Card');
    restoredCardRequest.debt.debtType = 'credit_card';
    restoredCardRequest.debt.creditLimit = '250000.00';
    const restoredCard = service.createDebt(restoredCardRequest);
    const restoredTransferDestination = service.createDebt(
      validRequest('Generated Restored Transfer Destination'),
    );
    service.createDebtTransaction({
      debtId: restoredCard.id,
      transaction: {
        ...validBorrowingRequest(restoredCard.id).transaction,
        transactionType: 'purchase',
        totalAmount: '800.00',
        allocations: {
          ...validBorrowingRequest(restoredCard.id).transaction.allocations,
          principal: '800.00',
        },
      },
    });
    const restoredTransferSource = service.createDebtTransfer({
      sourceDebtId: restoredCard.id,
      destinationDebtId: restoredTransferDestination.id,
      effectiveDate: '2026-02-01',
      postingDate: '2026-02-01',
      amount: '8000.00',
      description: 'Generated restorable transfer.',
      sourceReference: 'TRANSFER-RESTORE',
    });
    const transferRow = restoredTransferSource.transactions.find(
      (transaction) => transaction.transactionType === 'transfer',
    )!;
    service.reverseDebtTransaction({
      id: transferRow.id,
      expectedUpdatedAtUtc: transferRow.updatedAtUtc,
      reversalDate: '2026-02-02',
      confirmed: true,
    });
    const backupRoot = mkdtempSync(join(tmpdir(), 'debt-tracker-restore-'));
    const dataService = createDataManagementService({
      applicationRootDirectory: process.cwd(),
      backupRootDirectory: backupRoot,
      databasePath: temporary.databasePath,
      getContext: () => context,
      getDashboard: () => service.getDashboard({}),
      getReports: () =>
        service.getDebtReports({
          startDate: null,
          endDate: null,
          debtId: null,
          ownerEntity: null,
          debtType: null,
          status: null,
        }),
      reopenContext: () => {
        context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);
        service = createService();
      },
    });

    try {
      const backupStatus = await dataService.createManualBackup({});
      const postBackupDebt = service.createDebt(
        validRequest('Generated Temporary Note'),
      );
      expect(service.listDebts({ includeArchived: true })).toHaveLength(4);

      const restoredStatus = await dataService.restoreBackup({
        backupId: backupStatus.availableBackups[0]!.id,
        confirmed: true,
      });

      const restoredDebts = service.listDebts({ includeArchived: true });
      expect(restoredDebts).toHaveLength(3);
      expect(restoredDebts.map((debt) => debt.id)).toEqual(
        expect.arrayContaining([
          original.id,
          restoredCard.id,
          restoredTransferDestination.id,
        ]),
      );
      expect(() => service.getDebt({ id: postBackupDebt.id })).toThrow(
        'Debt was not found.',
      );
      expect(service.getDebt({ id: original.id }).name).toBe('Generated Restored Note');
      const restoredCardDetail = service.getDebt({ id: restoredCard.id });
      expect(
        restoredCardDetail.transactions.some(
          (transaction) => transaction.transactionType === 'purchase',
        ),
      ).toBe(true);
      const restoredTransferRows = context.database
        .select()
        .from(debtTransactions)
        .all()
        .filter((transaction) => transaction.transferId === transferRow.transferId);
      expect(restoredTransferRows).toHaveLength(4);
      expect(
        restoredTransferRows.every(
          (transaction) => transaction.transferId === transferRow.transferId,
        ),
      ).toBe(true);
      expect(
        restoredStatus.availableBackups.some((backup) => backup.kind === 'pre_restore'),
      ).toBe(true);
      expect(context.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(context.sqlite.pragma('foreign_key_check')).toEqual([]);
      const afterRestoreDebt = service.createDebt(
        validRequest('Generated Post Restore Connection Note'),
      );
      expect(service.getDebt({ id: afterRestoreDebt.id }).name).toBe(
        'Generated Post Restore Connection Note',
      );
      expect(
        context.database
          .select({ eventType: auditEvents.eventType })
          .from(auditEvents)
          .all()
          .map((event) => event.eventType),
      ).toContain('database_restored');
    } finally {
      rmSync(backupRoot, { force: true, recursive: true });
    }
  });

  it('rejects a corrupted backup without replacing or damaging the live database', async () => {
    const original = service.createDebt(
      validRequest('Generated Corruption Guard Note'),
    );
    const backupRoot = mkdtempSync(join(tmpdir(), 'debt-tracker-corrupt-restore-'));
    const dataService = createDataManagementService({
      applicationRootDirectory: process.cwd(),
      backupRootDirectory: backupRoot,
      databasePath: temporary.databasePath,
      getContext: () => context,
      getDashboard: () => service.getDashboard({}),
      getReports: () =>
        service.getDebtReports({
          startDate: null,
          endDate: null,
          debtId: null,
          ownerEntity: null,
          debtType: null,
          status: null,
        }),
      reopenContext: () => {
        context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);
        service = createService();
      },
    });

    try {
      await dataService.createManualBackup({});
      const postBackupDebt = service.createDebt(
        validRequest('Generated Live Database Survivor Note'),
      );
      const corruptedBackupId = 'manual-generated-corrupt.sqlite3';
      writeFileSync(join(backupRoot, corruptedBackupId), 'not a sqlite database');

      await expect(
        dataService.restoreBackup({
          backupId: corruptedBackupId,
          confirmed: true,
        }),
      ).rejects.toThrow();

      expect(service.getDebt({ id: original.id }).name).toBe(
        'Generated Corruption Guard Note',
      );
      expect(service.getDebt({ id: postBackupDebt.id }).name).toBe(
        'Generated Live Database Survivor Note',
      );
      expect(service.listDebts({ includeArchived: true })).toHaveLength(2);
      expect(context.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(context.sqlite.pragma('foreign_key_check')).toEqual([]);
      const afterFailedRestoreDebt = service.createDebt(
        validRequest('Generated After Failed Restore Note'),
      );
      expect(service.getDebt({ id: afterFailedRestoreDebt.id }).name).toBe(
        'Generated After Failed Restore Note',
      );
    } finally {
      rmSync(backupRoot, { force: true, recursive: true });
    }
  });

  it('exports actual, confirmed, calculated, and scenario-labeled CSV files', () => {
    const debt = service.createDebt(validRequest('Generated Export Note'));
    service.createDebtTransaction(validTransactionRequest(debt.id));
    service.createBalanceSnapshot(validSnapshotRequest(debt.id));
    service.recordRefinance({
      debtId: debt.id,
      expectedUpdatedAtUtc: debt.updatedAtUtc,
      refinanceDate: '2026-03-01',
      newRefinancedPrincipal: '125000.13',
      newAnnualInterestRatePercent: '4.99',
      newRequiredPayment: '2150.00',
      newPaymentFrequency: 'monthly',
      newMaturityDate: '2056-03-01',
      interestRateType: 'fixed',
      dayCountConvention: 'actual_365',
      calculationConvention: 'simple_daily',
      financedFees: '2500.00',
      cashFees: '750.00',
      escrowHandling: 'carry_forward',
      escrowAmount: null,
      lenderPayoffBalance: '124600.13',
      payoffDifferenceAcknowledged: true,
      notes: 'Generated export refinance event.',
    });
    const backupRoot = mkdtempSync(join(tmpdir(), 'debt-tracker-export-backups-'));
    const exportRoot = mkdtempSync(join(tmpdir(), 'debt-tracker-exports-'));
    const dataService = createDataManagementService({
      applicationRootDirectory: process.cwd(),
      backupRootDirectory: backupRoot,
      databasePath: temporary.databasePath,
      getContext: () => context,
      getDashboard: () => service.getDashboard({}),
      getReports: () =>
        service.getDebtReports({
          startDate: null,
          endDate: null,
          debtId: null,
          ownerEntity: null,
          debtType: null,
          status: null,
        }),
      reopenContext: () => {
        context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);
        service = createService();
      },
      selectExportDirectory: () => exportRoot,
    });

    try {
      const result = dataService.exportData({ format: 'csv', includeReports: true });
      expect(result).toMatchObject({ status: 'succeeded', fileCount: 13 });
      const files = readdirSync(result.exportDirectoryDisplayPath!);
      expect(files).toContain('actual-debts.csv');
      expect(files).toContain('actual-refinance-events.csv');
      expect(files).toContain('confirmed-balance-snapshots.csv');
      expect(files).toContain('calculated-dashboard-summary.csv');
      expect(files).not.toContain('scenario-report-actual-versus-plan.csv');
      expect(
        readFileSync(
          join(result.exportDirectoryDisplayPath!, 'actual-posted-transactions.csv'),
          'utf8',
        ),
      ).toContain('actual/posted ledger activity');
      expect(
        readFileSync(
          join(result.exportDirectoryDisplayPath!, 'calculated-dashboard-summary.csv'),
          'utf8',
        ),
      ).toContain('calculated/dashboard metric');
      expect(
        readFileSync(
          join(result.exportDirectoryDisplayPath!, 'actual-refinance-events.csv'),
          'utf8',
        ),
      ).toContain('actual/in-place refinance event');
    } finally {
      rmSync(backupRoot, { force: true, recursive: true });
      rmSync(exportRoot, { force: true, recursive: true });
    }
  });
});
