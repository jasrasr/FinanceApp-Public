import type { AppBridge } from '../shared/app-bridge';
import {
  appMetadataDtoSchema,
  createBalanceReconciliationRequestSchema,
  createBalanceSnapshotRequestSchema,
  createDebtTransactionRequestSchema,
  editDebtTransactionRequestSchema,
  createManualBackupRequestSchema,
  createPayoffScenarioRequestSchema,
  addDebtTermRequestSchema,
  archiveDebtRequestSchema,
  archivePayoffScenarioRequestSchema,
  createDebtRequestSchema,
  dashboardResultSchema,
  dataExportResultSchema,
  dataManagementStatusResultSchema,
  debtReportsResultSchema,
  debtDetailResultSchema,
  debtListResultSchema,
  exportDataRequestSchema,
  getDashboardRequestSchema,
  getDataManagementStatusRequestSchema,
  getDebtReportsRequestSchema,
  getDebtRequestSchema,
  getImportBatchRequestSchema,
  getPayoffScenarioRequestSchema,
  importBatchOrNullResultSchema,
  importBatchResultSchema,
  importBatchSummaryListResultSchema,
  importPostingPreviewResultSchema,
  importPostingResultSchema,
  listPayoffScenariosRequestSchema,
  listImportBatchesRequestSchema,
  listDebtsRequestSchema,
  payoffScenarioListResultSchema,
  payoffScenarioResultSchema,
  postImportBatchRequestSchema,
  previewImportBatchPostingRequestSchema,
  reverseDebtTransactionRequestSchema,
  rerunPayoffScenarioRequestSchema,
  restoreDebtRequestSchema,
  restoreBackupRequestSchema,
  selectWorkbookForImportRequestSchema,
  updateImportSheetMappingRequestSchema,
  updateStagedImportRowReviewRequestSchema,
  updateDebtRequestSchema,
  voidBalanceReconciliationRequestSchema,
  type AddDebtTermRequest,
  type CreateBalanceReconciliationRequest,
  type CreateBalanceSnapshotRequest,
  type CreateDebtTransactionRequest,
  type EditDebtTransactionRequest,
  type CreateManualBackupRequest,
  type CreatePayoffScenarioRequest,
  type ArchiveDebtRequest,
  type ArchivePayoffScenarioRequest,
  type CreateDebtRequest,
  type ExportDataRequest,
  type GetDashboardRequest,
  type GetDataManagementStatusRequest,
  type GetDebtReportsRequest,
  type GetDebtRequest,
  type GetImportBatchRequest,
  type GetPayoffScenarioRequest,
  type ListDebtsRequest,
  type ListPayoffScenariosRequest,
  type PostImportBatchRequest,
  type PreviewImportBatchPostingRequest,
  type RerunPayoffScenarioRequest,
  type ReverseDebtTransactionRequest,
  type RestoreDebtRequest,
  type RestoreBackupRequest,
  type SelectWorkbookForImportRequest,
  type UpdateImportSheetMappingRequest,
  type UpdateStagedImportRowReviewRequest,
  type UpdateDebtRequest,
  type VoidBalanceReconciliationRequest,
} from '../shared/debt-contracts';
import { DEBT_IPC_CHANNELS } from '../shared/debt-ipc';
import { appMetadata } from './app-metadata';

export type IpcInvoke = (channel: string, request: unknown) => Promise<unknown>;

export const createAppBridge = (invoke: IpcInvoke): AppBridge =>
  Object.freeze({
    appName: 'Debt Tracker',
    bridgeVersion: 17,
    appMetadata: appMetadataDtoSchema.parse(appMetadata),
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
    getDataManagementStatus: async (request: GetDataManagementStatusRequest) =>
      dataManagementStatusResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.dataManagementStatus,
          getDataManagementStatusRequestSchema.parse(request),
        ),
      ),
    createManualBackup: async (request: CreateManualBackupRequest) =>
      dataManagementStatusResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.createManualBackup,
          createManualBackupRequestSchema.parse(request),
        ),
      ),
    restoreBackup: async (request: RestoreBackupRequest) =>
      dataManagementStatusResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.restoreBackup,
          restoreBackupRequestSchema.parse(request),
        ),
      ),
    exportData: async (request: ExportDataRequest) =>
      dataExportResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.exportData,
          exportDataRequestSchema.parse(request),
        ),
      ),
    getDebtReports: async (request: GetDebtReportsRequest) =>
      debtReportsResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.reports,
          getDebtReportsRequestSchema.parse(request),
        ),
      ),
    selectWorkbookForImport: async (request: SelectWorkbookForImportRequest) =>
      importBatchOrNullResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.selectWorkbookForImport,
          selectWorkbookForImportRequestSchema.parse(request),
        ),
      ),
    listImportBatches: async () =>
      importBatchSummaryListResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.listImportBatches,
          listImportBatchesRequestSchema.parse({}),
        ),
      ),
    previewImportBatchPosting: async (request: PreviewImportBatchPostingRequest) =>
      importPostingPreviewResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.previewImportBatchPosting,
          previewImportBatchPostingRequestSchema.parse(request),
        ),
      ),
    postImportBatch: async (request: PostImportBatchRequest) =>
      importPostingResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.postImportBatch,
          postImportBatchRequestSchema.parse(request),
        ),
      ),
    getImportBatch: async (request: GetImportBatchRequest) =>
      importBatchResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.getImportBatch,
          getImportBatchRequestSchema.parse(request),
        ),
      ),
    updateImportSheetMapping: async (request: UpdateImportSheetMappingRequest) =>
      importBatchResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.updateImportSheetMapping,
          updateImportSheetMappingRequestSchema.parse(request),
        ),
      ),
    updateStagedImportRowReview: async (request: UpdateStagedImportRowReviewRequest) =>
      importBatchResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.updateStagedImportRowReview,
          updateStagedImportRowReviewRequestSchema.parse(request),
        ),
      ),
    createPayoffScenario: async (request: CreatePayoffScenarioRequest) =>
      payoffScenarioResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.createPayoffScenario,
          createPayoffScenarioRequestSchema.parse(request),
        ),
      ),
    listPayoffScenarios: async (request: ListPayoffScenariosRequest) =>
      payoffScenarioListResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.listPayoffScenarios,
          listPayoffScenariosRequestSchema.parse(request),
        ),
      ),
    getPayoffScenario: async (request: GetPayoffScenarioRequest) =>
      payoffScenarioResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.getPayoffScenario,
          getPayoffScenarioRequestSchema.parse(request),
        ),
      ),
    rerunPayoffScenario: async (request: RerunPayoffScenarioRequest) =>
      payoffScenarioResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.rerunPayoffScenario,
          rerunPayoffScenarioRequestSchema.parse(request),
        ),
      ),
    archivePayoffScenario: async (request: ArchivePayoffScenarioRequest) =>
      payoffScenarioResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.archivePayoffScenario,
          archivePayoffScenarioRequestSchema.parse(request),
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
    editDebtTransaction: async (request: EditDebtTransactionRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.editTransaction,
          editDebtTransactionRequestSchema.parse(request),
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
    voidBalanceReconciliation: async (request: VoidBalanceReconciliationRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.voidReconciliation,
          voidBalanceReconciliationRequestSchema.parse(request),
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
