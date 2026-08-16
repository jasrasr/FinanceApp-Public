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
  getDebtOutlook: vi.fn(),
  getInterestAnalysis: vi.fn(),
  getDebtReports: vi.fn(),
  listPayoffScenarios: vi.fn(() => []),
  calculatePayoffBaseline: vi.fn(),
  getPayoffScenario: vi.fn(),
  createPayoffScenario: vi.fn(),
  calculateExtraCashAllocation: vi.fn(),
  rerunPayoffScenario: vi.fn(),
  archivePayoffScenario: vi.fn(),
  renamePayoffScenario: vi.fn(),
  getDebt: vi.fn(),
  createDebt: vi.fn(),
  updateDebt: vi.fn(),
  addDebtTerm: vi.fn(),
  createDebtTransaction: vi.fn(),
  createDebtTransfer: vi.fn(),
  editDebtTransaction: vi.fn(),
  reverseDebtTransaction: vi.fn(),
  voidDebtTransaction: vi.fn(),
  createBalanceSnapshot: vi.fn(),
  createBalanceReconciliation: vi.fn(),
  voidBalanceReconciliation: vi.fn(),
  archiveDebt: vi.fn(),
  restoreDebt: vi.fn(),
  recordRefinance: vi.fn(),
  deleteDebtPermanently: vi.fn(),
  confirmScheduledPayment: vi.fn(),
  removeScheduledPaymentConfirmation: vi.fn(),
  listIncomeRecords: vi.fn(() => []),
  createIncomeRecord: vi.fn(),
  updateIncomeRecord: vi.fn(),
  archiveIncomeRecord: vi.fn(),
  listIncomeSources: vi.fn(() => []),
  createIncomeSource: vi.fn(),
  updateIncomeSource: vi.fn(),
  setIncomeSourceArchived: vi.fn(),
  listIncomeTransactions: vi.fn(() => []),
  createIncomeTransaction: vi.fn(),
  updateIncomeTransaction: vi.fn(),
  archiveIncomeTransaction: vi.fn(),
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
  deleteBackup: vi.fn(),
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

  it('routes income source and net-first income transaction operations through validated handlers', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => true,
    );

    expect(handlers.has(DEBT_IPC_CHANNELS.listIncomeSources)).toBe(true);
    expect(handlers.has(DEBT_IPC_CHANNELS.createIncomeSource)).toBe(true);
    expect(handlers.has(DEBT_IPC_CHANNELS.setIncomeSourceArchived)).toBe(true);
    const result = handlers.get(DEBT_IPC_CHANNELS.listIncomeSources)?.(event, {
      includeArchived: false,
    });

    expect(result).toEqual({ ok: true, value: [] });
    expect(service.listIncomeSources).toHaveBeenCalledWith({ includeArchived: false });
  });

  it('registers only the approved backup-file import IPC handler', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(
      registrar,
      service,
      createDataManagementService(),
      () => true,
    );

    expect(
      [...handlers.keys()].filter((channel) => channel.includes(':import')),
    ).toEqual([DEBT_IPC_CHANNELS.importBackupFile]);
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

  it('creates a validated backup before permanently deleting debt', async () => {
    const service = createService();
    const dataManagementService = createDataManagementService();
    vi.mocked(dataManagementService.createManualBackup).mockResolvedValue({
      backupDirectoryDisplayPath: 'Generated backup directory',
      lastSuccessfulBackupAtUtc: '2026-08-01T12:00:00.000Z',
      availableBackups: [],
      lastBackup: {
        status: 'succeeded',
        message: 'Backup completed and passed SQLite integrity checks.',
        completedAtUtc: '2026-08-01T12:00:00.000Z',
        backup: {
          id: 'manual-2026-08-01T120000-000Z.sqlite3',
          fileName: 'manual-2026-08-01T120000-000Z.sqlite3',
          kind: 'manual',
          createdAtUtc: '2026-08-01T12:00:00.000Z',
          sizeBytes: 131072,
          integrityStatus: 'valid',
        },
      },
      lastRestore: {
        status: 'not_run',
        message: 'No operation has been run in this session.',
        completedAtUtc: null,
        backup: null,
      },
    });
    vi.mocked(service.deleteDebtPermanently).mockReturnValue({
      deletedDebtId: '11111111-1111-4111-8111-111111111111',
      deletedDebtName: 'Generated Deletion Note',
      backupId: 'manual-2026-08-01T120000-000Z.sqlite3',
    });
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(registrar, service, dataManagementService, () => true);

    const result = await handlers.get(DEBT_IPC_CHANNELS.deletePermanently)?.(event, {
      id: '11111111-1111-4111-8111-111111111111',
      expectedUpdatedAtUtc: '2026-08-01T11:59:00.000Z',
      typedDebtName: 'Generated Deletion Note',
      confirmed: true,
      secondConfirmed: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        deletedDebtId: '11111111-1111-4111-8111-111111111111',
        deletedDebtName: 'Generated Deletion Note',
        backupId: 'manual-2026-08-01T120000-000Z.sqlite3',
      },
    });
    expect(dataManagementService.createManualBackup).toHaveBeenCalledWith({});
    expect(service.deleteDebtPermanently).toHaveBeenCalledWith(
      expect.objectContaining({ typedDebtName: 'Generated Deletion Note' }),
      'manual-2026-08-01T120000-000Z.sqlite3',
    );
  });

  it('blocks permanent deletion while another guarded database operation is active', async () => {
    const service = createService();
    const dataManagementService = createDataManagementService();
    let finishBackup: (
      value: Awaited<ReturnType<DataManagementService['createManualBackup']>>,
    ) => void = () => undefined;
    vi.mocked(dataManagementService.createManualBackup).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishBackup = resolve;
        }),
    );
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(registrar, service, dataManagementService, () => true);

    const pendingBackup = handlers.get(DEBT_IPC_CHANNELS.createManualBackup)?.(
      event,
      {},
    ) as Promise<unknown>;
    const blockedDeletion = await handlers.get(DEBT_IPC_CHANNELS.deletePermanently)?.(
      event,
      {
        id: '11111111-1111-4111-8111-111111111111',
        expectedUpdatedAtUtc: '2026-08-01T11:59:00.000Z',
        typedDebtName: 'Generated Deletion Note',
        confirmed: true,
        secondConfirmed: true,
      },
    );
    finishBackup({
      backupDirectoryDisplayPath: 'Generated backup directory',
      lastSuccessfulBackupAtUtc: null,
      availableBackups: [],
      lastBackup: {
        status: 'not_run',
        message: 'No operation has been run in this session.',
        completedAtUtc: null,
        backup: null,
      },
      lastRestore: {
        status: 'not_run',
        message: 'No operation has been run in this session.',
        completedAtUtc: null,
        backup: null,
      },
    });
    await pendingBackup;

    expect(blockedDeletion).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(service.deleteDebtPermanently).not.toHaveBeenCalled();
  });
});
