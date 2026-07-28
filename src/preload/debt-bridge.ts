import type { AppBridge } from '../shared/app-bridge';
import {
  createBalanceReconciliationRequestSchema,
  createBalanceSnapshotRequestSchema,
  createDebtTransactionRequestSchema,
  addDebtTermRequestSchema,
  archiveDebtRequestSchema,
  createDebtRequestSchema,
  dashboardResultSchema,
  debtDetailResultSchema,
  debtListResultSchema,
  getDashboardRequestSchema,
  getDebtRequestSchema,
  listDebtsRequestSchema,
  reverseDebtTransactionRequestSchema,
  restoreDebtRequestSchema,
  updateDebtRequestSchema,
  type AddDebtTermRequest,
  type CreateBalanceReconciliationRequest,
  type CreateBalanceSnapshotRequest,
  type CreateDebtTransactionRequest,
  type ArchiveDebtRequest,
  type CreateDebtRequest,
  type GetDashboardRequest,
  type GetDebtRequest,
  type ListDebtsRequest,
  type ReverseDebtTransactionRequest,
  type RestoreDebtRequest,
  type UpdateDebtRequest,
} from '../shared/debt-contracts';
import { DEBT_IPC_CHANNELS } from '../shared/debt-ipc';

export type IpcInvoke = (channel: string, request: unknown) => Promise<unknown>;

export const createAppBridge = (invoke: IpcInvoke): AppBridge =>
  Object.freeze({
    appName: 'Debt Tracker',
    bridgeVersion: 5,
    listDebts: async (request: ListDebtsRequest) =>
      debtListResultSchema.parse(
        await invoke(DEBT_IPC_CHANNELS.list, listDebtsRequestSchema.parse(request)),
      ),
    getDashboard: async (request: GetDashboardRequest) =>
      dashboardResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.dashboard,
          getDashboardRequestSchema.parse(request),
        ),
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
    createDebtTransaction: async (request: CreateDebtTransactionRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.createTransaction,
          createDebtTransactionRequestSchema.parse(request),
        ),
      ),
    reverseDebtTransaction: async (request: ReverseDebtTransactionRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.reverseTransaction,
          reverseDebtTransactionRequestSchema.parse(request),
        ),
      ),
    createBalanceSnapshot: async (request: CreateBalanceSnapshotRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.createSnapshot,
          createBalanceSnapshotRequestSchema.parse(request),
        ),
      ),
    createBalanceReconciliation: async (request: CreateBalanceReconciliationRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.createReconciliation,
          createBalanceReconciliationRequestSchema.parse(request),
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
