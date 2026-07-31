import { useEffect, useRef, useState } from 'react';
import type { AppBridge } from '../../shared/app-bridge';
import type {
  CreateBalanceReconciliationRequest,
  CreateDebtTransactionRequest,
  EditDebtTransactionRequest,
  AddDebtTermRequest,
  ApplicationError,
  ApplicationResult,
  ArchiveDebtRequest,
  ArchivePayoffScenarioRequest,
  CreateDebtRequest,
  CreatePayoffScenarioRequest,
  DashboardDto,
  BalanceReconciliationDto,
  DataManagementStatusDto,
  DebtReportsDto,
  DebtDetailDto,
  DebtSummaryDto,
  DebtTransactionDto,
  GetDebtReportsRequest,
  ImportBatchDto,
  ImportBatchSummaryDto,
  ImportPostingPreviewDto,
  ImportPostingResultDto,
  PayoffScenarioDto,
  UpdateDebtRequest,
  ReverseDebtTransactionRequest,
  VoidBalanceReconciliationRequest,
  VoidDebtTransactionRequest,
} from '../../shared/debt-contracts';
import { AddTermForm } from './components/add-term-form';
import { AdvancedReports } from './components/advanced-reports';
import { RecordBalanceReconciliationForm } from './components/record-balance-reconciliation-form';
import { ConfirmationDialog } from './components/confirmation-dialog';
import { CreateDebtForm } from './components/create-debt-form';
import { Dashboard } from './components/dashboard';
import { DataManagement } from './components/data-management';
import { DebtDetail } from './components/debt-detail';
import { DebtList } from './components/debt-list';
import { combinedDebtLabel } from './components/debt-label';
import { EditDebtForm } from './components/edit-debt-form';
import { EscrowDetail } from './components/escrow-detail';
import { formatLastChanged } from './components/display-format';
import { PayoffScenarios } from './components/payoff-scenarios';
import { RecordTransactionForm } from './components/record-transaction-form';
import { WorkbookImport } from './components/workbook-import';

type View =
  | 'dashboard'
  | 'list'
  | 'create'
  | 'detail'
  | 'edit'
  | 'add-term'
  | 'import'
  | 'payoff'
  | 'reports'
  | 'escrow-detail'
  | 'data-management';
type DetailPanel = 'overview' | 'transaction' | 'transaction-edit' | 'reconciliation';
type Confirmation =
  'archive' | 'restore' | 'reverse' | 'void-transaction' | 'void-reconciliation' | null;
type ReverseTarget = {
  readonly id: string;
  readonly expectedUpdatedAtUtc: string;
  readonly reversalDate: string;
} | null;
type VoidTransactionTarget = {
  readonly id: string;
  readonly expectedUpdatedAtUtc: string;
  readonly voidDate: string;
} | null;

const invokeBridge = async <T,>(
  operation: () => Promise<ApplicationResult<T>>,
): Promise<ApplicationResult<T>> => {
  try {
    return await operation();
  } catch {
    return {
      ok: false,
      error: {
        code: 'internal',
        message: 'The secure application bridge did not return a valid response.',
      },
    };
  }
};

const navigationButtonClassName = (active: boolean): string =>
  active
    ? 'w-full rounded-md bg-slate-200 px-3 py-2 text-left text-sm font-semibold text-slate-900 hover:bg-slate-300'
    : 'w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-200';

export interface AppProps {
  readonly bridge?: AppBridge;
}

const ErrorNotice = ({
  error,
  onRetry,
}: {
  readonly error: ApplicationError;
  readonly onRetry?: () => void;
}): React.JSX.Element => (
  <div
    className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950"
    role="alert"
  >
    <p className="font-semibold">Debt Tracker could not complete the request.</p>
    <p className="mt-1">{error.message}</p>
    {onRetry ? (
      <button className="mt-3 font-semibold underline" onClick={onRetry} type="button">
        Try again
      </button>
    ) : null}
  </div>
);

