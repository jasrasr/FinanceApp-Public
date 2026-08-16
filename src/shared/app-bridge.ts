import type {
  AddDebtTermRequest,
  AppMetadataDto,
  CreateBalanceReconciliationRequest,
  CreateBalanceSnapshotRequest,
  CreateDebtTransactionRequest,
  CreateDebtTransferRequest,
  EditDebtTransactionRequest,
  ApplicationResult,
  ArchiveDebtRequest,
  CreateDebtRequest,
  CreateManualBackupRequest,
  DashboardDto,
  DataHealthDto,
  MilestonesDto,
  DebtOutlookDto,
  InterestAnalysisDto,
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
  GetDataHealthRequest,
  GetMilestonesRequest,
  GetDebtOutlookRequest,
  GetInterestAnalysisRequest,
  GetRefinanceAnalysisRequest,
  RefinanceAnalysisDto,
  AcceptCurrentBalanceRequest,
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
  SetDataLocationsRequest,
  ChooseDataFolderRequest,
  ChooseBackupFileRequest,
  ImportBackupFileRequest,
  ArchiveIncomeRecordRequest,
  CreateIncomeRecordRequest,
  IncomeRecordDto,
  ListIncomeRecordsRequest,
  UpdateIncomeRecordRequest,
} from './debt-contracts';

export interface DebtBridge {
  listDebts(
    request: ListDebtsRequest,
  ): Promise<ApplicationResult<readonly DebtSummaryDto[]>>;
  getDashboard(request: GetDashboardRequest): Promise<ApplicationResult<DashboardDto>>;
  getDataHealth?(
    request: GetDataHealthRequest,
  ): Promise<ApplicationResult<DataHealthDto>>;
  getMilestones?(
    request: GetMilestonesRequest,
  ): Promise<ApplicationResult<MilestonesDto>>;
  getDebtOutlook?(
    request: GetDebtOutlookRequest,
  ): Promise<ApplicationResult<DebtOutlookDto>>;
  getInterestAnalysis?(
    request: GetInterestAnalysisRequest,
  ): Promise<ApplicationResult<InterestAnalysisDto>>;
  getRefinanceAnalysis?(
    request: GetRefinanceAnalysisRequest,
  ): Promise<ApplicationResult<RefinanceAnalysisDto>>;
  acceptCurrentBalance?(
    request: AcceptCurrentBalanceRequest,
  ): Promise<ApplicationResult<DebtDetailDto>>;
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
  chooseDataFolder?(
    request: ChooseDataFolderRequest,
  ): Promise<ApplicationResult<string | null>>;
  chooseBackupFile?(
    request: ChooseBackupFileRequest,
  ): Promise<ApplicationResult<string | null>>;
  setDataLocations?(
    request: SetDataLocationsRequest,
  ): Promise<ApplicationResult<DataManagementStatusDto>>;
  openBackupFolder?(
    request: Record<string, never>,
  ): Promise<ApplicationResult<boolean>>;
  importBackupFile?(
    request: ImportBackupFileRequest,
  ): Promise<ApplicationResult<DataManagementStatusDto>>;
  getDebtReports(
    request: GetDebtReportsRequest,
  ): Promise<ApplicationResult<DebtReportsDto>>;
  listIncomeRecords(
    request: ListIncomeRecordsRequest,
  ): Promise<ApplicationResult<readonly IncomeRecordDto[]>>;
  createIncomeRecord(
    request: CreateIncomeRecordRequest,
  ): Promise<ApplicationResult<IncomeRecordDto>>;
  updateIncomeRecord(
    request: UpdateIncomeRecordRequest,
  ): Promise<ApplicationResult<IncomeRecordDto>>;
  archiveIncomeRecord(
    request: ArchiveIncomeRecordRequest,
  ): Promise<ApplicationResult<IncomeRecordDto>>;
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
  createDebtTransfer(
    request: CreateDebtTransferRequest,
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
  readonly bridgeVersion: 27;
  readonly appMetadata: AppMetadataDto;
}
