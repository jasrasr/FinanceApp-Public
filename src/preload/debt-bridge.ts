import type { AppBridge } from '../shared/app-bridge';
import { z } from 'zod';
import {
  appMetadataDtoSchema,
  applicationResultSchema,
  createBalanceReconciliationRequestSchema,
  createBalanceSnapshotRequestSchema,
  createDebtTransactionRequestSchema,
  createDebtTransferRequestSchema,
  editDebtTransactionRequestSchema,
  createManualBackupRequestSchema,
  createPayoffScenarioRequestSchema,
  extraCashAllocationRequestSchema,
  addDebtTermRequestSchema,
  archiveDebtRequestSchema,
  archivePayoffScenarioRequestSchema,
  renamePayoffScenarioRequestSchema,
  createDebtRequestSchema,
  dashboardResultSchema,
  dataHealthResultSchema,
  milestonesResultSchema,
  debtOutlookResultSchema,
  interestAnalysisResultSchema,
  refinanceAnalysisResultSchema,
  acceptCurrentBalanceRequestSchema,
  dataExportResultSchema,
  dataManagementStatusResultSchema,
  deleteBackupRequestSchema,
  deleteDebtPermanentlyRequestSchema,
  confirmScheduledPaymentRequestSchema,
  removeScheduledPaymentConfirmationRequestSchema,
  debtReportsResultSchema,
  debtDetailResultSchema,
  debtListResultSchema,
  exportDataRequestSchema,
  getDashboardRequestSchema,
  getDataHealthRequestSchema,
  getMilestonesRequestSchema,
  getDebtOutlookRequestSchema,
  getInterestAnalysisRequestSchema,
  getRefinanceAnalysisRequestSchema,
  getDataManagementStatusRequestSchema,
  getDebtReportsRequestSchema,
  getDebtRequestSchema,
  getPayoffScenarioRequestSchema,
  listPayoffScenariosRequestSchema,
  calculatePayoffBaselineRequestSchema,
  listDebtsRequestSchema,
  payoffScenarioListResultSchema,
  payoffScenarioResultSchema,
  payoffBaselineResultSchema,
  extraCashAllocationResultSchema,
  permanentDebtDeletionResultSchema,
  recordRefinanceRequestSchema,
  reverseDebtTransactionRequestSchema,
  rerunPayoffScenarioRequestSchema,
  restoreDebtRequestSchema,
  restoreBackupRequestSchema,
  chooseDataFolderRequestSchema,
  chooseBackupFileRequestSchema,
  setDataLocationsRequestSchema,
  openBackupFolderRequestSchema,
  importBackupFileRequestSchema,
  listIncomeRecordsRequestSchema,
  createIncomeRecordRequestSchema,
  updateIncomeRecordRequestSchema,
  archiveIncomeRecordRequestSchema,
  incomeRecordListResultSchema,
  incomeRecordResultSchema,
  listIncomeTransactionsRequestSchema,
  createIncomeTransactionRequestSchema,
  updateIncomeTransactionRequestSchema,
  archiveIncomeTransactionRequestSchema,
  incomeTransactionListResultSchema,
  incomeTransactionResultSchema,
  updateDebtRequestSchema,
  voidBalanceReconciliationRequestSchema,
  voidDebtTransactionRequestSchema,
  type AddDebtTermRequest,
  type CreateBalanceReconciliationRequest,
  type CreateBalanceSnapshotRequest,
  type CreateDebtTransactionRequest,
  type CreateDebtTransferRequest,
  type EditDebtTransactionRequest,
  type CreateManualBackupRequest,
  type CreatePayoffScenarioRequest,
  type ExtraCashAllocationRequest,
  type ArchiveDebtRequest,
  type ArchivePayoffScenarioRequest,
  type RenamePayoffScenarioRequest,
  type CreateDebtRequest,
  type DeleteBackupRequest,
  type DeleteDebtPermanentlyRequest,
  type ConfirmScheduledPaymentRequest,
  type RemoveScheduledPaymentConfirmationRequest,
  type ExportDataRequest,
  type GetDashboardRequest,
  type GetDataHealthRequest,
  type GetMilestonesRequest,
  type GetDebtOutlookRequest,
  type GetInterestAnalysisRequest,
  type GetRefinanceAnalysisRequest,
  type AcceptCurrentBalanceRequest,
  type GetDataManagementStatusRequest,
  type GetDebtReportsRequest,
  type GetDebtRequest,
  type GetPayoffScenarioRequest,
  type ListDebtsRequest,
  type ListPayoffScenariosRequest,
  type CalculatePayoffBaselineRequest,
  type RerunPayoffScenarioRequest,
  type RecordRefinanceRequest,
  type ReverseDebtTransactionRequest,
  type RestoreDebtRequest,
  type RestoreBackupRequest,
  type ChooseDataFolderRequest,
  type ChooseBackupFileRequest,
  type SetDataLocationsRequest,
  type ImportBackupFileRequest,
  type UpdateDebtRequest,
  type VoidBalanceReconciliationRequest,
  type VoidDebtTransactionRequest,
  type ListIncomeRecordsRequest,
  type CreateIncomeRecordRequest,
  type UpdateIncomeRecordRequest,
  type ArchiveIncomeRecordRequest,
  type ListIncomeTransactionsRequest,
  type CreateIncomeTransactionRequest,
  type UpdateIncomeTransactionRequest,
  type ArchiveIncomeTransactionRequest,
} from '../shared/debt-contracts';
import { DEBT_IPC_CHANNELS } from '../shared/debt-ipc';
import { appMetadata } from './app-metadata';

