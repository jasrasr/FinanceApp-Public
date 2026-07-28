// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { DEBT_IPC_CHANNELS } from '../shared/debt-ipc';
import { createAppBridge } from './debt-bridge';

describe('typed preload bridge', () => {
  it('exposes only the approved debt operations and static metadata', () => {
    const bridge = createAppBridge(vi.fn());

    expect(Object.keys(bridge).sort()).toEqual([
      'addDebtTerm',
      'appName',
      'archiveDebt',
      'bridgeVersion',
      'createBalanceReconciliation',
      'createBalanceSnapshot',
      'createDebt',
      'createDebtTransaction',
      'getDashboard',
      'getDebt',
      'listDebts',
      'restoreDebt',
      'reverseDebtTransaction',
      'updateDebt',
    ]);
    expect(bridge.bridgeVersion).toBe(5);
    expect('invoke' in bridge).toBe(false);
    expect('query' in bridge).toBe(false);
    expect('database' in bridge).toBe(false);
    expect('filesystem' in bridge).toBe(false);
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
});
