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
  DataHealthDto,
  DebtOutlookDto,
  InterestAnalysisDto,
  MilestonesDto,
  BalanceReconciliationDto,
  DataManagementStatusDto,
  DebtReportsDto,
  DebtDetailDto,
  DebtSummaryDto,
  DebtTransactionDto,
  GetDebtReportsRequest,
  GetInterestAnalysisRequest,
  PayoffScenarioDto,
  PayoffBaselineDto,
  RecordRefinanceRequest,
  UpdateDebtRequest,
  ReverseDebtTransactionRequest,
  VoidBalanceReconciliationRequest,
  VoidDebtTransactionRequest,
  ConfirmScheduledPaymentRequest,
  RemoveScheduledPaymentConfirmationRequest,
  RenamePayoffScenarioRequest,
  ExtraCashAllocationRequest,
  ExtraCashAllocationResponse,
} from '../../shared/debt-contracts';
import { AddTermForm } from './components/add-term-form';
import { AdvancedReports } from './components/advanced-reports';
import { RecordBalanceReconciliationForm } from './components/record-balance-reconciliation-form';
import { ConfirmationDialog } from './components/confirmation-dialog';
import { CreateDebtForm } from './components/create-debt-form';
import { Dashboard } from './components/dashboard';
import { DataManagement } from './components/data-management';
import { DataHealth } from './components/data-health';
import { Milestones } from './components/milestones';
import { DebtOutlook } from './components/debt-outlook';
import { InterestAnalysis } from './components/interest-analysis';
import { DebtDetail } from './components/debt-detail';
import { DebtList } from './components/debt-list';
import { combinedDebtLabel } from './components/debt-label';
import { EditDebtForm } from './components/edit-debt-form';
import { EscrowDetail } from './components/escrow-detail';
import { formatLastChanged, formatTimestamp } from './components/display-format';
import { PayoffScenarios } from './components/payoff-scenarios';
import { ExtraCashAllocation } from './components/extra-cash-allocation';
import { RecordRefinanceForm } from './components/record-refinance-form';
import { RecordTransactionForm } from './components/record-transaction-form';
import {
  defaultReportSessionState,
  type ReportSessionState,
} from './components/report-session-state';

type View =
  | 'dashboard'
  | 'list'
  | 'create'
  | 'detail'
  | 'edit'
  | 'add-term'
  | 'payoff'
  | 'allocation'
  | 'reports'
  | 'escrow-detail'
  | 'data-management'
  | 'data-health'
  | 'milestones'
  | 'debt-outlook'
  | 'interest-analysis';
