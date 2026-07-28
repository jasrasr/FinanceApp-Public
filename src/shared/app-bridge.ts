import type {
  AddDebtTermRequest,
  CreateBalanceReconciliationRequest,
  CreateBalanceSnapshotRequest,
  CreateDebtTransactionRequest,
  ApplicationResult,
  ArchiveDebtRequest,
  CreateDebtRequest,
  DashboardDto,
  DebtDetailDto,
  DebtSummaryDto,
  GetDashboardRequest,
  GetDebtRequest,
  GetImportBatchRequest,
  ImportBatchDto,
  ImportBatchSummaryDto,
  ListDebtsRequest,
  ReverseDebtTransactionRequest,
  RestoreDebtRequest,
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
  selectWorkbookForImport(
    request: SelectWorkbookForImportRequest,
  ): Promise<ApplicationResult<ImportBatchDto | null>>;
  getImportBatch(
    request: GetImportBatchRequest,
  ): Promise<ApplicationResult<ImportBatchDto>>;
  listImportBatches(): Promise<ApplicationResult<readonly ImportBatchSummaryDto[]>>;
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
  readonly bridgeVersion: 6;
}
