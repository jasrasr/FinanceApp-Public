// @vitest-environment node

import type { IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DataManagementService } from '../services/data-management-service';
import type { DebtMaintenanceService } from '../services/debt-maintenance-service';
import { registerDebtIpcHandlers, type DebtIpcRegistrar } from './debt-ipc-handlers';
import { DEBT_IPC_CHANNELS } from '../../shared/debt-ipc';

const createService = (): DebtMaintenanceService => ({
  listDebts: vi.fn(() => []),
  getDashboard: vi.fn(),
  getDebtReports: vi.fn(),
  selectWorkbookForImport: vi.fn(() => null),
  listImportBatches: vi.fn(() => []),
  getImportBatch: vi.fn(),
  previewImportBatchPosting: vi.fn(),
  postImportBatch: vi.fn(),
  listPayoffScenarios: vi.fn(() => []),
  getPayoffScenario: vi.fn(),
  createPayoffScenario: vi.fn(),
  rerunPayoffScenario: vi.fn(),
  archivePayoffScenario: vi.fn(),
  updateImportSheetMapping: vi.fn(),
  updateStagedImportRowReview: vi.fn(),
  getDebt: vi.fn(),
  createDebt: vi.fn(),
  updateDebt: vi.fn(),
  addDebtTerm: vi.fn(),
  createDebtTransaction: vi.fn(),
  editDebtTransaction: vi.fn(),
  reverseDebtTransaction: vi.fn(),
  createBalanceSnapshot: vi.fn(),
  createBalanceReconciliation: vi.fn(),
  voidBalanceReconciliation: vi.fn(),
  archiveDebt: vi.fn(),
  restoreDebt: vi.fn(),
});

const createDataManagementService = (): DataManagementService => ({
  getDataManagementStatus: vi.fn(() => ({
    backupDirectoryDisplayPath: 'Generated backup directory',
    lastSuccessfulBackupAtUtc: null,
    availableBackups: [],
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
  })),
  createManualBackup: vi.fn(),
  createAutomaticBackup: vi.fn(),
  restoreBackup: vi.fn(),
  exportData: vi.fn(),
});

const createRegistrar = () => {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, request: unknown) => unknown
  >();
  const registrar: DebtIpcRegistrar = {
    handle: (channel, listener) => {
      handlers.set(channel, listener);
    },
    removeHandler: (channel) => {
      handlers.delete(channel);
    },
  };

  return { handlers, registrar };
};

const event = {} as IpcMainInvokeEvent;

describe('debt IPC handlers', () => {
  it('rejects untrusted senders before calling the service', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => false,
    );

    const result = handlers.get(DEBT_IPC_CHANNELS.list)?.(event, {
      includeArchived: false,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'forbidden',
        message: 'The request did not originate from trusted application content.',
      },
    });
    expect(service.listDebts).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads with a structured validation error', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => true,
    );

    const result = handlers.get(DEBT_IPC_CHANNELS.list)?.(event, {
      includeArchived: 'yes',
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(service.listDebts).not.toHaveBeenCalled();
  });

  it('returns a validated DTO result for an approved operation', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => true,
    );

    const result = handlers.get(DEBT_IPC_CHANNELS.list)?.(event, {
      includeArchived: false,
    });

    expect(result).toEqual({ ok: true, value: [] });
    expect(service.listDebts).toHaveBeenCalledWith({ includeArchived: false });
  });

  it('rejects invalid posted-transaction payloads on the new channel', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => true,
    );

    const result = handlers.get(DEBT_IPC_CHANNELS.createTransaction)?.(event, {
      debtId: randomUUID(),
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2026-01-01',
        postingDate: '2026-01-01',
        status: 'draft',
        totalAmount: '500.00',
        description: 'Generated payment.',
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

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(service.createDebtTransaction).not.toHaveBeenCalled();
  });

  it('rejects invalid reconciliation payloads on the reconciliation channel', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => true,
    );

    const result = handlers.get(DEBT_IPC_CHANNELS.createReconciliation)?.(event, {
      debtId: randomUUID(),
      reconciliation: {
        statementDate: '2026-1-31',
        statementEndingBalance: '124500.00',
        reconciliationStatus: 'reconciled_with_adjustment',
        explanation: null,
        approvedAdjustment: null,
        sourceReference: 'STAT-2026-01',
        supportingNotes: null,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(service.createBalanceReconciliation).not.toHaveBeenCalled();
  });

  it('rejects ambiguous staged rows when approval is requested', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => true,
    );

    const result = handlers.get(DEBT_IPC_CHANNELS.updateStagedImportRowReview)?.(
      event,
      {
        batchId: randomUUID(),
        rowId: randomUUID(),
        proposedRecordType: 'transaction',
        activityClassification: 'ambiguous',
        reviewStatus: 'approved',
        normalizedValues: { amount: '100.00' },
        reviewNotes: null,
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(service.updateStagedImportRowReview).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before posting an import batch', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => true,
    );

    const result = handlers.get(DEBT_IPC_CHANNELS.postImportBatch)?.(event, {
      batchId: randomUUID(),
      confirmed: false,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(service.postImportBatch).not.toHaveBeenCalled();
  });

  it('rejects invalid payoff scenario payloads on the projection channel', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => true,
    );

    const result = handlers.get(DEBT_IPC_CHANNELS.createPayoffScenario)?.(event, {
      name: 'Generated invalid scenario',
      scenarioStartDate: '2026-07-28',
      strategy: 'automatic',
      extraMonthlyPayment: '250.00',
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 360,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(service.createPayoffScenario).not.toHaveBeenCalled();
  });

  it('rejects invalid advanced report filters on the report channel', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => true,
    );

    const result = handlers.get(DEBT_IPC_CHANNELS.reports)?.(event, {
      startDate: '2026-12-31',
      endDate: '2026-01-01',
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(service.getDebtReports).not.toHaveBeenCalled();
  });
});
