// @vitest-environment node

import type { IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DebtMaintenanceService } from '../services/debt-maintenance-service';
import { registerDebtIpcHandlers, type DebtIpcRegistrar } from './debt-ipc-handlers';
import { DEBT_IPC_CHANNELS } from '../../shared/debt-ipc';

const createService = (): DebtMaintenanceService => ({
  listDebts: vi.fn(() => []),
  getDebt: vi.fn(),
  createDebt: vi.fn(),
  updateDebt: vi.fn(),
  addDebtTerm: vi.fn(),
  createDebtTransaction: vi.fn(),
  reverseDebtTransaction: vi.fn(),
  createBalanceSnapshot: vi.fn(),
  archiveDebt: vi.fn(),
  restoreDebt: vi.fn(),
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
    registerDebtIpcHandlers(registrar, service, () => false);

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
    registerDebtIpcHandlers(registrar, service, () => true);

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
    registerDebtIpcHandlers(registrar, service, () => true);

    const result = handlers.get(DEBT_IPC_CHANNELS.list)?.(event, {
      includeArchived: false,
    });

    expect(result).toEqual({ ok: true, value: [] });
    expect(service.listDebts).toHaveBeenCalledWith({ includeArchived: false });
  });

  it('rejects invalid posted-transaction payloads on the new channel', () => {
    const service = createService();
    const { handlers, registrar } = createRegistrar();
    registerDebtIpcHandlers(registrar, service, () => true);

    const result = handlers.get(DEBT_IPC_CHANNELS.createTransaction)?.(event, {
      debtId: randomUUID(),
      transaction: {
        transactionType: 'payment',
        effectiveDate: '2026-01-01',
        postingDate: '2026-01-01',
        status: 'draft',
        totalAmount: '-500.00',
        description: 'Generated payment.',
        sourceType: 'manual',
        sourceReference: null,
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

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(service.createDebtTransaction).not.toHaveBeenCalled();
  });
});
