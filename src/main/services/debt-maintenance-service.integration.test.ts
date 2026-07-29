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
  stagedImportRows,
  transactionAllocations,
} from '../database/schema';
import {
  createTemporaryDatabaseLocation,
  type TemporaryDatabaseLocation,
} from '../database/temporary-database';
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

const createGeneratedWorkbook = (): string => {
  const folder = mkdtempSync(join(tmpdir(), 'debt-tracker-import-'));
  const workbookPath = join(folder, 'generated-debt-schedule.xlsx');
  const textCell = (address: string, value: string) =>
    `<c r="${address}" t="inlineStr"><is><t>${value}</t></is></c>`;
  const numberCell = (address: string, value: number, formula?: string) =>
    `<c r="${address}">${formula ? `<f>${formula}</f>` : ''}<v>${value}</v></c>`;
  const worksheet = (rows: readonly string[]) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`;
  const row = (number: number, cells: readonly string[]) =>
    `<row r="${number}">${cells.join('')}</row>`;
  const parts: Readonly<Record<string, string>> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Generated Transactions" sheetId="1" r:id="rId1"/><sheet name="Generated Balances" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': worksheet([
      row(1, [
        textCell('A1', 'Date'),
        textCell('B1', 'Description'),
        textCell('C1', 'Amount'),
        textCell('D1', 'Status'),
      ]),
      row(2, [
        textCell('A2', '2026-01-15'),
        textCell('B2', 'Generated actual payment'),
        numberCell('C2', -250),
        textCell('D2', 'Actual posted'),
      ]),
      row(3, [
        textCell('A3', '2026-02-15'),
        textCell('B3', 'Generated planned payment'),
        numberCell('C3', -275),
        textCell('D3', 'Projected plan'),
      ]),
      row(4, [
        textCell('A4', '2026-03-15'),
        textCell('B4', 'Generated ambiguous row'),
        numberCell('C4', -300, 'C2+C3'),
        textCell('D4', 'Actual or projected'),
      ]),
    ]),
    'xl/worksheets/sheet2.xml': worksheet([
      row(1, [
        textCell('A1', 'Statement Date'),
        textCell('B1', 'Ending Balance'),
        textCell('C1', 'Difference'),
      ]),
      row(2, [
        textCell('A2', '2026-01-31'),
        numberCell('B2', 100000),
        numberCell('C2', 25),
      ]),
    ]),
  };
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [filename, content] of Object.entries(parts)) {
    const nameBuffer = Buffer.from(filename, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(parts).length, 8);
  end.writeUInt16LE(Object.keys(parts).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(workbookPath, Buffer.concat([...localParts, centralDirectory, end]));
  return workbookPath;
};

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

const stageApprovedImportBatch = (
  rows: readonly {
    readonly id: string;
    readonly sheet: string;
    readonly rowNumber: number;
    readonly recordType: 'debt' | 'transaction' | 'term' | 'balance_snapshot';
    readonly normalizedValues: Readonly<Record<string, string | null>>;
  }[],
): string => {
  const batchId = randomUUID();
  const timestamp = new Date(clock).toISOString();
  const mappingIds = new Map<string, string>();

  context.database
    .insert(importBatches)
    .values({
      id: batchId,
      sourceWorkbookName: 'generated-reviewed-import.xlsx',
      sourceWorkbookFingerprint: `generated-${batchId}`,
      sourceWorkbookModifiedAtUtc: timestamp,
      status: 'reviewed',
      importedAtUtc: timestamp,
      createdAtUtc: timestamp,
      updatedAtUtc: timestamp,
    })
    .run();

  for (const row of rows) {
    if (!mappingIds.has(row.sheet)) {
      const mappingId = randomUUID();
      mappingIds.set(row.sheet, mappingId);
      context.database
        .insert(importSheetMappings)
        .values({
          id: mappingId,
          batchId,
          sourceSheetName: row.sheet,
          proposedRecordType: row.recordType,
          reviewStatus: 'approved',
          fieldMappingJson: JSON.stringify(
            Object.fromEntries(
              Object.keys(row.normalizedValues).map((key) => [key, key]),
            ),
          ),
          notes: null,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        })
        .run();
    }

    context.database
      .insert(stagedImportRows)
      .values({
        id: row.id,
        batchId,
        sheetMappingId: mappingIds.get(row.sheet)!,
        sourceSheetName: row.sheet,
        sourceRowNumber: row.rowNumber,
        sourceCellReferencesJson: JSON.stringify({ generated: `A${row.rowNumber}` }),
        sourceDisplayedValuesJson: JSON.stringify(row.normalizedValues),
        sourceFormulasJson: JSON.stringify({}),
        proposedRecordType: row.recordType,
        activityClassification: 'actual',
        normalizedValuesJson: JSON.stringify(row.normalizedValues),
        validationMessagesJson: JSON.stringify([]),
        duplicateCandidateJson: null,
        reconciliationExceptionJson: null,
        reviewStatus: 'approved',
        reviewNotes: 'Generated approved test row.',
        reviewedAtUtc: timestamp,
        createdAtUtc: timestamp,
        updatedAtUtc: timestamp,
      })
      .run();
  }

  return batchId;
};

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

    const latest = service.getDebt({ id: created.id });
    expect(latest.calculatedEscrowBalance).toBe('125.00');
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

  it('automatically assigns exception status when the calculated difference is nonzero', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));

    const updated = service.createBalanceReconciliation({
      ...validReconciliationRequest(created.id),
      reconciliation: {
        ...validReconciliationRequest(created.id).reconciliation,
        statementEndingBalance: '124500.13',
        reconciliationStatus: 'reconciled',
      },
    });

    expect(updated.balanceReconciliations[0]).toMatchObject({
      applicationCalculatedBalance: '124600.13',
      calculatedDifference: '-100.00',
      reconciliationStatus: 'exception',
    });
  });

  it('supersedes an incorrect current reconciliation with a corrected same-date reconciliation', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));

    const incorrect = service.createBalanceReconciliation({
      ...validReconciliationRequest(created.id),
      reconciliation: {
        ...validReconciliationRequest(created.id).reconciliation,
        statementEndingBalance: '124500.13',
      },
    }).balanceReconciliations[0]!;

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

describe('payoff scenarios', () => {
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
        newBorrowingsYtd: '1000.00',
        interestActivityYtd: '100.00',
        requiredMonthlyPayments: '2450.00',
        weightedAverageInterestRate: '5.49',
      },
    });
    expect(dashboard.metricBasis.activeDebt).toContain(
      'Application-calculated ledger balances',
    );
  });

  it('includes current-year originated debt opening principal in new borrowings YTD', () => {
    const request = validRequest('Fictional Current-Year Opening Loan');
    request.debt.originationDate = '2026-03-15';
    request.initialTerm.effectiveStartDate = '2026-03-15';
    const created = service.createDebt(request);

    const dashboard = service.getDashboard({});

    expect(created.currentBalance).toBe('125000.13');
    expect(dashboard.totals.newBorrowingsYtd).toBe('125000.13');
    expect(dashboard.metricBasis.newBorrowingsYtd).toContain('Opening principal');
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

    expect(service.getDashboard({}).totals.newBorrowingsYtd).toBe('125000.13');
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
      interestActivityYtd: '100.00',
      newBorrowingsYtd: '500.00',
      escrowBalance: '600.00',
    });
  });

  it('surfaces upcoming maturities and reconciliation attention items', () => {
    const request = validRequest('Fictional Short Note');
    request.debt.maturityDate = '2026-12-31';
    const created = service.createDebt(request);
    service.createDebtTransaction(validTransactionRequest(created.id));
    service.createBalanceReconciliation({
      debtId: created.id,
      reconciliation: {
        statementDate: '2026-01-31',
        statementEndingBalance: '124500.13',
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
    expect(dashboard.attentionItems).toEqual([
      expect.objectContaining({
        debtId: created.id,
        status: 'exception',
        difference: '-100.00',
      }),
    ]);
  });

  it('builds advanced reports from posted activity with explicit balance labels', () => {
    const created = service.createDebt(validRequest());
    service.createDebtTransaction(validTransactionRequest(created.id));
    service.createBalanceSnapshot(validSnapshotRequest(created.id));
    service.createBalanceReconciliation({
      debtId: created.id,
      reconciliation: {
        statementDate: '2026-01-31',
        statementEndingBalance: '124500.13',
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
      payments: '500.00',
      principalReduction: '400.00',
      interestActivity: '100.00',
      endingBalance: '124600.13',
    });
    expect(
      reports.balanceHistory.rows.find((row) => row.effectiveDate === '2026-07-28'),
    ).toMatchObject({
      debtId: created.id,
      calculatedBalance: '124600.13',
      confirmedBalance: '124500.13',
    });
    expect(reports.maturitySchedule.rows[0]).toMatchObject({
      debtId: created.id,
      requiredMonthlyPayment: '2450.00',
      currentInterestRate: '5.49',
      calculatedBalance: '124600.13',
    });
    expect(reports.reconciliationAndDataQuality.rows).toEqual([
      expect.objectContaining({
        category: 'Reconciliation',
        severity: 'exception',
        debtId: created.id,
      }),
    ]);
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

  it('reports saved-scenario variance as limited when monthly plan balances are unavailable', () => {
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

    expect(reports.interestRateSensitivity.rows).toHaveLength(3);
    expect(reports.extraPaymentSensitivity.rows).toHaveLength(3);
    expect(reports.actualVersusPlanVariance.rows[0]).toMatchObject({
      scenarioName: 'Generated report variance scenario',
      debtId: debt.id,
      actualPrincipalReduction: '0.00',
      plannedPrincipalReduction: null,
      variance: null,
    });
    expect(reports.actualVersusPlanVariance.rows[0]?.warnings.join(' ')).toContain(
      'monthly plan balances',
    );
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

  it('stages a generated workbook without posting imported rows to live ledger tables', () => {
    const workbookPath = createGeneratedWorkbook();
    service = createDebtMaintenanceService({
      database: context.database,
      now: () => '2026-07-28T10:00:00.000Z',
      selectWorkbookPath: () => workbookPath,
    });

    const batch = service.selectWorkbookForImport({});

    expect(batch).not.toBeNull();
    expect(batch?.sourceWorkbookName).toBe('generated-debt-schedule.xlsx');
    expect(batch?.sheetMappings).toHaveLength(2);
    expect(batch?.stagedRows.length).toBeGreaterThanOrEqual(4);
    expect(batch?.controlTotals.ambiguousRows).toBeGreaterThanOrEqual(1);
    expect(batch?.controlTotals.reconciliationExceptionRows).toBe(1);
    expect(
      batch?.stagedRows.some((row) => Object.keys(row.sourceFormulas).length > 0),
    ).toBe(true);

    expect(context.database.select().from(importBatches).all()).toHaveLength(1);
    expect(context.database.select().from(importSheetMappings).all()).toHaveLength(2);
    expect(
      context.database.select().from(stagedImportRows).all().length,
    ).toBeGreaterThan(0);
    expect(context.database.select().from(debts).all()).toHaveLength(0);
    expect(context.database.select().from(debtTransactions).all()).toHaveLength(0);

    const eventTypes = context.database
      .select({ eventType: auditEvents.eventType })
      .from(auditEvents)
      .all()
      .map((event) => event.eventType);
    expect(eventTypes).toContain('workbook_import_staged');
  });

  it('preserves source values separately from normalized row review values', () => {
    const workbookPath = createGeneratedWorkbook();
    service = createDebtMaintenanceService({
      database: context.database,
      now: () => '2026-07-28T10:00:00.000Z',
      selectWorkbookPath: () => workbookPath,
    });
    const batch = service.selectWorkbookForImport({});
    const row = batch?.stagedRows.find(
      (candidate) => candidate.activityClassification === 'projected',
    );

    expect(batch).not.toBeNull();
    expect(row).toBeDefined();

    const updated = service.updateStagedImportRowReview({
      batchId: batch!.id,
      rowId: row!.id,
      proposedRecordType: row!.proposedRecordType,
      activityClassification: row!.activityClassification,
      reviewStatus: 'deferred',
      normalizedValues: {
        ...row!.normalizedValues,
        reviewer_note: 'Generated normalized review value.',
      },
      reviewNotes: 'Generated deferral for later posting design.',
    });
    const updatedRow = updated.stagedRows.find((candidate) => candidate.id === row!.id);

    expect(updatedRow?.reviewStatus).toBe('deferred');
    expect(updatedRow?.sourceDisplayedValues.status).toBe('Projected plan');
    expect(updatedRow?.normalizedValues.reviewer_note).toBe(
      'Generated normalized review value.',
    );
    expect(context.database.select().from(debtTransactions).all()).toHaveLength(0);
  });

  it('rejects approving an ambiguous actual-versus-projected staged row', () => {
    const workbookPath = createGeneratedWorkbook();
    service = createDebtMaintenanceService({
      database: context.database,
      now: () => '2026-07-28T10:00:00.000Z',
      selectWorkbookPath: () => workbookPath,
    });
    const batch = service.selectWorkbookForImport({});
    const ambiguous = batch?.stagedRows.find(
      (row) => row.activityClassification === 'ambiguous',
    );

    expect(ambiguous).toBeDefined();
    expect(() =>
      service.updateStagedImportRowReview({
        batchId: batch!.id,
        rowId: ambiguous!.id,
        proposedRecordType: ambiguous!.proposedRecordType,
        activityClassification: 'ambiguous',
        reviewStatus: 'approved',
        normalizedValues: ambiguous!.normalizedValues,
        reviewNotes: null,
      }),
    ).toThrow('Review the highlighted fields.');
  });

  it('updates sheet mapping review state without changing staged source rows', () => {
    const workbookPath = createGeneratedWorkbook();
    service = createDebtMaintenanceService({
      database: context.database,
      now: () => '2026-07-28T10:00:00.000Z',
      selectWorkbookPath: () => workbookPath,
    });
    const batch = service.selectWorkbookForImport({});
    const mapping = batch!.sheetMappings[0]!;
    const sourceRowCount = batch!.stagedRows.length;

    const updated = service.updateImportSheetMapping({
      batchId: batch!.id,
      mappingId: mapping.id,
      proposedRecordType: mapping.proposedRecordType,
      reviewStatus: 'approved',
      fieldMapping: mapping.fieldMapping,
      notes: 'Generated mapping approval.',
    });

    expect(updated.sheetMappings[0]?.reviewStatus).toBe('approved');
    expect(updated.stagedRows).toHaveLength(sourceRowCount);
    expect(
      context.database
        .select({ eventType: auditEvents.eventType })
        .from(auditEvents)
        .all()
        .map((event) => event.eventType),
    ).toContain('import_sheet_mapping_reviewed');
  });

  it('posts approved reviewed workbook rows transactionally with provenance', () => {
    const debt = service.createDebt(validRequest('Generated Import Posting Note'));
    const rowId = randomUUID();
    const batchId = stageApprovedImportBatch([
      {
        id: rowId,
        sheet: 'Generated Approved Transactions',
        rowNumber: 2,
        recordType: 'transaction',
        normalizedValues: {
          debt_id: debt.id,
          transaction_type: 'payment',
          effective_date: '2026-04-15',
          posting_date: '2026-04-15',
          amount: '-125.00',
          description: 'Generated approved import payment.',
          allocation_type: 'principal',
        },
      },
    ]);

    const preview = service.previewImportBatchPosting({ batchId });
    expect(preview).toMatchObject({
      postableRows: 1,
      exceptionRows: 0,
      alreadyPosted: false,
    });

    const result = service.postImportBatch({ batchId, confirmed: true });
    expect(result.createdRecordCount).toBe(2);
    expect(
      result.rowResults[0]?.createdRecords.map((record) => record.entityType),
    ).toEqual(['debt_transaction', 'transaction_allocation']);

    const transaction = context.database
      .select()
      .from(debtTransactions)
      .where(eq(debtTransactions.sourceReference, `import:${batchId}:${rowId}`))
      .get();
    expect(transaction).toMatchObject({
      debtId: debt.id,
      sourceType: 'import',
      totalAmountCents: -12_500,
    });
    expect(context.database.select().from(importPostings).all()).toHaveLength(2);
    expect(context.database.select().from(importBatches).get()).toMatchObject({
      status: 'closed',
    });
    expect(
      context.database
        .select({ eventType: auditEvents.eventType })
        .from(auditEvents)
        .all()
        .map((event) => event.eventType),
    ).toContain('workbook_import_posted');
  });

  it('safely retries a completed import batch without duplicate posting', () => {
    const debt = service.createDebt(validRequest('Generated Retry Import Note'));
    const batchId = stageApprovedImportBatch([
      {
        id: randomUUID(),
        sheet: 'Generated Approved Transactions',
        rowNumber: 2,
        recordType: 'transaction',
        normalizedValues: {
          debt_id: debt.id,
          transaction_type: 'payment',
          effective_date: '2026-04-15',
          posting_date: '2026-04-15',
          amount: '-125.00',
          description: 'Generated approved import payment.',
          allocation_type: 'principal',
        },
      },
    ]);

    service.postImportBatch({ batchId, confirmed: true });
    const retry = service.postImportBatch({ batchId, confirmed: true });

    expect(retry.alreadyPosted).toBe(true);
    expect(context.database.select().from(debtTransactions).all()).toHaveLength(1);
    expect(context.database.select().from(importPostings).all()).toHaveLength(2);
  });

  it('rejects imported debt terms that overlap existing effective periods', () => {
    const debt = service.createDebt(validRequest('Generated Import Term Note'));
    const batchId = stageApprovedImportBatch([
      {
        id: randomUUID(),
        sheet: 'Generated Approved Terms',
        rowNumber: 2,
        recordType: 'term',
        normalizedValues: {
          debt_id: debt.id,
          effective_start_date: '2025-06-01',
          interest_rate_type: 'fixed',
          annual_interest_rate: '6.00',
          day_count_convention: 'actual_365',
          calculation_convention: 'simple_daily',
          required_payment: '2500.00',
          payment_frequency: 'monthly',
        },
      },
    ]);

    expect(() => service.postImportBatch({ batchId, confirmed: true })).toThrow(
      'Import row cannot be posted.',
    );
    expect(context.database.select().from(debtTerms).all()).toHaveLength(1);
    expect(context.database.select().from(importPostings).all()).toHaveLength(0);
  });

  it('rolls back all live records when an approved row fails during batch posting', () => {
    const debt = service.createDebt(validRequest('Generated Rollback Import Note'));
    const batchId = stageApprovedImportBatch([
      {
        id: randomUUID(),
        sheet: 'Generated Approved Transactions',
        rowNumber: 2,
        recordType: 'transaction',
        normalizedValues: {
          debt_id: debt.id,
          transaction_type: 'payment',
          effective_date: '2026-04-15',
          posting_date: '2026-04-15',
          amount: '-125.00',
          description: 'Generated approved import payment.',
          allocation_type: 'principal',
        },
      },
      {
        id: randomUUID(),
        sheet: 'Generated Approved Balances',
        rowNumber: 2,
        recordType: 'balance_snapshot',
        normalizedValues: {
          debt_id: debt.id,
          statement_date: '2026-01-31',
          ending_balance: '124500.00',
        },
      },
      {
        id: randomUUID(),
        sheet: 'Generated Approved Balances',
        rowNumber: 3,
        recordType: 'balance_snapshot',
        normalizedValues: {
          debt_id: randomUUID(),
          statement_date: '2026-01-31',
          ending_balance: '124000.00',
        },
      },
    ]);

    expect(() => service.postImportBatch({ batchId, confirmed: true })).toThrow();
    expect(context.database.select().from(debtTransactions).all()).toHaveLength(0);
    expect(context.database.select().from(importPostings).all()).toHaveLength(0);
    expect(context.database.select().from(balanceSnapshots).all()).toHaveLength(0);
    expect(context.database.select().from(importBatches).get()).toMatchObject({
      status: 'reviewed',
    });
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

  it('restores from a validated backup and creates a pre-restore safety backup', async () => {
    const original = service.createDebt(validRequest('Generated Restored Note'));
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
      expect(service.listDebts({ includeArchived: true })).toHaveLength(2);

      const restoredStatus = await dataService.restoreBackup({
        backupId: backupStatus.availableBackups[0]!.id,
        confirmed: true,
      });

      const restoredDebts = service.listDebts({ includeArchived: true });
      expect(restoredDebts).toHaveLength(1);
      expect(restoredDebts.map((debt) => debt.id)).toEqual([original.id]);
      expect(() => service.getDebt({ id: postBackupDebt.id })).toThrow(
        'Debt was not found.',
      );
      expect(service.getDebt({ id: original.id }).name).toBe('Generated Restored Note');
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
      expect(files).toContain('confirmed-balance-snapshots.csv');
      expect(files).toContain('calculated-dashboard-summary.csv');
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
    } finally {
      rmSync(backupRoot, { force: true, recursive: true });
      rmSync(exportRoot, { force: true, recursive: true });
    }
  });
});
