// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import packageMetadata from '../../package.json';
import { DEBT_IPC_CHANNELS } from '../shared/debt-ipc';
import { createAppBridge } from './debt-bridge';

describe('typed preload bridge', () => {
  it('exposes only the approved debt operations and static metadata', () => {
    const bridge = createAppBridge(vi.fn());

    expect(Object.keys(bridge).sort()).toEqual([
      'acceptCurrentBalance',
      'addDebtTerm',
      'appMetadata',
      'appName',
      'archiveDebt',
      'archiveIncomeRecord',
      'archiveIncomeTransaction',
      'archivePayoffScenario',
      'bridgeVersion',
      'calculateExtraCashAllocation',
      'calculatePayoffBaseline',
      'chooseBackupFile',
      'chooseDataFolder',
      'confirmScheduledPayment',
      'createBalanceReconciliation',
      'createBalanceSnapshot',
      'createDebt',
      'createDebtGoal',
      'createDebtTransaction',
      'createDebtTransfer',
      'createIncomeRecord',
      'createIncomeSource',
      'createIncomeTransaction',
      'createManualBackup',
      'createPayoffScenario',
      'deleteBackup',
      'deleteDebtPermanently',
      'dismissUpdateNotice',
      'editDebtTransaction',
      'exportData',
      'getDashboard',
      'getDataHealth',
      'getDataManagementStatus',
      'getDebt',
      'getDebtGoals',
      'getDebtOutlook',
      'getDebtReports',
      'getInterestAnalysis',
      'getMilestones',
      'getPayoffScenario',
      'getRefinanceAnalysis',
      'getUpdateStatus',
      'importBackupFile',
      'listDebts',
      'listIncomeRecords',
      'listIncomeSources',
      'listIncomeTransactions',
      'listPayoffScenarios',
      'openBackupFolder',
      'openReleasePage',
      'recordRefinance',
      'removeScheduledPaymentConfirmation',
      'renamePayoffScenario',
      'rerunPayoffScenario',
      'restoreBackup',
      'restoreDebt',
      'reverseDebtTransaction',
      'setDataLocations',
      'setIncomeSourceArchived',
      'updateDebt',
      'updateDebtGoal',
      'updateIncomeRecord',
      'updateIncomeSource',
      'updateIncomeTransaction',
      'voidBalanceReconciliation',
      'voidDebtTransaction',
    ]);
    expect(bridge.bridgeVersion).toBe(29);
    expect(bridge.appMetadata).toEqual({
      version: packageMetadata.version,
      lastChangedAtUtc: '2026-08-15T00:00:00.000Z',
    });
    expect('invoke' in bridge).toBe(false);
    expect('query' in bridge).toBe(false);
    expect('database' in bridge).toBe(false);
    expect('filesystem' in bridge).toBe(false);
    expect('git' in bridge).toBe(false);
    expect('process' in bridge).toBe(false);
    expect('environment' in bridge).toBe(false);
    expect('require' in bridge).toBe(false);
    expect('selectWorkbookForImport' in bridge).toBe(false);
    expect('postImportBatch' in bridge).toBe(false);
    expect('updateStagedImportRowReview' in bridge).toBe(false);
  });

  it('uses the fixed list channel and validates the response', async () => {
    const invoke = vi.fn(async () => ({ ok: true, value: [] }));
    const bridge = createAppBridge(invoke);

    await expect(bridge.listDebts({ includeArchived: false })).resolves.toEqual({
      ok: true,
      value: [],
    });
    expect(invoke).toHaveBeenCalledWith(DEBT_IPC_CHANNELS.list, {
      includeArchived: false,
    });
  });

  it('rejects malformed responses before exposing them to the renderer', async () => {
    const bridge = createAppBridge(vi.fn(async () => ({ rows: [] })));

    await expect(bridge.listDebts({ includeArchived: false })).rejects.toThrow();
  });

  it('validates income source and net-first transaction responses through the bridge', async () => {
    const sourceId = 'generated-income-source';
    const invoke = vi.fn(async (channel: string) => {
      if (channel === DEBT_IPC_CHANNELS.listIncomeSources)
        return {
          ok: true,
          value: [
            {
              id: sourceId,
              name: 'Generated Employer',
              createdAtUtc: '2026-08-01T00:00:00.000Z',
              updatedAtUtc: '2026-08-01T00:00:00.000Z',
              archivedAtUtc: null,
            },
          ],
        };
      return {
        ok: true,
        value: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            receivedDate: '2026-08-15',
            amount: '3250.00',
            incomeType: 'regular_paycheck',
            sourceId,
            source: 'Generated Employer',
            notes: null,
            grossAmount: null,
            netAmount: '3250.00',
            createdAtUtc: '2026-08-15T00:00:00.000Z',
            updatedAtUtc: '2026-08-15T00:00:00.000Z',
            archivedAtUtc: null,
          },
        ],
      };
    });
    const bridge = createAppBridge(invoke);

    await expect(
      bridge.listIncomeSources({ includeArchived: true }),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      bridge.listIncomeTransactions({ includeArchived: true }),
    ).resolves.toMatchObject({ ok: true });
    expect(invoke).toHaveBeenCalledWith(DEBT_IPC_CHANNELS.listIncomeSources, {
      includeArchived: true,
    });
    expect(invoke).toHaveBeenCalledWith(DEBT_IPC_CHANNELS.listIncomeTransactions, {
      includeArchived: true,
    });
  });

  it('exposes only the approved backup-file import operation', () => {
    const bridge = createAppBridge(vi.fn());

    expect(
      Object.keys(bridge).filter((key) => key.toLowerCase().includes('import')),
    ).toEqual(['importBackupFile']);
  });

  it('reads cached update status through the fixed channel', async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      value: {
        currentVersion: '1.11.1',
        latestVersion: '1.12.0',
        updateAvailable: true,
        releaseUrl: 'https://github.com/jasrasr/financeApp-public/releases/tag/v1.12.0',
        checkedAtUtc: '2026-08-16T00:00:00.000Z',
        checkFailed: false,
      },
    }));
    const bridge = createAppBridge(invoke);

    await expect(bridge.getUpdateStatus({})).resolves.toMatchObject({
      ok: true,
      value: { updateAvailable: true, latestVersion: '1.12.0' },
    });
    expect(invoke).toHaveBeenCalledWith(DEBT_IPC_CHANNELS.getUpdateStatus, {});
  });

  it('rejects a malformed update-status response', async () => {
    const bridge = createAppBridge(vi.fn(async () => ({ ok: true, value: { bad: true } })));

    await expect(bridge.getUpdateStatus({})).rejects.toThrow();
  });

  it('dismisses an update notice for a specific version', async () => {
    const invoke = vi.fn(async () => ({ ok: true, value: null }));
    const bridge = createAppBridge(invoke);

    await expect(bridge.dismissUpdateNotice({ version: '1.12.0' })).resolves.toEqual({
      ok: true,
      value: null,
    });
    expect(invoke).toHaveBeenCalledWith(DEBT_IPC_CHANNELS.dismissUpdateNotice, {
      version: '1.12.0',
    });
  });

  it('requests opening the release page with no arguments', async () => {
    const invoke = vi.fn(async () => ({ ok: true, value: true }));
    const bridge = createAppBridge(invoke);

    await expect(bridge.openReleasePage({})).resolves.toEqual({ ok: true, value: true });
    expect(invoke).toHaveBeenCalledWith(DEBT_IPC_CHANNELS.openReleasePage, {});
  });
});
