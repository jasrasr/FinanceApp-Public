import type { IpcMainInvokeEvent } from 'electron';
import { ZodError, z, type ZodType } from 'zod';
import {
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
  dashboardDtoSchema,
  dataHealthDtoSchema,
  milestonesDtoSchema,
  debtOutlookDtoSchema,
  interestAnalysisDtoSchema,
  refinanceAnalysisDtoSchema,
  dataExportDtoSchema,
  dataManagementStatusDtoSchema,
  deleteBackupRequestSchema,
  deleteDebtPermanentlyRequestSchema,
  confirmScheduledPaymentRequestSchema,
  removeScheduledPaymentConfirmationRequestSchema,
  debtReportsDtoSchema,
  debtDetailDtoSchema,
  debtSummaryListSchema,
  exportDataRequestSchema,
  getDashboardRequestSchema,
  getDataHealthRequestSchema,
  getMilestonesRequestSchema,
  getDebtOutlookRequestSchema,
  getInterestAnalysisRequestSchema,
  getRefinanceAnalysisRequestSchema,
  acceptCurrentBalanceRequestSchema,
  getDataManagementStatusRequestSchema,
  getDebtReportsRequestSchema,
  getDebtRequestSchema,
  getPayoffScenarioRequestSchema,
  listDebtsRequestSchema,
  listPayoffScenariosRequestSchema,
  calculatePayoffBaselineRequestSchema,
  payoffScenarioDtoSchema,
  payoffBaselineDtoSchema,
  extraCashAllocationResponseSchema,
  permanentDebtDeletionDtoSchema,
  recordRefinanceRequestSchema,
  reverseDebtTransactionRequestSchema,
  voidDebtTransactionRequestSchema,
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
  listIncomeTransactionsRequestSchema,
  createIncomeTransactionRequestSchema,
  updateIncomeTransactionRequestSchema,
  archiveIncomeTransactionRequestSchema,
  incomeRecordDtoSchema,
  incomeTransactionDtoSchema,
  updateDebtRequestSchema,
  voidBalanceReconciliationRequestSchema,
  type ApplicationError,
  type ApplicationResult,
} from '../../shared/debt-contracts';
import { DEBT_IPC_CHANNELS } from '../../shared/debt-ipc';
import { ApplicationServiceError } from '../services/application-error';
import type { DataManagementService } from '../services/data-management-service';
import type { DebtMaintenanceService } from '../services/debt-maintenance-service';
import type { TrustedSenderValidator } from './trusted-sender';

export interface DebtIpcRegistrar {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, request: unknown) => unknown,
  ): void;
  removeHandler(channel: string): void;
}

const validationError = (error: ZodError): ApplicationError => {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'request';
    (fieldErrors[field] ??= []).push(issue.message);
  }

  return {
    code: 'validation',
    message: 'Review the highlighted fields.',
    fieldErrors,
  };
};

const structuredError = (error: unknown): ApplicationError => {
  if (error instanceof ApplicationServiceError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.fieldErrors
        ? {
            fieldErrors: Object.fromEntries(
              Object.entries(error.fieldErrors).map(([field, messages]) => [
                field,
                [...messages],
              ]),
            ),
          }
        : {}),
    };
  }

  if (error instanceof ZodError) {
    return validationError(error);
  }

  return {
    code: 'internal',
    message: 'Debt Tracker could not complete that request.',
  };
};

const registerHandler = <TRequest, TResponse>(
  ipcMain: DebtIpcRegistrar,
  channel: string,
  requestSchema: ZodType<TRequest>,
  responseSchema: ZodType<TResponse>,
  isTrustedSender: TrustedSenderValidator,
  operation: (request: TRequest) => TResponse,
): void => {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (event, request): ApplicationResult<TResponse> => {
    if (!isTrustedSender(event)) {
      return {
        ok: false,
        error: {
          code: 'forbidden',
          message: 'The request did not originate from trusted application content.',
        },
      };
    }

    try {
      const parsedRequest = requestSchema.parse(request);
      const parsedResponse = responseSchema.parse(operation(parsedRequest));
      return { ok: true, value: parsedResponse };
    } catch (error) {
      return { ok: false, error: structuredError(error) };
    }
  });
};

const registerAsyncHandler = <TRequest, TResponse>(
  ipcMain: DebtIpcRegistrar,
  channel: string,
  requestSchema: ZodType<TRequest>,
  responseSchema: ZodType<TResponse>,
  isTrustedSender: TrustedSenderValidator,
  operation: (request: TRequest) => Promise<TResponse>,
): void => {
  ipcMain.removeHandler(channel);
  ipcMain.handle(
    channel,
    async (event, request): Promise<ApplicationResult<TResponse>> => {
      if (!isTrustedSender(event)) {
        return {
          ok: false,
          error: {
            code: 'forbidden',
            message: 'The request did not originate from trusted application content.',
          },
        };
      }

      try {
        const parsedRequest = requestSchema.parse(request);
        const parsedResponse = responseSchema.parse(await operation(parsedRequest));
        return { ok: true, value: parsedResponse };
      } catch (error) {
        return { ok: false, error: structuredError(error) };
      }
    },
  );
};

