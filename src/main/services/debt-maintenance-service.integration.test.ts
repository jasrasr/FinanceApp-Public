// @vitest-environment node

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
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
  transactionAllocations,
} from '../database/schema';
import {
  createTemporaryDatabaseLocation,
  type TemporaryDatabaseLocation,
} from '../database/temporary-database';
import { ApplicationServiceError } from './application-error';
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
    creditLimit: null,
    collateralDescription: 'Generated equipment description',
    taxCategory: 'business',
    deductiblePercentage: '37.25%',
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
    totalAmount: '-500.00',
    description: 'Generated payment.',
    sourceType: 'manual' as const,
    sourceReference: 'CHK-1001',
    allocations: {
      principal: '-400.00',
      interest: '-100.00',
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

const validReconciliationRequest = (debtId: string) => ({
  debtId,
  reconciliation: {
    statementDate: '2026-01-31',
    statementEndingBalance: '124500.13',
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
    expect(updated.balanceReconciliations[0]).toMatchObject({
      statementEndingBalance: '124500.13',
      applicationCalculatedBalance: '124500.13',
      calculatedDifference: '0.00',
      reconciliationStatus: 'reconciled',
    });
    expect(reconciliations).toHaveLength(1);
    expect(eventTypes).toContain('balance_reconciliation_recorded');
  });

  it('rejects reconciled status when the calculated difference is nonzero', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));

    expect(() =>
      service.createBalanceReconciliation({
        ...validReconciliationRequest(created.id),
        reconciliation: {
          ...validReconciliationRequest(created.id).reconciliation,
          statementEndingBalance: '124600.13',
        },
      }),
    ).toThrow('Review the highlighted fields.');
    expect(context.database.select().from(balanceReconciliations).all()).toHaveLength(
      0,
    );
  });

  it('posts and links an approved reconciliation adjustment explicitly', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));

    const updated = service.createBalanceReconciliation({
      debtId: created.id,
      reconciliation: {
        statementDate: '2026-01-31',
        statementEndingBalance: '124600.13',
        reconciliationStatus: 'reconciled_with_adjustment',
        explanation: 'Generated approved adjustment for statement difference.',
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
        sourceReference: 'STAT-2026-01',
        supportingNotes: 'Fictional approval note.',
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

describe('debt maintenance', () => {
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
});
