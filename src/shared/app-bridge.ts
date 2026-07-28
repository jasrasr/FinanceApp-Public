import type {
  AddDebtTermRequest,
  AppMetadataDto,
  CreateBalanceReconciliationRequest,
  CreateBalanceSnapshotRequest,
  CreateDebtTransactionRequest,
  ApplicationResult,
  ArchiveDebtRequest,
  CreateDebtRequest,
  CreateManualBackupRequest,
  DashboardDto,
  DataExportDto,
  DataManagementStatusDto,
  DebtReportsDto,
  DebtDetailDto,
  DebtSummaryDto,
  ExportDataRequest,
  GetDashboardRequest,
  GetDataManagementStatusRequest,
  GetDebtReportsRequest,
  GetDebtRequest,
  GetImportBatchRequest,
  ImportBatchDto,
  ImportBatchSummaryDto,
  ImportPostingPreviewDto,
  ImportPostingResultDto,
  ListDebtsRequest,
  ListPayoffScenariosRequest,
  CreatePayoffScenarioRequest,
  GetPayoffScenarioRequest,
  RerunPayoffScenarioRequest,
  ArchivePayoffScenarioRequest,
  PayoffScenarioDto,
  PostImportBatchRequest,
  PreviewImportBatchPostingRequest,
  ReverseDebtTransactionRequest,
  RestoreDebtRequest,
  RestoreBackupRequest,
  SelectWorkbookForImportRequest,
  UpdateImportSheetMappingRequest,
  UpdateStagedImportRowReviewRequest,
  UpdateDebtRequest,
} from './debt-contracts';

export interface DebtBridge {
  listDebts(
    request: ListDebtsRequest,
  ): Promise<ApplicationResult<readonly DebtSummaryDto[]>>;
  getDashboard(request: GetDashboardRequest): Promise<ApplicationResult<DashboardDto>>;
  getDataManagementStatus(
    request: GetDataManagementStatusRequest,
  ): Promise<ApplicationResult<DataManagementStatusDto>>;
  createManualBackup(
    request: CreateManualBackupRequest,
  ): Promise<ApplicationResult<DataManagementStatusDto>>;
  restoreBackup(
    request: RestoreBackupRequest,
  ): Promise<ApplicationResult<DataManagementStatusDto>>;
  exportData(request: ExportDataRequest): Promise<ApplicationResult<DataExportDto>>;
  getDebtReports(
    request: GetDebtReportsRequest,
  ): Promise<ApplicationResult<DebtReportsDto>>;
  selectWorkbookForImport(
    request: SelectWorkbookForImportRequest,
  ): Promise<ApplicationResult<ImportBatchDto | null>>;
  getImportBatch(
    request: GetImportBatchRequest,
  ): Promise<ApplicationResult<ImportBatchDto>>;
  listImportBatches(): Promise<ApplicationResult<readonly ImportBatchSummaryDto[]>>;
  previewImportBatchPosting(
    request: PreviewImportBatchPostingRequest,
  ): Promise<ApplicationResult<ImportPostingPreviewDto>>;
  postImportBatch(
    request: PostImportBatchRequest,
  ): Promise<ApplicationResult<ImportPostingResultDto>>;
  createPayoffScenario(
    request: CreatePayoffScenarioRequest,
  ): Promise<ApplicationResult<PayoffScenarioDto>>;
  listPayoffScenarios(
    request: ListPayoffScenariosRequest,
  ): Promise<ApplicationResult<readonly PayoffScenarioDto[]>>;
  getPayoffScenario(
    request: GetPayoffScenarioRequest,
  ): Promise<ApplicationResult<PayoffScenarioDto>>;
  rerunPayoffScenario(
    request: RerunPayoffScenarioRequest,
  ): Promise<ApplicationResult<PayoffScenarioDto>>;
  archivePayoffScenario(
    request: ArchivePayoffScenarioRequest,
  ): Promise<ApplicationResult<PayoffScenarioDto>>;
  updateImportSheetMapping(
    request: UpdateImportSheetMappingRequest,
  ): Promise<ApplicationResult<ImportBatchDto>>;
  updateStagedImportRowReview(
    request: UpdateStagedImportRowReviewRequest,
  ): Promise<ApplicationResult<ImportBatchDto>>;
  getDebt(request: GetDebtRequest): Promise<ApplicationResult<DebtDetailDto>>;
  createDebt(request: CreateDebtRequest): Promise<ApplicationResult<DebtDetailDto>>;
  updateDebt(request: UpdateDebtRequest): Promise<ApplicationResult<DebtDetailDto>>;
  addDebtTerm(request: AddDebtTermRequest): Promise<ApplicationResult<DebtDetailDto>>;
  createDebtTransaction(
    request: CreateDebtTransactionRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  reverseDebtTransaction(
    request: ReverseDebtTransactionRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  createBalanceSnapshot(
    request: CreateBalanceSnapshotRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  createBalanceReconciliation(
    request: CreateBalanceReconciliationRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  archiveDebt(request: ArchiveDebtRequest): Promise<ApplicationResult<DebtDetailDto>>;
  restoreDebt(request: RestoreDebtRequest): Promise<ApplicationResult<DebtDetailDto>>;
}

export interface AppBridge extends DebtBridge {
  readonly appName: 'Debt Tracker';
  readonly bridgeVersion: 11;
  readonly appMetadata: AppMetadataDto;
}
