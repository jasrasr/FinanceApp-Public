import type {
  AddDebtTermRequest,
  AppMetadataDto,
  CreateBalanceReconciliationRequest,
  CreateBalanceSnapshotRequest,
  CreateDebtTransactionRequest,
  EditDebtTransactionRequest,
  ApplicationResult,
  ArchiveDebtRequest,
  CreateDebtRequest,
  CreateManualBackupRequest,
  DashboardDto,
  DataExportDto,
  DataManagementStatusDto,
  DeleteBackupRequest,
  DebtReportsDto,
  DebtDetailDto,
  DebtSummaryDto,
  DeleteDebtPermanentlyRequest,
  ConfirmScheduledPaymentRequest,
  RemoveScheduledPaymentConfirmationRequest,
  ExportDataRequest,
  GetDashboardRequest,
  GetDataManagementStatusRequest,
  GetDebtReportsRequest,
  GetDebtRequest,
  ListDebtsRequest,
  ListPayoffScenariosRequest,
  CreatePayoffScenarioRequest,
  CalculatePayoffBaselineRequest,
  GetPayoffScenarioRequest,
  RerunPayoffScenarioRequest,
  ArchivePayoffScenarioRequest,
  RenamePayoffScenarioRequest,
  PayoffScenarioDto,
  PayoffBaselineDto,
  PermanentDebtDeletionDto,
  RecordRefinanceRequest,
  ReverseDebtTransactionRequest,
  RestoreDebtRequest,
  RestoreBackupRequest,
  UpdateDebtRequest,
  VoidBalanceReconciliationRequest,
  VoidDebtTransactionRequest,
  ExtraCashAllocationRequest,
  ExtraCashAllocationResponse,
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
  deleteBackup(
    request: DeleteBackupRequest,
  ): Promise<ApplicationResult<DataManagementStatusDto>>;
  exportData(request: ExportDataRequest): Promise<ApplicationResult<DataExportDto>>;
  getDebtReports(
    request: GetDebtReportsRequest,
  ): Promise<ApplicationResult<DebtReportsDto>>;
  createPayoffScenario(
    request: CreatePayoffScenarioRequest,
  ): Promise<ApplicationResult<PayoffScenarioDto>>;
  listPayoffScenarios(
    request: ListPayoffScenariosRequest,
  ): Promise<ApplicationResult<readonly PayoffScenarioDto[]>>;
  calculatePayoffBaseline(
    request: CalculatePayoffBaselineRequest,
  ): Promise<ApplicationResult<PayoffBaselineDto>>;
  getPayoffScenario(
    request: GetPayoffScenarioRequest,
  ): Promise<ApplicationResult<PayoffScenarioDto>>;
  rerunPayoffScenario(
    request: RerunPayoffScenarioRequest,
  ): Promise<ApplicationResult<PayoffScenarioDto>>;
  archivePayoffScenario(
    request: ArchivePayoffScenarioRequest,
  ): Promise<ApplicationResult<PayoffScenarioDto>>;
  renamePayoffScenario(
    request: RenamePayoffScenarioRequest,
  ): Promise<ApplicationResult<PayoffScenarioDto>>;
  calculateExtraCashAllocation(
    request: ExtraCashAllocationRequest,
  ): Promise<ApplicationResult<ExtraCashAllocationResponse>>;
  getDebt(request: GetDebtRequest): Promise<ApplicationResult<DebtDetailDto>>;
  createDebt(request: CreateDebtRequest): Promise<ApplicationResult<DebtDetailDto>>;
  updateDebt(request: UpdateDebtRequest): Promise<ApplicationResult<DebtDetailDto>>;
  addDebtTerm(request: AddDebtTermRequest): Promise<ApplicationResult<DebtDetailDto>>;
  createDebtTransaction(
    request: CreateDebtTransactionRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  editDebtTransaction(
    request: EditDebtTransactionRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  reverseDebtTransaction(
    request: ReverseDebtTransactionRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  voidDebtTransaction(
    request: VoidDebtTransactionRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  createBalanceSnapshot(
    request: CreateBalanceSnapshotRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  createBalanceReconciliation(
    request: CreateBalanceReconciliationRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  voidBalanceReconciliation(
    request: VoidBalanceReconciliationRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  archiveDebt(request: ArchiveDebtRequest): Promise<ApplicationResult<DebtDetailDto>>;
  restoreDebt(request: RestoreDebtRequest): Promise<ApplicationResult<DebtDetailDto>>;
  recordRefinance(
    request: RecordRefinanceRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  deleteDebtPermanently(
    request: DeleteDebtPermanentlyRequest,
  ): Promise<ApplicationResult<PermanentDebtDeletionDto>>;
  confirmScheduledPayment(
    request: ConfirmScheduledPaymentRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
  removeScheduledPaymentConfirmation(
    request: RemoveScheduledPaymentConfirmationRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
}

export interface AppBridge extends DebtBridge {
  readonly appName: 'Debt Tracker';
  readonly bridgeVersion: 23;
  readonly appMetadata: AppMetadataDto;
}
