import type { AppBridge } from '../shared/app-bridge';
import {
  addDebtTermRequestSchema,
  archiveDebtRequestSchema,
  createDebtRequestSchema,
  debtDetailResultSchema,
  debtListResultSchema,
  getDebtRequestSchema,
  listDebtsRequestSchema,
  restoreDebtRequestSchema,
  updateDebtRequestSchema,
  type AddDebtTermRequest,
  type ArchiveDebtRequest,
  type CreateDebtRequest,
  type GetDebtRequest,
  type ListDebtsRequest,
  type RestoreDebtRequest,
  type UpdateDebtRequest,
} from '../shared/debt-contracts';
import { DEBT_IPC_CHANNELS } from '../shared/debt-ipc';

export type IpcInvoke = (channel: string, request: unknown) => Promise<unknown>;

export const createAppBridge = (invoke: IpcInvoke): AppBridge =>
  Object.freeze({
    appName: 'Debt Tracker',
    bridgeVersion: 2,
    listDebts: async (request: ListDebtsRequest) =>
      debtListResultSchema.parse(
        await invoke(DEBT_IPC_CHANNELS.list, listDebtsRequestSchema.parse(request)),
      ),
    getDebt: async (request: GetDebtRequest) =>
      debtDetailResultSchema.parse(
        await invoke(DEBT_IPC_CHANNELS.get, getDebtRequestSchema.parse(request)),
      ),
    createDebt: async (request: CreateDebtRequest) =>
      debtDetailResultSchema.parse(
        await invoke(DEBT_IPC_CHANNELS.create, createDebtRequestSchema.parse(request)),
      ),
    updateDebt: async (request: UpdateDebtRequest) =>
      debtDetailResultSchema.parse(
        await invoke(DEBT_IPC_CHANNELS.update, updateDebtRequestSchema.parse(request)),
      ),
    addDebtTerm: async (request: AddDebtTermRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.addTerm,
          addDebtTermRequestSchema.parse(request),
        ),
      ),
    archiveDebt: async (request: ArchiveDebtRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.archive,
          archiveDebtRequestSchema.parse(request),
        ),
      ),
    restoreDebt: async (request: RestoreDebtRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.restore,
          restoreDebtRequestSchema.parse(request),
        ),
      ),
  });