export type IpcInvoke = (channel: string, request: unknown) => Promise<unknown>;

export const createAppBridge = (invoke: IpcInvoke): AppBridge =>
  Object.freeze({
    appName: 'Debt Tracker',
    bridgeVersion: 27,
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
    getDataHealth: async (request: GetDataHealthRequest) =>
      dataHealthResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.dataHealth,
          getDataHealthRequestSchema.parse(request),
        ),
      ),
    getMilestones: async (request: GetMilestonesRequest) =>
      milestonesResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.milestones,
          getMilestonesRequestSchema.parse(request),
        ),
      ),
    getDebtOutlook: async (request: GetDebtOutlookRequest) =>
      debtOutlookResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.debtOutlook,
          getDebtOutlookRequestSchema.parse(request),
        ),
      ),
    getInterestAnalysis: async (request: GetInterestAnalysisRequest) =>
      interestAnalysisResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.interestAnalysis,
          getInterestAnalysisRequestSchema.parse(request),
        ),
      ),
    getRefinanceAnalysis: async (request: GetRefinanceAnalysisRequest) =>
      refinanceAnalysisResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.refinanceAnalysis,
          getRefinanceAnalysisRequestSchema.parse(request),
        ),
      ),
    acceptCurrentBalance: async (request: AcceptCurrentBalanceRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.acceptCurrentBalance,
          acceptCurrentBalanceRequestSchema.parse(request),
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
    deleteBackup: async (request: DeleteBackupRequest) =>
      dataManagementStatusResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.deleteBackup,
          deleteBackupRequestSchema.parse(request),
        ),
      ),
    exportData: async (request: ExportDataRequest) =>
      dataExportResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.exportData,
          exportDataRequestSchema.parse(request),
        ),
      ),
    chooseDataFolder: async (request: ChooseDataFolderRequest) =>
      applicationResultSchema(z.string().nullable()).parse(
        await invoke(
          DEBT_IPC_CHANNELS.chooseDataFolder,
          chooseDataFolderRequestSchema.parse(request),
        ),
      ),
    chooseBackupFile: async (request: ChooseBackupFileRequest) =>
      applicationResultSchema(z.string().nullable()).parse(
        await invoke(
          DEBT_IPC_CHANNELS.chooseBackupFile,
          chooseBackupFileRequestSchema.parse(request),
        ),
      ),
    setDataLocations: async (request: SetDataLocationsRequest) =>
      dataManagementStatusResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.setDataLocations,
          setDataLocationsRequestSchema.parse(request),
        ),
      ),
    openBackupFolder: async (request: Record<string, never>) =>
      applicationResultSchema(z.boolean()).parse(
        await invoke(
          DEBT_IPC_CHANNELS.openBackupFolder,
          openBackupFolderRequestSchema.parse(request),
        ),
      ),
    importBackupFile: async (request: ImportBackupFileRequest) =>
      dataManagementStatusResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.importBackupFile,
          importBackupFileRequestSchema.parse(request),
        ),
      ),
    getDebtReports: async (request: GetDebtReportsRequest) =>
      debtReportsResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.reports,
          getDebtReportsRequestSchema.parse(request),
        ),
      ),
    listIncomeRecords: async (request: ListIncomeRecordsRequest) =>
      incomeRecordListResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.listIncomeRecords,
          listIncomeRecordsRequestSchema.parse(request),
        ),
      ),
    createIncomeRecord: async (request: CreateIncomeRecordRequest) =>
      incomeRecordResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.createIncomeRecord,
          createIncomeRecordRequestSchema.parse(request),
        ),
      ),
    updateIncomeRecord: async (request: UpdateIncomeRecordRequest) =>
      incomeRecordResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.updateIncomeRecord,
          updateIncomeRecordRequestSchema.parse(request),
        ),
      ),
    archiveIncomeRecord: async (request: ArchiveIncomeRecordRequest) =>
      incomeRecordResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.archiveIncomeRecord,
          archiveIncomeRecordRequestSchema.parse(request),
        ),
      ),
    listIncomeTransactions: async (request: ListIncomeTransactionsRequest) =>
      incomeTransactionListResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.listIncomeTransactions,
          listIncomeTransactionsRequestSchema.parse(request),
        ),
      ),
    createIncomeTransaction: async (request: CreateIncomeTransactionRequest) =>
      incomeTransactionResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.createIncomeTransaction,
          createIncomeTransactionRequestSchema.parse(request),
        ),
      ),
    updateIncomeTransaction: async (request: UpdateIncomeTransactionRequest) =>
      incomeTransactionResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.updateIncomeTransaction,
          updateIncomeTransactionRequestSchema.parse(request),
        ),
      ),
    archiveIncomeTransaction: async (request: ArchiveIncomeTransactionRequest) =>
      incomeTransactionResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.archiveIncomeTransaction,
          archiveIncomeTransactionRequestSchema.parse(request),
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
    calculatePayoffBaseline: async (request: CalculatePayoffBaselineRequest) =>
      payoffBaselineResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.calculatePayoffBaseline,
          calculatePayoffBaselineRequestSchema.parse(request),
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
    renamePayoffScenario: async (request: RenamePayoffScenarioRequest) =>
      payoffScenarioResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.renamePayoffScenario,
          renamePayoffScenarioRequestSchema.parse(request),
        ),
      ),
    calculateExtraCashAllocation: async (request: ExtraCashAllocationRequest) =>
      extraCashAllocationResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.calculateExtraCashAllocation,
          extraCashAllocationRequestSchema.parse(request),
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
    createDebtTransfer: async (request: CreateDebtTransferRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.createTransfer,
          createDebtTransferRequestSchema.parse(request),
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
    voidDebtTransaction: async (request: VoidDebtTransactionRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.voidTransaction,
          voidDebtTransactionRequestSchema.parse(request),
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
    recordRefinance: async (request: RecordRefinanceRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.recordRefinance,
          recordRefinanceRequestSchema.parse(request),
        ),
      ),
    deleteDebtPermanently: async (request: DeleteDebtPermanentlyRequest) =>
      permanentDebtDeletionResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.deletePermanently,
          deleteDebtPermanentlyRequestSchema.parse(request),
        ),
      ),
    confirmScheduledPayment: async (request: ConfirmScheduledPaymentRequest) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.confirmScheduledPayment,
          confirmScheduledPaymentRequestSchema.parse(request),
        ),
      ),
    removeScheduledPaymentConfirmation: async (
      request: RemoveScheduledPaymentConfirmationRequest,
    ) =>
      debtDetailResultSchema.parse(
        await invoke(
          DEBT_IPC_CHANNELS.removeScheduledPaymentConfirmation,
          removeScheduledPaymentConfirmationRequestSchema.parse(request),
        ),
      ),
  });