type DetailPanel =
  'overview' | 'transaction' | 'transaction-edit' | 'reconciliation' | 'refinance';
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
type PermanentDeletionConfirmation = {
  readonly debt: DebtDetailDto;
  readonly typedName: string;
  readonly secondConfirmed: boolean;
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

const permanentDeletionCountLabels: Record<
  keyof DebtDetailDto['permanentDeletionPreview'],
  string
> = {
  debtTerms: 'Debt terms',
  transactions: 'Transactions',
  allocations: 'Allocations',
  balanceSnapshots: 'Balance snapshots',
  reconciliations: 'Reconciliations',
  auditEvents: 'Audit events',
  importProvenance: 'Import provenance',
  payoffScenarioReferences: 'Payoff-scenario references',
  otherRelatedRecords: 'Other related records',
};

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
  const [reportState, setReportState] = useState<ReportSessionState>(
    defaultReportSessionState,
  );
  const [dataManagementStatus, setDataManagementStatus] =
    useState<DataManagementStatusDto | null>(null);
  const [dataHealth, setDataHealth] = useState<DataHealthDto | null>(null);
  const [milestones, setMilestones] = useState<MilestonesDto | null>(null);
  const [debtOutlook, setDebtOutlook] = useState<DebtOutlookDto | null>(null);
  const [interestAnalysis, setInterestAnalysis] = useState<InterestAnalysisDto | null>(
    null,
  );
  const [interestAnalysisFilters, setInterestAnalysisFilters] =
    useState<GetInterestAnalysisRequest>({
      debtType: null,
      segment: 'all',
    });
  const [selectedMilestoneScenarioId, setSelectedMilestoneScenarioId] = useState<
    string | null
  >(null);
  const [selectedDebtOutlookScenarioId, setSelectedDebtOutlookScenarioId] = useState<
    string | null
  >(null);
  const [payoffScenarios, setPayoffScenarios] = useState<readonly PayoffScenarioDto[]>(
    [],
  );
  const [payoffBaseline, setPayoffBaseline] = useState<PayoffBaselineDto | null>(null);
  const [allocationResult, setAllocationResult] =
    useState<ExtraCashAllocationResponse | null>(null);
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
  const [permanentDeletionConfirmation, setPermanentDeletionConfirmation] =
    useState<PermanentDeletionConfirmation>(null);
  const detailFocusRequestRef = useRef<string | null>(null);
  const suppressNavigationPushRef = useRef(false);

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
    const availableDebtIds = new Set(debts.map((debt) => debt.id));
    const safeRequest =
      request.debtId && debts.length > 0 && !availableDebtIds.has(request.debtId)
        ? { ...request, debtId: null }
        : request;
    if (safeRequest.debtId !== request.debtId) {
      setReportState((current) => ({ ...current, debtId: null }));
    }
    const result = await invokeBridge(() => bridge.getDebtReports(safeRequest));

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

  const loadDataHealth = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() => bridge.getDataHealth!({}));
    if (result.ok) setDataHealth(result.value);
    else setError(result.error);
    setLoading(false);
  };

  const loadMilestones = async (
    scenarioId = selectedMilestoneScenarioId,
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    const scenariosResult = await invokeBridge(() =>
      bridge.listPayoffScenarios({ includeArchived: false }),
    );
    const milestoneResult = await invokeBridge(() =>
      bridge.getMilestones!({ scenarioId }),
    );
    if (scenariosResult.ok) setPayoffScenarios(scenariosResult.value);
    else setError(scenariosResult.error);
    if (milestoneResult.ok) setMilestones(milestoneResult.value);
    else setError(milestoneResult.error);
    setLoading(false);
  };

  const loadDebtOutlook = async (
    scenarioId = selectedDebtOutlookScenarioId,
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    const scenariosResult = await invokeBridge(() =>
      bridge.listPayoffScenarios({ includeArchived: false }),
    );
    const outlookResult = await invokeBridge(() =>
      bridge.getDebtOutlook!({ scenarioId }),
    );
    if (scenariosResult.ok) setPayoffScenarios(scenariosResult.value);
    else setError(scenariosResult.error);
    if (outlookResult.ok) setDebtOutlook(outlookResult.value);
    else setError(outlookResult.error);
    setLoading(false);
  };

  const loadInterestAnalysis = async (
    filters = interestAnalysisFilters,
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.getInterestAnalysis!({ ...filters }),
    );
    if (result.ok) setInterestAnalysis(result.value);
    else setError(result.error);
    setLoading(false);
  };

  const acceptCurrentBalance = async (debtId: string): Promise<void> => {
    setSaving(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.acceptCurrentBalance!({ debtId, confirmed: true }),
    );
    if (result.ok) {
      setSuccessMessage('Current application balance accepted for control purposes.');
      await loadDataHealth();
    } else {
      handleFailure(result.error);
    }
    setSaving(false);
  };

  const loadPayoffScenarios = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.listPayoffScenarios({ includeArchived: false }),
    );

    if (result.ok) {
      setPayoffScenarios(result.value);
      const baselineResult = await invokeBridge(() =>
        bridge.calculatePayoffBaseline({
          scenarioStartDate:
            result.value[0]?.scenarioStartDate ?? new Date().toISOString().slice(0, 10),
          maxProjectionMonths: Math.max(
            360,
            ...result.value.map((scenario) => scenario.maxProjectionMonths),
          ),
        }),
      );
      if (baselineResult.ok) {
        setPayoffBaseline(baselineResult.value);
      } else {
        setPayoffBaseline(null);
        setError(baselineResult.error);
      }
    } else {
      setError(result.error);
      setPayoffBaseline(null);
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
    if (!suppressNavigationPushRef.current) {
      window.history.pushState(
        {
          app: 'debt-tracker',
          index: (window.history.state?.index ?? 0) + 1,
          view: 'dashboard',
        },
        '',
        '#dashboard',
      );
    }
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
    if (!suppressNavigationPushRef.current) {
      window.history.pushState(
        {
          app: 'debt-tracker',
          index: (window.history.state?.index ?? 0) + 1,
          view: 'list',
        },
        '',
        '#debts',
      );
    }
    setView('list');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setConfirmation(null);
    setReverseTarget(null);
    setError(null);
    setFieldErrors(undefined);
    void loadDebts();
  };

  const showPayoffScenarios = (): void => {
    if (!suppressNavigationPushRef.current) {
      window.history.pushState(
        {
          app: 'debt-tracker',
          index: (window.history.state?.index ?? 0) + 1,
          view: 'payoff',
        },
        '',
        '#payoff',
      );
    }
    setView('payoff');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setConfirmation(null);
    setReverseTarget(null);
    setError(null);
    setFieldErrors(undefined);
    if (debts.length === 0) {
      void invokeBridge(() => bridge.listDebts({ includeArchived: false })).then(
        (result) => {
          if (result.ok) setDebts(result.value);
        },
      );
    }
    void loadPayoffScenarios();
  };

  const showAllocation = (): void => {
    setView('allocation');
    setSelectedDebt(null);
    setError(null);
    setFieldErrors(undefined);
    if (debts.length === 0)
      void invokeBridge(() => bridge.listDebts({ includeArchived: false })).then(
        (result) => {
          if (result.ok) setDebts(result.value);
        },
      );
  };

  const calculateAllocation = async (
    request: ExtraCashAllocationRequest,
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.calculateExtraCashAllocation(request),
    );
    if (result.ok) setAllocationResult(result.value);
    else setError(result.error);
    setLoading(false);
  };

  const showReports = (): void => {
    if (!suppressNavigationPushRef.current) {
      window.history.pushState(
        {
          app: 'debt-tracker',
          index: (window.history.state?.index ?? 0) + 1,
          view: 'reports',
        },
        '',
        '#reports',
      );
    }
    setView('reports');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setConfirmation(null);
    setReverseTarget(null);
    setError(null);
    setFieldErrors(undefined);
    if (debts.length === 0) {
      void invokeBridge(() => bridge.listDebts({ includeArchived: false })).then(
        (result) => {
          if (result.ok) setDebts(result.value);
        },
      );
    }
    if (!reports) {
      void loadReports();
    }
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

  const showDataHealth = (): void => {
    setView('data-health');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setError(null);
    setFieldErrors(undefined);
    void loadDataHealth();
  };

  const showMilestones = (): void => {
    if (!suppressNavigationPushRef.current) {
      window.history.pushState(
        {
          app: 'debt-tracker',
          index: (window.history.state?.index ?? 0) + 1,
          view: 'milestones',
        },
        '',
        '#milestones',
      );
    }
    setView('milestones');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setError(null);
    setFieldErrors(undefined);
    void loadMilestones();
  };

  const showDebtOutlook = (): void => {
    if (!suppressNavigationPushRef.current) {
      window.history.pushState(
        {
          app: 'debt-tracker',
          index: (window.history.state?.index ?? 0) + 1,
          view: 'debt-outlook',
        },
        '',
        '#debt-outlook',
      );
    }
    setView('debt-outlook');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setError(null);
    setFieldErrors(undefined);
    void loadDebtOutlook();
  };

  const showInterestAnalysis = (): void => {
    if (!suppressNavigationPushRef.current) {
      window.history.pushState(
        {
          app: 'debt-tracker',
          index: (window.history.state?.index ?? 0) + 1,
          view: 'interest-analysis',
        },
        '',
        '#interest-analysis',
      );
    }
    setView('interest-analysis');
    setSelectedDebt(null);
    setDetailPanel('overview');
    setError(null);
    setFieldErrors(undefined);
    void loadInterestAnalysis();
  };

  const selectMilestoneScenario = (scenarioId: string | null): void => {
    setSelectedMilestoneScenarioId(scenarioId);
    void loadMilestones(scenarioId);
  };

  const selectDebtOutlookScenario = (scenarioId: string | null): void => {
    setSelectedDebtOutlookScenarioId(scenarioId);
    void loadDebtOutlook(scenarioId);
  };

  const selectInterestAnalysisFilters = (filters: GetInterestAnalysisRequest): void => {
    setInterestAnalysisFilters(filters);
    void loadInterestAnalysis(filters);
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

  const renamePayoffScenario = async (
    request: RenamePayoffScenarioRequest,
  ): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() => bridge.renamePayoffScenario(request));
    if (result.ok) {
      setSuccessMessage('Payoff scenario was renamed.');
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

  const chooseDataFolder = async (kind: 'backup' | 'export'): Promise<void> => {
    if (!dataManagementStatus) return;
    const chosen = await invokeBridge(() => bridge.chooseDataFolder!({ kind }));
    if (!chosen.ok || !chosen.value) return;
    const selectedPath = chosen.value;
    const moveExistingBackups =
      kind === 'backup' &&
      window.confirm(
        'Move existing backups to the new folder after each copy is validated? Choose Cancel to use the new location only.',
      );
    const result = await invokeBridge(() =>
      bridge.setDataLocations!({
        backupDirectory:
          kind === 'backup'
            ? selectedPath
            : dataManagementStatus.backupDirectoryDisplayPath,
        exportDirectory:
          kind === 'export'
            ? selectedPath
            : (dataManagementStatus.exportDirectoryDisplayPath ??
              dataManagementStatus.backupDirectoryDisplayPath),
        moveExistingBackups,
      }),
    );
    if (result.ok) {
      setDataManagementStatus(result.value);
      setSuccessMessage('Data locations were updated.');
    } else handleFailure(result.error);
  };

  const importBackupFile = async (): Promise<void> => {
    const chosen = await invokeBridge(() => bridge.chooseBackupFile!({}));
    if (!chosen.ok || !chosen.value) return;
    const result = await invokeBridge(() =>
      bridge.importBackupFile!({ sourcePath: chosen.value! }),
    );
    if (result.ok) {
      setDataManagementStatus(result.value);
      setSuccessMessage('Backup was validated and added for restore.');
    } else handleFailure(result.error);
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

  const deleteBackup = async (backupId: string): Promise<void> => {
    const backup = dataManagementStatus?.availableBackups.find(
      (candidate) => candidate.id === backupId,
    );
    const confirmed = window.confirm(
      `Delete this ${backup ? backup.kind.replaceAll('_', ' ') : 'selected'} backup created ${backup ? formatTimestamp(backup.createdAtUtc) : 'at the recorded time'}?`,
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    const result = await invokeBridge(() =>
      bridge.deleteBackup({ backupId, confirmed: true }),
    );

    if (result.ok) {
      setDataManagementStatus(result.value);
      setSuccessMessage('Backup was deleted.');
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
      if (!suppressNavigationPushRef.current) {
        window.history.pushState(
          {
            app: 'debt-tracker',
            index: (window.history.state?.index ?? 0) + 1,
            view: 'detail',
            debtId: id,
          },
          '',
          '#detail',
        );
      }
      setDetailPanel('overview');
      setReverseTarget(null);
      setDashboard(null);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  useEffect(() => {
    const onPopState = (event: PopStateEvent): void => {
      const state = event.state as {
        app?: string;
        index?: number;
        view?: View;
        debtId?: string;
      } | null;
      suppressNavigationPushRef.current = true;
      if (state?.app !== 'debt-tracker') {
        window.history.replaceState(
          { app: 'debt-tracker', index: 0, view: 'dashboard' },
          '',
          '#dashboard',
        );
        setSelectedDebt(null);
        setDetailPanel('overview');
        setView('dashboard');
        void loadDashboard();
        suppressNavigationPushRef.current = false;
        return;
      }
      if (state?.view === 'detail' && state.debtId) {
        void selectDebt(state.debtId).finally(() => {
          suppressNavigationPushRef.current = false;
        });
        return;
      }
      const nextView = state?.view ?? 'dashboard';
      setSelectedDebt(null);
      setDetailPanel('overview');
      setView(nextView);
      if (nextView === 'dashboard') void loadDashboard();
      if (nextView === 'list') void loadDebts();
      if (nextView === 'reports' && !reports) void loadReports();
      if (nextView === 'milestones') void loadMilestones();
      if (nextView === 'debt-outlook') void loadDebtOutlook();
      if (nextView === 'interest-analysis') void loadInterestAnalysis();
      suppressNavigationPushRef.current = false;
    };
    if (window.history.state?.app !== 'debt-tracker') {
      window.history.replaceState(
        { app: 'debt-tracker', index: 0, view: 'dashboard' },
        '',
        '#dashboard',
      );
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // The navigation listener intentionally captures the current data loaders;
    // route changes recreate it without changing application behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, reports]);

  const navigateBack = (): void => {
    if (
      window.history.state?.app === 'debt-tracker' &&
      (window.history.state?.index ?? 0) > 0
    ) {
      window.history.back();
      return;
    }

    suppressNavigationPushRef.current = true;
    showList();
    suppressNavigationPushRef.current = false;
  };

  const confirmScheduledPayment = async (): Promise<void> => {
    if (!selectedDebt?.paymentSchedule.dueDate) return;
    const reason = window.prompt(
      'Enter one reason: historical_payment_not_entered, lender_treated_prior_payment_as_satisfying, starting_schedule_after_historical_data, or other.',
    );
    if (!reason) return;
    const result = await invokeBridge(() =>
      bridge.confirmScheduledPayment({
        debtId: selectedDebt.id,
        dueDate: selectedDebt.paymentSchedule.dueDate!,
        reason: reason as ConfirmScheduledPaymentRequest['reason'],
        confirmed: true,
      }),
    );
    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Due date was confirmed for scheduling only.');
      await loadDashboard();
    } else handleFailure(result.error);
  };

  const removeScheduledPaymentConfirmation = async (): Promise<void> => {
    const confirmation = selectedDebt?.paymentSchedule.manualConfirmation;
    if (!selectedDebt || !confirmation) return;
    if (!window.confirm('Remove this manual scheduling confirmation?')) return;
    const request: RemoveScheduledPaymentConfirmationRequest = {
      debtId: selectedDebt.id,
      dueDate: confirmation.dueDate,
      confirmed: true,
    };
    const result = await invokeBridge(() =>
      bridge.removeScheduledPaymentConfirmation(request),
    );
    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Scheduling confirmation was removed.');
      await loadDashboard();
    } else handleFailure(result.error);
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

  const deleteDebtPermanently = async (): Promise<void> => {
    if (!permanentDeletionConfirmation || saving) return;
    const { debt, secondConfirmed, typedName } = permanentDeletionConfirmation;

    if (typedName.trim() !== debt.name) {
      setError({
        code: 'validation',
        message: 'Debt name confirmation did not match.',
      });
      return;
    }
    if (!secondConfirmed) {
      setError({
        code: 'validation',
        message:
          'Confirm that this action cannot be undone except by restoring a backup.',
      });
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() =>
      bridge.deleteDebtPermanently({
        id: debt.id,
        expectedUpdatedAtUtc: debt.updatedAtUtc,
        typedDebtName: typedName.trim(),
        confirmed: true,
        secondConfirmed: true,
      }),
    );

    if (result.ok) {
      setSelectedDebt(null);
      setPermanentDeletionConfirmation(null);
      setSuccessMessage(
        `Debt was permanently deleted after validated backup ${result.value.backupId}.`,
      );
      setView('list');
      setDetailPanel('overview');
      await loadDebts();
      await loadDashboard();
      await loadReports();
      await loadEscrowDetail();
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

  const recordRefinance = async (request: RecordRefinanceRequest): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() => bridge.recordRefinance(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Refinance was recorded on this debt.');
      setDetailPanel('overview');
      await loadDebts();
      await loadDashboard();
      await loadReports();
      await loadEscrowDetail();
      await loadPayoffScenarios();
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
                aria-current={view === 'milestones' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'milestones')}
                onClick={showMilestones}
                type="button"
              >
                Milestones
              </button>
            </li>
            <li className="mt-1">
              <button
                aria-current={view === 'debt-outlook' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'debt-outlook')}
                onClick={showDebtOutlook}
                type="button"
              >
                Debt outlook
              </button>
            </li>
            <li className="mt-1">
              <button
                aria-current={view === 'interest-analysis' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'interest-analysis')}
                onClick={showInterestAnalysis}
                type="button"
              >
                Interest analysis
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
                aria-current={view === 'allocation' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'allocation')}
                onClick={showAllocation}
                type="button"
              >
                Extra-cash allocation
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
                aria-current={view === 'data-health' ? 'page' : undefined}
                className={navigationButtonClassName(view === 'data-health')}
                onClick={showDataHealth}
                type="button"
              >
                Data health
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
                      : view === 'payoff'
                        ? () => void loadPayoffScenarios()
                        : view === 'reports'
                          ? () => void loadReports()
                          : view === 'data-management'
                            ? () => void loadDataManagementStatus()
                            : view === 'data-health'
                              ? () => void loadDataHealth()
                              : view === 'milestones'
                                ? () => void loadMilestones()
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

          {view === 'payoff' ? (
            <PayoffScenarios
              baseline={payoffBaseline}
              debts={debts}
              error={error}
              fieldErrors={fieldErrors}
              loading={loading}
              onArchive={(scenario) => void archivePayoffScenario(scenario)}
              onCreate={(request) => void createPayoffScenario(request)}
              onRerun={(scenario) => void rerunPayoffScenario(scenario)}
              onRename={(request) => void renamePayoffScenario(request)}
              saving={saving}
              scenarios={payoffScenarios}
            />
          ) : null}

          {view === 'allocation' ? (
            <ExtraCashAllocation
              debts={debts}
              error={error?.message ?? null}
              loading={loading}
              onCalculate={(request) => void calculateAllocation(request)}
              onSave={(request) => void createPayoffScenario(request)}
              result={allocationResult}
            />
          ) : null}

          {view === 'reports' ? (
            <AdvancedReports
              debts={debts}
              loading={loading}
              onApplyFilters={(request) => void loadReports(request)}
              onSelectDebt={(id) => void selectDebt(id)}
              onStateChange={setReportState}
              reports={reports}
              state={reportState}
            />
          ) : null}

          {view === 'data-management' ? (
            <DataManagement
              loading={loading}
              onBackup={() => void createManualBackup()}
              onDelete={(backupId) => void deleteBackup(backupId)}
              onExport={() => void exportData()}
              onRefresh={() => void loadDataManagementStatus()}
              onRestore={(backupId) => void restoreBackup(backupId)}
              onChooseFolder={(kind) => void chooseDataFolder(kind)}
              onChooseBackupFile={() => void importBackupFile()}
              onImportBackupFile={() => void importBackupFile()}
              onOpenBackupFolder={() => void bridge.openBackupFolder?.({})}
              restoring={saving}
              status={dataManagementStatus}
            />
          ) : null}

          {!loading && view === 'data-health' && dataHealth ? (
            <DataHealth
              health={dataHealth}
              onAcceptCurrentBalance={(id) => void acceptCurrentBalance(id)}
              onSelectDebt={(id) => void selectDebt(id)}
            />
          ) : null}

          {!loading && view === 'milestones' && milestones ? (
            <Milestones
              milestones={milestones}
              onScenarioChange={selectMilestoneScenario}
              onSelectDebt={(id) => void selectDebt(id)}
              scenarios={payoffScenarios}
              selectedScenarioId={selectedMilestoneScenarioId}
            />
          ) : null}

          {!loading && view === 'debt-outlook' && debtOutlook ? (
            <DebtOutlook
              onScenarioChange={selectDebtOutlookScenario}
              onSelectDebt={(id) => void selectDebt(id)}
              outlook={debtOutlook}
              scenarios={payoffScenarios}
              selectedScenarioId={selectedDebtOutlookScenarioId}
            />
          ) : null}

          {!loading && view === 'interest-analysis' && interestAnalysis ? (
            <InterestAnalysis
              analysis={interestAnalysis}
              onFiltersChange={selectInterestAnalysisFilters}
              onSelectDebt={(id) => void selectDebt(id)}
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

              {detailPanel === 'refinance' ? (
                <section
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
                  aria-labelledby="refinance-workflow-heading"
                >
                  <p className="text-sm font-medium text-slate-500">
                    {combinedDebtLabel(selectedDebt)}
                  </p>
                  <h2
                    className="mt-1 text-3xl font-semibold tracking-tight"
                    id="refinance-workflow-heading"
                  >
                    Record refinance
                  </h2>
                  <div className="mt-8">
                    <RecordRefinanceForm
                      busy={saving}
                      debt={selectedDebt}
                      fieldErrors={fieldErrors}
                      onCancel={() => {
                        setDetailPanel('overview');
                        setError(null);
                        setFieldErrors(undefined);
                      }}
                      onSubmit={(request) => void recordRefinance(request)}
                    />
                  </div>
                </section>
              ) : null}

              <DebtDetail
                busy={saving}
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
                onBack={navigateBack}
                onCorrectReconciliation={requestCorrectReconciliation}
                onConfirmScheduledPayment={() => void confirmScheduledPayment()}
                onDeletePermanently={() => {
                  setError(null);
                  setFieldErrors(undefined);
                  setSuccessMessage(null);
                  setPermanentDeletionConfirmation({
                    debt: selectedDebt,
                    typedName: '',
                    secondConfirmed: false,
                  });
                }}
                onEdit={() => {
                  setError(null);
                  setFieldErrors(undefined);
                  setDetailPanel('overview');
                  setView('edit');
                }}
                onRecordRefinance={() => {
                  setError(null);
                  setFieldErrors(undefined);
                  setSuccessMessage(null);
                  setDetailPanel('refinance');
                }}
                onRemoveScheduledPaymentConfirmation={() =>
                  void removeScheduledPaymentConfirmation()
                }
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

      {permanentDeletionConfirmation ? (
        <ConfirmationDialog
          busy={saving}
          confirmLabel="Delete debt permanently"
          description="Debt Tracker will create and validate a backup immediately before deleting this debt and its dependent records."
          onCancel={() => {
            if (saving) return;
            setPermanentDeletionConfirmation(null);
            setError(null);
          }}
          onConfirm={() => void deleteDebtPermanently()}
          title="Delete debt permanently?"
        >
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-semibold text-slate-900">
                {permanentDeletionConfirmation.debt.name}
              </p>
              <p className="text-slate-600">
                This action cannot be undone except by restoring the required validated
                backup.
              </p>
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-950">
              <p className="font-semibold">Required immediate backup status</p>
              <p className="mt-1">
                Not started. A validated backup will be created before deletion begins.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                Related records that will be deleted
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-3">
                {Object.entries(
                  permanentDeletionConfirmation.debt.permanentDeletionPreview,
                ).map(([key, value]) => (
                  <div key={key} className="rounded-md border border-slate-200 p-2">
                    <dt className="text-xs font-semibold text-slate-500 uppercase">
                      {permanentDeletionCountLabels[
                        key as keyof DebtDetailDto['permanentDeletionPreview']
                      ] ?? key}
                    </dt>
                    <dd className="mt-1 font-mono text-slate-950">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <label
              className="block font-medium text-slate-700"
              htmlFor="permanent-delete-typed-name"
            >
              Type the debt name to confirm
              <input
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-red-600 focus:ring-red-600"
                disabled={saving}
                id="permanent-delete-typed-name"
                onChange={(event) =>
                  setPermanentDeletionConfirmation({
                    ...permanentDeletionConfirmation,
                    typedName: event.target.value,
                  })
                }
                value={permanentDeletionConfirmation.typedName}
              />
            </label>
            <label className="flex items-start gap-2 font-medium text-slate-700">
              <input
                checked={permanentDeletionConfirmation.secondConfirmed}
                className="mt-1"
                disabled={saving}
                onChange={(event) =>
                  setPermanentDeletionConfirmation({
                    ...permanentDeletionConfirmation,
                    secondConfirmed: event.target.checked,
                  })
                }
                type="checkbox"
              />
              <span>
                I understand this cannot be undone except by restoring the validated
                backup.
              </span>
            </label>
          </div>
        </ConfirmationDialog>
      ) : null}

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
