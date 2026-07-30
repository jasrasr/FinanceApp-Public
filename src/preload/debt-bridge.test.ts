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
      'editDebtTransaction',
      'exportData',
      'getDashboard',
      'getDataManagementStatus',
      'getDebt',
      'getDebtReports',
      'getImportBatch',
      'getPayoffScenario',
      'listDebts',
      'listImportBatches',
      'listPayoffScenarios',
      'postImportBatch',
      'previewImportBatchPosting',
      'rerunPayoffScenario',
      'restoreBackup',
      'restoreDebt',
      'reverseDebtTransaction',
      'selectWorkbookForImport',
      'updateDebt',
      'updateImportSheetMapping',
      'updateStagedImportRowReview',
      'voidBalanceReconciliation',
      'voidDebtTransaction',
    ]);
    expect(bridge.bridgeVersion).toBe(18);
    expect(bridge.appMetadata).toEqual({
      version: '0.22.1',
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

  it('uses fixed import channels and validates cancel response', async () => {
    const invoke = vi.fn(async () => ({ ok: true, value: null }));
    const bridge = createAppBridge(invoke);

    await expect(bridge.selectWorkbookForImport({})).resolves.toEqual({
      ok: true,
      value: null,
    });
    expect(invoke).toHaveBeenCalledWith(DEBT_IPC_CHANNELS.selectWorkbookForImport, {});
  });

  it('uses fixed import posting channels and requires confirmation', async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      value: {
        batchId: '11111111-1111-4111-8111-111111111111',
        batchStatus: 'open',
        approvedMappings: 1,
        unapprovedMappings: 0,
        approvedRows: 1,
        rejectedRows: 0,
        deferredRows: 0,
        postableRows: 1,
        exceptionRows: 0,
        alreadyPosted: false,
        rowResults: [],
      },
    }));
    const bridge = createAppBridge(invoke);

    await expect(
      bridge.previewImportBatchPosting({
        batchId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(invoke).toHaveBeenCalledWith(DEBT_IPC_CHANNELS.previewImportBatchPosting, {
      batchId: '11111111-1111-4111-8111-111111111111',
    });

    await expect(
      bridge.postImportBatch({
        batchId: '11111111-1111-4111-8111-111111111111',
        confirmed: false,
      } as never),
    ).rejects.toThrow();
  });
});
