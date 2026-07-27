// @vitest-environment node

import type { IpcMainInvokeEvent } from 'electron';
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
});
