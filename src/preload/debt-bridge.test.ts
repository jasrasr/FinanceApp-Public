// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
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
      'createDebtTransaction',
      'createDebtTransfer',
      'createManualBackup',
      'createPayoffScenario',
      'deleteBackup',
      'deleteDebtPermanently',
      'editDebtTransaction',
      'exportData',
      'getDashboard',
      'getDataHealth',
      'getDataManagementStatus',
      'getDebt',
      'getDebtOutlook',
      'getDebtReports',
      'getInterestAnalysis',
      'getMilestones',
      'getPayoffScenario',
      'getRefinanceAnalysis',
      'importBackupFile',
      'listDebts',
      'listPayoffScenarios',
      'openBackupFolder',
      'recordRefinance',
      'removeScheduledPaymentConfirmation',
      'renamePayoffScenario',
      'rerunPayoffScenario',
      'restoreBackup',
      'restoreDebt',
      'reverseDebtTransaction',
      'setDataLocations',
      'updateDebt',
      'voidBalanceReconciliation',
      'voidDebtTransaction',
    ]);
    expect(bridge.bridgeVersion).toBe(27);
    expect(bridge.appMetadata).toEqual({
      version: '1.8.0',
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

  it('exposes only the approved backup-file import operation', () => {
    const bridge = createAppBridge(vi.fn());

    expect(
      Object.keys(bridge).filter((key) => key.toLowerCase().includes('import')),
    ).toEqual(['importBackupFile']);
  });
});