export const App = ({ bridge = window.debtTracker }: AppProps): React.JSX.Element => {
  const [view, setView] = useState<View>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardDto | null>(null);
  const [reports, setReports] = useState<DebtReportsDto | null>(null);
  const [dataManagementStatus, setDataManagementStatus] =
    useState<DataManagementStatusDto | null>(null);
  const [importBatches, setImportBatches] = useState<readonly ImportBatchSummaryDto[]>(
    [],
  );
  const [selectedImportBatch, setSelectedImportBatch] = useState<ImportBatchDto | null>(
    null,
  );
  const [importPostingPreview, setImportPostingPreview] =
    useState<ImportPostingPreviewDto | null>(null);
  const [importPostingResult, setImportPostingResult] =
    useState<ImportPostingResultDto | null>(null);
  const [payoffScenarios, setPayoffScenarios] = useState<readonly PayoffScenarioDto[]>(
    [],
  );
  const [debts, setDebts] = useState<readonly DebtSummaryDto[]>([]);
  const [escrowDebts, setEscrowDebts] = useState<readonly DebtDetailDto[]>([]);
  const [selectedDebt, setSelectedDebt] = useState<DebtDetailDto | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [detailPanel, setDetailPanel] = useState<DetailPanel>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApplicationError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Readonly<Record<string, readonly string[]>> | undefined
  >();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [reverseTarget, setReverseTarget] = useState<ReverseTarget>(null);
  const [voidTransactionTarget, setVoidTransactionTarget] =
    useState<VoidTransactionTarget>(null);
  const [transactionEditTarget, setTransactionEditTarget] =
    useState<DebtTransactionDto | null>(null);
  const [reconciliationTarget, setReconciliationTarget] =
    useState<BalanceReconciliationDto | null>(null);
  const detailFocusRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (view !== 'detail' || !selectedDebt) return;
    const requestKey = `${selectedDebt.id}:${detailPanel}:${transactionEditTarget?.id ?? ''}`;
    if (detailFocusRequestRef.current === requestKey) return;
    detailFocusRequestRef.current = requestKey;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const target =
      detailPanel === 'transaction-edit'
        ? document.getElementById('transaction.transactionDate')
        : detailPanel === 'overview'
          ? document.getElementById('debt-detail-heading')
          : null;
    if (target instanceof HTMLElement) {
      target.scrollIntoView?.({ block: 'start' });
      target.focus({ preventScroll: true });
    }
  }, [detailPanel, selectedDebt, transactionEditTarget, view]);

  const loadDebts = async (includeArchivedValue = includeArchived): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.listDebts({ includeArchived: includeArchivedValue }),
    );

    if (result.ok) {
      setDebts(result.value);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const loadDashboard = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() => bridge.getDashboard({}));

    if (result.ok) {
      setDashboard(result.value);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const loadEscrowDetail = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const dashboardResult = await invokeBridge(() => bridge.getDashboard({}));
    const debtsResult = await invokeBridge(() =>
      bridge.listDebts({ includeArchived: false }),
    );

    if (!dashboardResult.ok) {
      setError(dashboardResult.error);
      setLoading(false);
      return;
    }

    if (!debtsResult.ok) {
      setError(debtsResult.error);
      setLoading(false);
      return;
    }

    setDashboard(dashboardResult.value);
    const escrowDebtIds = new Set(
      dashboardResult.value.escrowBalances.map((escrowBalance) => escrowBalance.debtId),
    );
    const debtIds = [
      ...new Set(
        debtsResult.value
          .filter((debt) => debt.debtType === 'mortgage' || escrowDebtIds.has(debt.id))
          .map((debt) => debt.id),
      ),
    ];
    const detailResults = await Promise.all(
      debtIds.map((debtId) => invokeBridge(() => bridge.getDebt({ id: debtId }))),
    );
    const failed = detailResults.find((result) => !result.ok);

    if (failed && !failed.ok) {
      setError(failed.error);
      setLoading(false);
      return;
    }

    setEscrowDebts(
      detailResults
        .filter(
          (result): result is { readonly ok: true; readonly value: DebtDetailDto } =>
            result.ok,
        )
        .map((result) => result.value),
    );
    setLoading(false);
  };

  const loadReports = async (
    request: GetDebtReportsRequest = {
      startDate: null,
      endDate: null,
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    },
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() => bridge.getDebtReports(request));

    if (result.ok) {
      setReports(result.value);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const loadDataManagementStatus = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() => bridge.getDataManagementStatus({}));

    if (result.ok) {
      setDataManagementStatus(result.value);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const loadImportBatches = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() => bridge.listImportBatches());

    if (result.ok) {
      setImportBatches(result.value);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const loadPayoffScenarios = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.listPayoffScenarios({ includeArchived: false }),
    );

    if (result.ok) {
      setPayoffScenarios(result.value);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const loadImportBatch = async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() => bridge.getImportBatch({ id }));

    if (result.ok) {
      setSelectedImportBatch(result.value);
      const preview = await invokeBridge(() =>
        bridge.previewImportBatchPosting({ batchId: id }),
      );
      if (preview.ok) {
        setImportPostingPreview(preview.value);
      } else {
        setError(preview.error);
      }
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  useEffect(() => {
    let active = true;

    void invokeBridge(() => bridge.getDashboard({})).then((result) => {
      if (!active) return;

      if (result.ok) {
        setDashboard(result.value);
        setError(null);
      } else {
        setError(result.error);
      }

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [bridge]);

  const showDashboard = (): void => {
    setView('dashboard');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setConfirmation(null);
    setReverseTarget(null);
    setError(null);
    setFieldErrors(undefined);
    void loadDashboard();
  };

  const showEscrowDetail = (): void => {
    setView('escrow-detail');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setConfirmation(null);
    setReverseTarget(null);
    setError(null);
    setFieldErrors(undefined);
    void loadEscrowDetail();
  };

  const showList = (): void => {
    setView('list');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setConfirmation(null);
    setReverseTarget(null);
    setError(null);
    setFieldErrors(undefined);
    void loadDebts();
  };

  const showImports = (): void => {
    setView('import');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setConfirmation(null);
    setReverseTarget(null);
    setError(null);
    setFieldErrors(undefined);
    setImportPostingResult(null);
    void loadImportBatches();
  };

  const showPayoffScenarios = (): void => {
    setView('payoff');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setConfirmation(null);
    setReverseTarget(null);
    setError(null);
    setFieldErrors(undefined);
    void loadPayoffScenarios();
  };

  const showReports = (): void => {
    setView('reports');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setConfirmation(null);
    setReverseTarget(null);
    setError(null);
    setFieldErrors(undefined);
    void loadReports();
  };

  const showDataManagement = (): void => {
    setView('data-management');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setConfirmation(null);
    setReverseTarget(null);
    setError(null);
    setFieldErrors(undefined);
    void loadDataManagementStatus();
  };

  const selectWorkbookForImport = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() => bridge.selectWorkbookForImport({}));

    if (result.ok) {
      if (result.value) {
        const selectedBatch = result.value;
        setSelectedImportBatch(selectedBatch);
        const preview = await invokeBridge(() =>
          bridge.previewImportBatchPosting({ batchId: selectedBatch.id }),
        );
        if (preview.ok) setImportPostingPreview(preview.value);
        setImportPostingResult(null);
        setSuccessMessage('Workbook rows were staged for review.');
      }
      await loadImportBatches();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const reviewImportMapping = async (
    mapping: ImportBatchDto['sheetMappings'][number],
    reviewStatus: 'approved' | 'rejected' | 'deferred',
  ): Promise<void> => {
    if (!selectedImportBatch) return;

    setSaving(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.updateImportSheetMapping({
        batchId: selectedImportBatch.id,
        mappingId: mapping.id,
        proposedRecordType: mapping.proposedRecordType,
        reviewStatus,
        fieldMapping: mapping.fieldMapping,
        notes: mapping.notes,
      }),
    );

    if (result.ok) {
      setSelectedImportBatch(result.value);
      const preview = await invokeBridge(() =>
        bridge.previewImportBatchPosting({ batchId: selectedImportBatch.id }),
      );
      if (preview.ok) setImportPostingPreview(preview.value);
      setSuccessMessage('Sheet mapping review was saved.');
      await loadImportBatches();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const reviewImportRow = async (
    row: ImportBatchDto['stagedRows'][number],
    reviewStatus: 'approved' | 'rejected' | 'deferred',
  ): Promise<void> => {
    if (!selectedImportBatch) return;

    setSaving(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.updateStagedImportRowReview({
        batchId: selectedImportBatch.id,
        rowId: row.id,
        proposedRecordType: row.proposedRecordType,
        activityClassification: row.activityClassification,
        reviewStatus,
        normalizedValues: row.normalizedValues,
        reviewNotes: row.reviewNotes,
      }),
    );

    if (result.ok) {
      setSelectedImportBatch(result.value);
      const preview = await invokeBridge(() =>
        bridge.previewImportBatchPosting({ batchId: selectedImportBatch.id }),
      );
      if (preview.ok) setImportPostingPreview(preview.value);
      setSuccessMessage('Staged row review was saved.');
      await loadImportBatches();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const postSelectedImportBatch = async (): Promise<void> => {
    if (!selectedImportBatch) return;

    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() =>
      bridge.postImportBatch({ batchId: selectedImportBatch.id, confirmed: true }),
    );

    if (result.ok) {
      setImportPostingResult(result.value);
      setImportPostingPreview(result.value);
      await loadImportBatch(selectedImportBatch.id);
      await loadImportBatches();
      await loadDebts();
      await loadDashboard();
      setSuccessMessage('Approved workbook rows were posted transactionally.');
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const createPayoffScenario = async (
    request: CreatePayoffScenarioRequest,
  ): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() => bridge.createPayoffScenario(request));

    if (result.ok) {
      setSuccessMessage('Payoff scenario was saved.');
      await loadPayoffScenarios();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const rerunPayoffScenario = async (scenario: PayoffScenarioDto): Promise<void> => {
    setSaving(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.rerunPayoffScenario({ id: scenario.id }),
    );

    if (result.ok) {
      setSuccessMessage('Payoff scenario was rerun.');
      await loadPayoffScenarios();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const archivePayoffScenario = async (scenario: PayoffScenarioDto): Promise<void> => {
    const request: ArchivePayoffScenarioRequest = {
      id: scenario.id,
      expectedUpdatedAtUtc: scenario.updatedAtUtc,
      confirmed: true,
    };

    setSaving(true);
    setError(null);
    const result = await invokeBridge(() => bridge.archivePayoffScenario(request));

    if (result.ok) {
      setSuccessMessage('Payoff scenario was archived.');
      await loadPayoffScenarios();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const createManualBackup = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    const result = await invokeBridge(() => bridge.createManualBackup({}));

    if (result.ok) {
      setDataManagementStatus(result.value);
      setSuccessMessage('Database backup was created and validated.');
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const exportData = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.exportData({ format: 'csv', includeReports: true }),
    );

    if (result.ok) {
      if (result.value.status === 'succeeded') {
        setSuccessMessage(`Export completed with ${result.value.fileCount} CSV files.`);
      } else {
        setSuccessMessage('Export was cancelled.');
      }
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const restoreBackup = async (backupId: string): Promise<void> => {
    const confirmed = window.confirm(
      'Restore this validated backup? Debt Tracker will create a safety backup first and replace the current local database.',
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.restoreBackup({ backupId, confirmed: true }),
    );

    if (result.ok) {
      setDataManagementStatus(result.value);
      setSuccessMessage('Database restore completed from a validated backup.');
      await loadDashboard();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const selectDebt = async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    const result = await invokeBridge(() => bridge.getDebt({ id }));

    if (result.ok) {
      setSelectedDebt(result.value);
      setView('detail');
      setDetailPanel('overview');
      setReverseTarget(null);
      setDashboard(null);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const handleFailure = (applicationError: ApplicationError): void => {
    setError(applicationError);
    setFieldErrors(applicationError.fieldErrors);
  };

  const createDebt = async (request: CreateDebtRequest): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() => bridge.createDebt(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Debt and initial effective-dated terms were created.');
      setView('detail');
      setDetailPanel('overview');
      setReverseTarget(null);
      await loadDashboard();
      await loadDebts();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const updateDebt = async (request: UpdateDebtRequest): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() => bridge.updateDebt(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Debt details were updated.');
      setView('detail');
      setDetailPanel('overview');
      await loadDebts();
      await loadDashboard();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const addDebtTerm = async (request: AddDebtTermRequest): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() => bridge.addDebtTerm(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('A new effective-dated term period was added.');
      setView('detail');
      setDetailPanel('overview');
      await loadDebts();
      await loadDashboard();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const recordTransaction = async (
    request: CreateDebtTransactionRequest,
  ): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() => bridge.createDebtTransaction(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Posted transaction was recorded.');
      setDetailPanel('overview');
      await loadDebts();
      await loadDashboard();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const editTransaction = async (
    request: CreateDebtTransactionRequest,
  ): Promise<void> => {
    if (!transactionEditTarget) return;

    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const editRequest: EditDebtTransactionRequest = {
      ...request,
      id: transactionEditTarget.id,
      expectedUpdatedAtUtc: transactionEditTarget.updatedAtUtc,
    };
    const result = await invokeBridge(() => bridge.editDebtTransaction(editRequest));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Transaction edit was saved.');
      setDetailPanel('overview');
      setTransactionEditTarget(null);
      await loadDebts();
      await loadDashboard();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const recordEscrowActivity = async (
    request: CreateDebtTransactionRequest,
  ): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() => bridge.createDebtTransaction(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Escrow activity was recorded.');
      await loadDebts();
      await loadDashboard();
      await loadEscrowDetail();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const recordReconciliation = async (
    request: CreateBalanceReconciliationRequest,
  ): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() =>
      bridge.createBalanceReconciliation(request),
    );

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Balance reconciliation was recorded.');
      setDetailPanel('overview');
      setReconciliationTarget(null);
      await loadDebts();
      await loadDashboard();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const requestReverseTransaction = (
    transactionId: string,
    expectedUpdatedAtUtc: string,
    defaultReversalDate: string,
  ): void => {
    setReverseTarget({
      id: transactionId,
      expectedUpdatedAtUtc,
      reversalDate: defaultReversalDate,
    });
    setConfirmation('reverse');
    setError(null);
    setFieldErrors(undefined);
  };

  const reverseTransaction = async (): Promise<void> => {
    if (!reverseTarget) return;

    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const request: ReverseDebtTransactionRequest = {
      id: reverseTarget.id,
      expectedUpdatedAtUtc: reverseTarget.expectedUpdatedAtUtc,
      reversalDate: reverseTarget.reversalDate,
      confirmed: true,
    };
    const result = await invokeBridge(() => bridge.reverseDebtTransaction(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Transaction was reversed.');
      setDetailPanel('overview');
      setReverseTarget(null);
      await loadDebts();
      await loadDashboard();
    } else {
      handleFailure(result.error);
    }

    setConfirmation(null);
    setSaving(false);
  };

  const requestVoidTransaction = (
    transactionId: string,
    expectedUpdatedAtUtc: string,
    defaultVoidDate: string,
  ): void => {
    setVoidTransactionTarget({
      id: transactionId,
      expectedUpdatedAtUtc,
      voidDate: defaultVoidDate,
    });
    setConfirmation('void-transaction');
    setError(null);
    setFieldErrors(undefined);
  };

  const voidTransaction = async (): Promise<void> => {
    if (!voidTransactionTarget) return;

    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const request: VoidDebtTransactionRequest = {
      id: voidTransactionTarget.id,
      expectedUpdatedAtUtc: voidTransactionTarget.expectedUpdatedAtUtc,
      voidDate: voidTransactionTarget.voidDate,
      confirmed: true,
    };
    const result = await invokeBridge(() => bridge.voidDebtTransaction(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Transaction was voided.');
      setDetailPanel('overview');
      setVoidTransactionTarget(null);
      await loadDebts();
      await loadDashboard();
      await loadEscrowDetail();
    } else {
      handleFailure(result.error);
    }

    setConfirmation(null);
    setSaving(false);
  };

  const requestCorrectReconciliation = (
    reconciliation: BalanceReconciliationDto,
  ): void => {
    setReconciliationTarget(reconciliation);
    setDetailPanel('reconciliation');
    setError(null);
    setFieldErrors(undefined);
  };

  const requestVoidReconciliation = (
    reconciliation: BalanceReconciliationDto,
  ): void => {
    setReconciliationTarget(reconciliation);
    setConfirmation('void-reconciliation');
    setError(null);
    setFieldErrors(undefined);
  };

  const voidReconciliation = async (): Promise<void> => {
    if (!reconciliationTarget) return;

    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const request: VoidBalanceReconciliationRequest = {
      id: reconciliationTarget.id,
      expectedUpdatedAtUtc: reconciliationTarget.updatedAtUtc,
      confirmed: true,
    };
    const result = await invokeBridge(() => bridge.voidBalanceReconciliation(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Balance reconciliation was voided.');
      setDetailPanel('overview');
      setReconciliationTarget(null);
      await loadDashboard();
    } else {
      handleFailure(result.error);
    }

    setConfirmation(null);
    setSaving(false);
  };

  const changeArchiveState = async (): Promise<void> => {
    if (!confirmation) return;

    if (confirmation === 'reverse') {
      await reverseTransaction();
      return;
    }

    if (confirmation === 'void-transaction') {
      await voidTransaction();
      return;
    }

    if (confirmation === 'void-reconciliation') {
      await voidReconciliation();
      return;
    }

    if (!selectedDebt) return;

    setSaving(true);
    setError(null);
    const request: ArchiveDebtRequest = {
      id: selectedDebt.id,
      expectedUpdatedAtUtc: selectedDebt.updatedAtUtc,
      confirmed: true,
    };
    const result =
      confirmation === 'archive'
        ? await invokeBridge(() => bridge.archiveDebt(request))
        : await invokeBridge(() => bridge.restoreDebt(request));

    if (result.ok) {
      const wasArchived = confirmation === 'archive';
      setSuccessMessage(wasArchived ? 'Debt was archived.' : 'Debt was restored.');
      setSelectedDebt(wasArchived ? null : result.value);
      setView(wasArchived ? 'list' : 'detail');
      setDetailPanel('overview');
      setReverseTarget(null);
      await loadDebts();
    } else {
      handleFailure(result.error);
    }

    setConfirmation(null);
    setSaving(false);
  };

  const pageTitle =
    view === 'create'
      ? 'Create debt'
      : view === 'edit'
        ? 'Edit debt'
        : view === 'add-term'
          ? 'Add effective-dated term'
          : null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Debt Tracker</h1>
          <span className="text-sm text-slate-500">Local desktop application</span>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-65px)] max-w-[1500px] grid-cols-[210px_minmax(0,1fr)]">
        <nav
          aria-label="Primary navigation"
          className="border-r border-slate-200 bg-slate-50 px-4 py-7"
        >
          <p className="px-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">
            Navigation
          </p>
          <ul className="mt-3">
            <li>
              <button
                aria-current={view === 'dashboard' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'dashboard')}
                onClick={showDashboard}
                type="button"
              >
                Dashboard
              </button>
            </li>
            <li className="mt-1">
              <button
                aria-current={view === 'list' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'list')}
                onClick={showList}
                type="button"
              >
                Debts
              </button>
            </li>
            <li className="mt-1">
              <button
                aria-current={view === 'import' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'import')}
                onClick={showImports}
                type="button"
              >
                Workbook import
              </button>
            </li>
            <li className="mt-1">
              <button
                aria-current={view === 'payoff' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'payoff')}
                onClick={showPayoffScenarios}
                type="button"
              >
                Payoff scenarios
              </button>
            </li>
            <li className="mt-1">
              <button
                aria-current={view === 'reports' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'reports')}
                onClick={showReports}
                type="button"
              >
                Reports
              </button>
            </li>
            <li className="mt-1">
              <button
                aria-current={view === 'data-management' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'data-management')}
                onClick={showDataManagement}
                type="button"
              >
                Data management
              </button>
            </li>
          </ul>
          <div className="mt-8 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
            <p>Version {bridge.appMetadata.version}</p>
            <p>
              Last changed: {formatLastChanged(bridge.appMetadata.lastChangedAtUtc)}
            </p>
          </div>
        </nav>

        <main className="min-w-0 p-6 lg:p-8">
          {successMessage ? (
            <div
              className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950"
              role="status"
            >
              <span>{successMessage}</span>
              <button
                aria-label="Dismiss success message"
                className="font-semibold"
                onClick={() => setSuccessMessage(null)}
                type="button"
              >
                ×
              </button>
            </div>
          ) : null}

          {error ? (
            <div className="mb-6">
              <ErrorNotice
                error={error}
                onRetry={
                  view === 'list'
                    ? () => void loadDebts()
                    : view === 'dashboard'
                      ? () => void loadDashboard()
                      : view === 'import'
                        ? () => void loadImportBatches()
                        : view === 'payoff'
                          ? () => void loadPayoffScenarios()
                          : view === 'reports'
                            ? () => void loadReports()
                            : view === 'data-management'
                              ? () => void loadDataManagementStatus()
                              : view === 'escrow-detail'
                                ? () => void loadEscrowDetail()
                                : undefined
                }
              />
            </div>
          ) : null}

          {loading && view === 'list' ? (
            <section
              aria-label="Loading debts"
              className="rounded-xl border border-slate-200 bg-white p-10"
            >
              <p className="text-sm font-medium text-slate-600">Loading debts…</p>
            </section>
          ) : null}

          {loading && view === 'dashboard' ? (
            <section
              aria-label="Loading dashboard"
              className="rounded-xl border border-slate-200 bg-white p-10"
            >
              <p className="text-sm font-medium text-slate-600">Loading dashboard…</p>
            </section>
          ) : null}

          {!loading && view === 'dashboard' && dashboard ? (
            <Dashboard
              dashboard={dashboard}
              onSelectDebt={(id) => void selectDebt(id)}
              onShowDebts={showList}
              onShowEscrowDetail={showEscrowDetail}
            />
          ) : null}

          {view === 'escrow-detail' && dashboard ? (
            <EscrowDetail
              debts={escrowDebts}
              effectiveDate={dashboard.effectiveDate}
              fieldErrors={fieldErrors}
              loading={loading}
              onBackToDashboard={showDashboard}
              onRecordEscrowActivity={(request) => void recordEscrowActivity(request)}
              onSelectDebt={(id) => void selectDebt(id)}
              saving={saving}
            />
          ) : null}

          {!loading && view === 'list' ? (
            <DebtList
              debts={debts}
              includeArchived={includeArchived}
              onCreate={() => {
                setError(null);
                setFieldErrors(undefined);
                setSuccessMessage(null);
                setView('create');
              }}
              onIncludeArchivedChange={(nextValue) => {
                setLoading(true);
                setError(null);
                setIncludeArchived(nextValue);
                void loadDebts(nextValue);
              }}
              onSelect={(id) => void selectDebt(id)}
            />
          ) : null}

          {view === 'import' ? (
            <WorkbookImport
              batches={importBatches}
              loading={loading}
              onReviewMapping={(mapping, reviewStatus) =>
                void reviewImportMapping(mapping, reviewStatus)
              }
              onReviewRow={(row, reviewStatus) =>
                void reviewImportRow(row, reviewStatus)
              }
              onPostBatch={() => void postSelectedImportBatch()}
              onSelectBatch={(id) => void loadImportBatch(id)}
              onSelectWorkbook={() => void selectWorkbookForImport()}
              postingPreview={importPostingPreview}
              postingResult={importPostingResult}
              saving={saving}
              selectedBatch={selectedImportBatch}
            />
          ) : null}

          {view === 'payoff' ? (
            <PayoffScenarios
              error={error}
              fieldErrors={fieldErrors}
              loading={loading}
              onArchive={(scenario) => void archivePayoffScenario(scenario)}
              onCreate={(request) => void createPayoffScenario(request)}
              onRerun={(scenario) => void rerunPayoffScenario(scenario)}
              saving={saving}
              scenarios={payoffScenarios}
            />
          ) : null}

          {view === 'reports' ? (
            <AdvancedReports
              loading={loading}
              onApplyFilters={(request) => void loadReports(request)}
              onSelectDebt={(id) => void selectDebt(id)}
              reports={reports}
            />
          ) : null}

          {view === 'data-management' ? (
            <DataManagement
              loading={loading}
              onBackup={() => void createManualBackup()}
              onExport={() => void exportData()}
              onRefresh={() => void loadDataManagementStatus()}
              onRestore={(backupId) => void restoreBackup(backupId)}
              restoring={saving}
              status={dataManagementStatus}
            />
          ) : null}

          {view === 'create' ? (
            <section
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
              aria-labelledby="workflow-heading"
            >
              <p className="text-sm font-medium text-slate-500">Debt maintenance</p>
              <h2
                className="mt-1 text-3xl font-semibold tracking-tight"
                id="workflow-heading"
              >
                {pageTitle}
              </h2>
              <div className="mt-8">
                <CreateDebtForm
                  busy={saving}
                  fieldErrors={fieldErrors}
                  onCancel={showList}
                  onSubmit={(request) => void createDebt(request)}
                />
              </div>
            </section>
          ) : null}

          {view === 'detail' && selectedDebt ? (
            <div className="space-y-6">
              {detailPanel === 'transaction' ? (
                <section
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
                  aria-labelledby="transaction-workflow-heading"
                >
                  <p className="text-sm font-medium text-slate-500">
                    {combinedDebtLabel(selectedDebt)}
                  </p>
                  <h2
                    className="mt-1 text-3xl font-semibold tracking-tight"
                    id="transaction-workflow-heading"
                  >
                    Record transaction
                  </h2>
                  <div className="mt-8">
                    <RecordTransactionForm
                      busy={saving}
                      debt={selectedDebt}
                      fieldErrors={fieldErrors}
                      onCancel={() => {
                        setDetailPanel('overview');
                        setError(null);
                        setFieldErrors(undefined);
                      }}
                      onSubmit={(request) => void recordTransaction(request)}
                    />
                  </div>
                </section>
              ) : null}

              {detailPanel === 'transaction-edit' && transactionEditTarget ? (
                <section
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
                  aria-labelledby="transaction-edit-workflow-heading"
                >
                  <p className="text-sm font-medium text-slate-500">
                    {combinedDebtLabel(selectedDebt)}
                  </p>
                  <h2
                    className="mt-1 text-2xl font-semibold text-slate-950"
                    id="transaction-edit-workflow-heading"
                  >
                    Edit transaction
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Debt Tracker preserves the original posted transaction, records an
                    offsetting reversal, and creates a linked corrected replacement.
                  </p>
                  <div className="mt-8">
                    <RecordTransactionForm
                      busy={saving}
                      debt={selectedDebt}
                      fieldErrors={fieldErrors}
                      initialTransaction={transactionEditTarget}
                      onCancel={() => {
                        setDetailPanel('overview');
                        setTransactionEditTarget(null);
                        setError(null);
                        setFieldErrors(undefined);
                      }}
                      onSubmit={(request) => void editTransaction(request)}
                      submitLabel="Save transaction edit"
                    />
                  </div>
                </section>
              ) : null}

              {detailPanel === 'reconciliation' ? (
                <section
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
                  aria-labelledby="reconciliation-workflow-heading"
                >
                  <p className="text-sm font-medium text-slate-500">
                    {combinedDebtLabel(selectedDebt)}
                  </p>
                  <h2
                    className="mt-1 text-3xl font-semibold tracking-tight"
                    id="reconciliation-workflow-heading"
                  >
                    Reconcile balance
                  </h2>
                  <div className="mt-8">
                    <RecordBalanceReconciliationForm
                      busy={saving}
                      debt={selectedDebt}
                      fieldErrors={fieldErrors}
                      supersedesReconciliation={reconciliationTarget}
                      onCancel={() => {
                        setDetailPanel('overview');
                        setReconciliationTarget(null);
                        setError(null);
                        setFieldErrors(undefined);
                      }}
                      onSubmit={(request) => void recordReconciliation(request)}
                    />
                  </div>
                </section>
              ) : null}

              <DebtDetail
                debt={selectedDebt}
                onAddTerm={() => {
                  setError(null);
                  setFieldErrors(undefined);
                  setDetailPanel('overview');
                  setView('add-term');
                }}
                onArchiveOrRestore={() =>
                  setConfirmation(selectedDebt.archivedAtUtc ? 'restore' : 'archive')
                }
                onBack={showList}
                onCorrectReconciliation={requestCorrectReconciliation}
                onEdit={() => {
                  setError(null);
                  setFieldErrors(undefined);
                  setDetailPanel('overview');
                  setView('edit');
                }}
                onRecordReconciliation={() => {
                  setError(null);
                  setFieldErrors(undefined);
                  setSuccessMessage(null);
                  setReconciliationTarget(null);
                  setDetailPanel('reconciliation');
                }}
                onRecordTransaction={() => {
                  setError(null);
                  setFieldErrors(undefined);
                  setSuccessMessage(null);
                  setTransactionEditTarget(null);
                  setDetailPanel('transaction');
                }}
                onEditTransaction={(transaction) => {
                  setError(null);
                  setFieldErrors(undefined);
                  setSuccessMessage(null);
                  setTransactionEditTarget(transaction);
                  setDetailPanel('transaction-edit');
                }}
                onReverseTransaction={requestReverseTransaction}
                onVoidTransaction={requestVoidTransaction}
                onVoidReconciliation={requestVoidReconciliation}
              />
            </div>
          ) : null}

          {view === 'edit' && selectedDebt ? (
            <section
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
              aria-labelledby="workflow-heading"
            >
              <p className="text-sm font-medium text-slate-500">
                {combinedDebtLabel(selectedDebt)}
              </p>
              <h2
                className="mt-1 text-3xl font-semibold tracking-tight"
                id="workflow-heading"
              >
                {pageTitle}
              </h2>
              <div className="mt-8">
                <EditDebtForm
                  busy={saving}
                  debt={selectedDebt}
                  fieldErrors={fieldErrors}
                  onCancel={() => setView('detail')}
                  onSubmit={(request) => void updateDebt(request)}
                />
              </div>
            </section>
          ) : null}

          {view === 'add-term' && selectedDebt ? (
            <section
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
              aria-labelledby="workflow-heading"
            >
              <p className="text-sm font-medium text-slate-500">
                {combinedDebtLabel(selectedDebt)}
              </p>
              <h2
                className="mt-1 text-3xl font-semibold tracking-tight"
                id="workflow-heading"
              >
                {pageTitle}
              </h2>
              <div className="mt-8">
                <AddTermForm
                  busy={saving}
                  debt={selectedDebt}
                  fieldErrors={fieldErrors}
                  onCancel={() => setView('detail')}
                  onSubmit={(request) => void addDebtTerm(request)}
                />
              </div>
            </section>
          ) : null}
        </main>
      </div>

      {confirmation &&
      ((confirmation === 'reverse' && reverseTarget) ||
        (confirmation === 'void-transaction' && voidTransactionTarget) ||
        (confirmation === 'void-reconciliation' && reconciliationTarget) ||
        (confirmation !== 'reverse' &&
          confirmation !== 'void-transaction' &&
          confirmation !== 'void-reconciliation' &&
          selectedDebt)) ? (
        <ConfirmationDialog
          busy={saving}
          confirmLabel={
            confirmation === 'archive'
              ? 'Archive debt'
              : confirmation === 'restore'
                ? 'Restore debt'
                : confirmation === 'void-reconciliation'
                  ? 'Void reconciliation'
                  : confirmation === 'void-transaction'
                    ? 'Void transaction'
                    : 'Reverse transaction'
          }
          description={
            confirmation === 'archive'
              ? 'This removes the debt from the default list while preserving its terms, audit history, and all related records.'
              : confirmation === 'restore'
                ? 'This returns the debt to the default list while preserving all historical records.'
                : confirmation === 'void-reconciliation'
                  ? 'This preserves the original reconciliation for history but removes it from current exception reporting.'
                  : confirmation === 'void-transaction'
                    ? 'This removes the transaction from current balances and reports by creating a linked offset. The original remains in audit history.'
                    : 'This posts a reversal transaction and preserves the original posted activity. Use the financial date when the reversal should affect balances and YTD activity.'
          }
          onCancel={() => {
            setConfirmation(null);
            setReverseTarget(null);
            setVoidTransactionTarget(null);
            setReconciliationTarget(null);
          }}
          onConfirm={() => void changeArchiveState()}
          title={
            confirmation === 'archive'
              ? 'Archive this debt?'
              : confirmation === 'restore'
                ? 'Restore this debt?'
                : confirmation === 'void-reconciliation'
                  ? 'Void this reconciliation?'
                  : confirmation === 'void-transaction'
                    ? 'Void this transaction?'
                    : 'Reverse this transaction?'
          }
        >
          {confirmation === 'reverse' && reverseTarget ? (
            <label
              className="block text-sm font-medium text-slate-700"
              htmlFor="reversal-date"
            >
              Reversal date
              <input
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:ring-blue-600"
                id="reversal-date"
                name="reversalDate"
                onChange={(event) =>
                  setReverseTarget({
                    ...reverseTarget,
                    reversalDate: event.target.value,
                  })
                }
                type="date"
                value={reverseTarget.reversalDate}
              />
            </label>
          ) : null}
          {confirmation === 'void-transaction' && voidTransactionTarget ? (
            <label
              className="block text-sm font-medium text-slate-700"
              htmlFor="void-date"
            >
              Void date
              <input
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:ring-blue-600"
                id="void-date"
                name="voidDate"
                onChange={(event) =>
                  setVoidTransactionTarget({
                    ...voidTransactionTarget,
                    voidDate: event.target.value,
                  })
                }
                type="date"
                value={voidTransactionTarget.voidDate}
              />
            </label>
          ) : null}
        </ConfirmationDialog>
      ) : null}
    </div>
  );
};