export const registerDebtIpcHandlers = (
  ipcMain: DebtIpcRegistrar,
  service: DebtMaintenanceService,
  dataManagementService: DataManagementService,
  isTrustedSender: TrustedSenderValidator,
  nativeDialogs: {
    readonly selectFolder: (title: string) => string | null;
    readonly selectBackupFile: () => string | null;
  } = { selectFolder: () => null, selectBackupFile: () => null },
): void => {
  let databaseOperationActive = false;
  const runExclusiveDatabaseOperation = async <T>(
    operation: () => Promise<T> | T,
  ): Promise<T> => {
    if (databaseOperationActive) {
      throw new ApplicationServiceError(
        'conflict',
        'Another database operation is already in progress. Try again after it finishes.',
      );
    }

    databaseOperationActive = true;
    try {
      return await operation();
    } finally {
      databaseOperationActive = false;
    }
  };

  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.list,
    listDebtsRequestSchema,
    debtSummaryListSchema,
    isTrustedSender,
    (request) => service.listDebts(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.refinanceAnalysis,
    getRefinanceAnalysisRequestSchema,
    refinanceAnalysisDtoSchema,
    isTrustedSender,
    (request) => service.getRefinanceAnalysis!(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.chooseDataFolder,
    chooseDataFolderRequestSchema,
    z.string().nullable(),
    isTrustedSender,
    (request) =>
      nativeDialogs.selectFolder(
        request.kind === 'backup' ? 'Select backup folder' : 'Select export folder',
      ),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.chooseBackupFile,
    chooseBackupFileRequestSchema,
    z.string().nullable(),
    isTrustedSender,
    () => nativeDialogs.selectBackupFile(),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.setDataLocations,
    setDataLocationsRequestSchema,
    dataManagementStatusDtoSchema,
    isTrustedSender,
    (request) => dataManagementService.setDataLocations!(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.openBackupFolder,
    openBackupFolderRequestSchema,
    z.boolean(),
    isTrustedSender,
    () => dataManagementService.openBackupFolder?.() ?? false,
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.importBackupFile,
    importBackupFileRequestSchema,
    dataManagementStatusDtoSchema,
    isTrustedSender,
    (request) => dataManagementService.importBackupFile!(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.dashboard,
    getDashboardRequestSchema,
    dashboardDtoSchema,
    isTrustedSender,
    (request) => service.getDashboard(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.dataHealth,
    getDataHealthRequestSchema,
    dataHealthDtoSchema,
    isTrustedSender,
    (request) => service.getDataHealth!(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.milestones,
    getMilestonesRequestSchema,
    milestonesDtoSchema,
    isTrustedSender,
    (request) => service.getMilestones!(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.debtOutlook,
    getDebtOutlookRequestSchema,
    debtOutlookDtoSchema,
    isTrustedSender,
    (request) => service.getDebtOutlook!(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.interestAnalysis,
    getInterestAnalysisRequestSchema,
    interestAnalysisDtoSchema,
    isTrustedSender,
    (request) => service.getInterestAnalysis!(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.acceptCurrentBalance,
    acceptCurrentBalanceRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.acceptCurrentBalance!(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.dataManagementStatus,
    getDataManagementStatusRequestSchema,
    dataManagementStatusDtoSchema,
    isTrustedSender,
    (request) => dataManagementService.getDataManagementStatus(request),
  );
  registerAsyncHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.createManualBackup,
    createManualBackupRequestSchema,
    dataManagementStatusDtoSchema,
    isTrustedSender,
    (request) =>
      runExclusiveDatabaseOperation(() =>
        dataManagementService.createManualBackup(request),
      ),
  );
  registerAsyncHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.restoreBackup,
    restoreBackupRequestSchema,
    dataManagementStatusDtoSchema,
    isTrustedSender,
    (request) =>
      runExclusiveDatabaseOperation(() => dataManagementService.restoreBackup(request)),
  );
  registerAsyncHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.deleteBackup,
    deleteBackupRequestSchema,
    dataManagementStatusDtoSchema,
    isTrustedSender,
    (request) => dataManagementService.deleteBackup(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.exportData,
    exportDataRequestSchema,
    dataExportDtoSchema,
    isTrustedSender,
    (request) => dataManagementService.exportData(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.reports,
    getDebtReportsRequestSchema,
    debtReportsDtoSchema,
    isTrustedSender,
    (request) => service.getDebtReports(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.listIncomeRecords,
    listIncomeRecordsRequestSchema,
    incomeRecordDtoSchema.array(),
    isTrustedSender,
    (request) => service.listIncomeRecords(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.createIncomeRecord,
    createIncomeRecordRequestSchema,
    incomeRecordDtoSchema,
    isTrustedSender,
    (request) => service.createIncomeRecord(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.updateIncomeRecord,
    updateIncomeRecordRequestSchema,
    incomeRecordDtoSchema,
    isTrustedSender,
    (request) => service.updateIncomeRecord(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.archiveIncomeRecord,
    archiveIncomeRecordRequestSchema,
    incomeRecordDtoSchema,
    isTrustedSender,
    (request) => service.archiveIncomeRecord(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.listIncomeTransactions,
    listIncomeTransactionsRequestSchema,
    incomeTransactionDtoSchema.array(),
    isTrustedSender,
    (request) => service.listIncomeTransactions(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.createIncomeTransaction,
    createIncomeTransactionRequestSchema,
    incomeTransactionDtoSchema,
    isTrustedSender,
    (request) => service.createIncomeTransaction(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.updateIncomeTransaction,
    updateIncomeTransactionRequestSchema,
    incomeTransactionDtoSchema,
    isTrustedSender,
    (request) => service.updateIncomeTransaction(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.archiveIncomeTransaction,
    archiveIncomeTransactionRequestSchema,
    incomeTransactionDtoSchema,
    isTrustedSender,
    (request) => service.archiveIncomeTransaction(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.createPayoffScenario,
    createPayoffScenarioRequestSchema,
    payoffScenarioDtoSchema,
    isTrustedSender,
    (request) => service.createPayoffScenario(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.calculateExtraCashAllocation,
    extraCashAllocationRequestSchema,
    extraCashAllocationResponseSchema,
    isTrustedSender,
    (request) => service.calculateExtraCashAllocation(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.listPayoffScenarios,
    listPayoffScenariosRequestSchema,
    payoffScenarioDtoSchema.array(),
    isTrustedSender,
    (request) => service.listPayoffScenarios(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.calculatePayoffBaseline,
    calculatePayoffBaselineRequestSchema,
    payoffBaselineDtoSchema,
    isTrustedSender,
    (request) => service.calculatePayoffBaseline(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.getPayoffScenario,
    getPayoffScenarioRequestSchema,
    payoffScenarioDtoSchema,
    isTrustedSender,
    (request) => service.getPayoffScenario(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.rerunPayoffScenario,
    rerunPayoffScenarioRequestSchema,
    payoffScenarioDtoSchema,
    isTrustedSender,
    (request) => service.rerunPayoffScenario(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.archivePayoffScenario,
    archivePayoffScenarioRequestSchema,
    payoffScenarioDtoSchema,
    isTrustedSender,
    (request) => service.archivePayoffScenario(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.renamePayoffScenario,
    renamePayoffScenarioRequestSchema,
    payoffScenarioDtoSchema,
    isTrustedSender,
    (request) => service.renamePayoffScenario(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.get,
    getDebtRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.getDebt(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.create,
    createDebtRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.createDebt(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.update,
    updateDebtRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.updateDebt(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.addTerm,
    addDebtTermRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.addDebtTerm(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.createTransaction,
    createDebtTransactionRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.createDebtTransaction(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.createTransfer,
    createDebtTransferRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.createDebtTransfer(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.editTransaction,
    editDebtTransactionRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.editDebtTransaction(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.reverseTransaction,
    reverseDebtTransactionRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.reverseDebtTransaction(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.voidTransaction,
    voidDebtTransactionRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.voidDebtTransaction(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.createSnapshot,
    createBalanceSnapshotRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.createBalanceSnapshot(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.createReconciliation,
    createBalanceReconciliationRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.createBalanceReconciliation(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.voidReconciliation,
    voidBalanceReconciliationRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.voidBalanceReconciliation(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.archive,
    archiveDebtRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.archiveDebt(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.restore,
    restoreDebtRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.restoreDebt(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.recordRefinance,
    recordRefinanceRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.recordRefinance(request),
  );
  registerAsyncHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.deletePermanently,
    deleteDebtPermanentlyRequestSchema,
    permanentDebtDeletionDtoSchema,
    isTrustedSender,
    async (request) => {
      return runExclusiveDatabaseOperation(async () => {
        const backup = await dataManagementService.createManualBackup({});
        const backupId = backup.lastBackup.backup?.id;
        if (!backupId) {
          throw new ApplicationServiceError(
            'internal',
            'A validated backup could not be confirmed before deletion.',
          );
        }
        return service.deleteDebtPermanently(request, backupId);
      });
    },
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.confirmScheduledPayment,
    confirmScheduledPaymentRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.confirmScheduledPayment(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.removeScheduledPaymentConfirmation,
    removeScheduledPaymentConfirmationRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.removeScheduledPaymentConfirmation(request),
  );
};

export const removeDebtIpcHandlers = (ipcMain: DebtIpcRegistrar): void => {
  for (const channel of Object.values(DEBT_IPC_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
};
