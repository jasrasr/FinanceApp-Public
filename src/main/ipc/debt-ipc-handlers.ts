import type { IpcMainInvokeEvent } from 'electron';
import { ZodError, type ZodType } from 'zod';
import {
  createBalanceReconciliationRequestSchema,
  createBalanceSnapshotRequestSchema,
  createDebtTransactionRequestSchema,
  createManualBackupRequestSchema,
  createPayoffScenarioRequestSchema,
  addDebtTermRequestSchema,
  archiveDebtRequestSchema,
  archivePayoffScenarioRequestSchema,
  createDebtRequestSchema,
  dashboardDtoSchema,
  dataExportDtoSchema,
  dataManagementStatusDtoSchema,
  debtReportsDtoSchema,
  debtDetailDtoSchema,
  debtSummaryListSchema,
  exportDataRequestSchema,
  getDashboardRequestSchema,
  getDataManagementStatusRequestSchema,
  getDebtReportsRequestSchema,
  getDebtRequestSchema,
  getImportBatchRequestSchema,
  getPayoffScenarioRequestSchema,
  importBatchDtoSchema,
  importBatchSummaryDtoSchema,
  importPostingPreviewDtoSchema,
  importPostingResultDtoSchema,
  listImportBatchesRequestSchema,
  listDebtsRequestSchema,
  listPayoffScenariosRequestSchema,
  payoffScenarioDtoSchema,
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
): void => {
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
    DEBT_IPC_CHANNELS.dashboard,
    getDashboardRequestSchema,
    dashboardDtoSchema,
    isTrustedSender,
    (request) => service.getDashboard(request),
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
    (request) => dataManagementService.createManualBackup(request),
  );
  registerAsyncHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.restoreBackup,
    restoreBackupRequestSchema,
    dataManagementStatusDtoSchema,
    isTrustedSender,
    (request) => dataManagementService.restoreBackup(request),
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
    DEBT_IPC_CHANNELS.selectWorkbookForImport,
    selectWorkbookForImportRequestSchema,
    importBatchDtoSchema.nullable(),
    isTrustedSender,
    (request) => service.selectWorkbookForImport(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.listImportBatches,
    listImportBatchesRequestSchema,
    importBatchSummaryDtoSchema.array(),
    isTrustedSender,
    () => service.listImportBatches(),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.getImportBatch,
    getImportBatchRequestSchema,
    importBatchDtoSchema,
    isTrustedSender,
    (request) => service.getImportBatch(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.previewImportBatchPosting,
    previewImportBatchPostingRequestSchema,
    importPostingPreviewDtoSchema,
    isTrustedSender,
    (request) => service.previewImportBatchPosting(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.postImportBatch,
    postImportBatchRequestSchema,
    importPostingResultDtoSchema,
    isTrustedSender,
    (request) => service.postImportBatch(request),
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
    DEBT_IPC_CHANNELS.listPayoffScenarios,
    listPayoffScenariosRequestSchema,
    payoffScenarioDtoSchema.array(),
    isTrustedSender,
    (request) => service.listPayoffScenarios(request),
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
    DEBT_IPC_CHANNELS.updateImportSheetMapping,
    updateImportSheetMappingRequestSchema,
    importBatchDtoSchema,
    isTrustedSender,
    (request) => service.updateImportSheetMapping(request),
  );
  registerHandler(
    ipcMain,
    DEBT_IPC_CHANNELS.updateStagedImportRowReview,
    updateStagedImportRowReviewRequestSchema,
    importBatchDtoSchema,
    isTrustedSender,
    (request) => service.updateStagedImportRowReview(request),
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
    DEBT_IPC_CHANNELS.reverseTransaction,
    reverseDebtTransactionRequestSchema,
    debtDetailDtoSchema,
    isTrustedSender,
    (request) => service.reverseDebtTransaction(request),
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
};

export const removeDebtIpcHandlers = (ipcMain: DebtIpcRegistrar): void => {
  for (const channel of Object.values(DEBT_IPC_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
};
