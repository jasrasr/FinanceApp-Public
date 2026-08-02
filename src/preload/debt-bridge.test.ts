// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { DEBT_IPC_CHANNELS } from '../shared/debt-ipc';
import { createAppBridge } from './debt-bridge';

describe('typed preload bridge', () => {
  it('exposes only the approved debt operations and static metadata', () => {
    const bridge = createAppBridge(vi.fn());

    expect(Object.keys(bridge).sort()).toEqual([
      'addDebtTerm',
      'appMetadata',
      'appName',
      'archiveDebt',
      'archivePayoffScenario',
      'bridgeVersion',
      'createBalanceReconciliation',
      'createBalanceSnapshot',
      'createDebt',
      'createDebtTransaction',
      'createManualBackup',
      'createPayoffScenario',
      'deleteBackup',
      'deleteDebtPermanently',
      'editDebtTransaction',
      'exportData',
      'getDashboard',
      'getDataManagementStatus',
      'getDebt',
      'getDebtReports',
      'getPayoffScenario',
      'listDebts',
      'listPayoffScenarios',
      'recordRefinance',
      'rerunPayoffScenario',
      'restoreBackup',
      'restoreDebt',
      'reverseDebtTransaction',
      'updateDebt',
      'voidBalanceReconciliation',
      'voidDebtTransaction',
    ]);
    expect(bridge.bridgeVersion).toBe(22);
    expect(bridge.appMetadata).toEqual({
      version: '0.26.3',
      lastChangedAtUtc: '2026-07-28T13:42:00.000Z',
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

  it('does not expose removed workbook import bridge operations', () => {
    const bridge = createAppBridge(vi.fn());

    expect(
      Object.keys(bridge).some((key) => key.toLowerCase().includes('import')),
    ).toBe(false);
  });
});
