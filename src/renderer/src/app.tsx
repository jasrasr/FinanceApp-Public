import { useEffect, useState } from 'react';
import type { DebtBridge } from '../../shared/app-bridge';
import type {
  CreateBalanceSnapshotRequest,
  CreateDebtTransactionRequest,
  AddDebtTermRequest,
  ApplicationError,
  ApplicationResult,
  ArchiveDebtRequest,
  CreateDebtRequest,
  DebtDetailDto,
  DebtSummaryDto,
  UpdateDebtRequest,
  ReverseDebtTransactionRequest,
} from '../../shared/debt-contracts';
import { AddTermForm } from './components/add-term-form';
import { RecordBalanceSnapshotForm } from './components/record-balance-snapshot-form';
import { ConfirmationDialog } from './components/confirmation-dialog';
import { CreateDebtForm } from './components/create-debt-form';
import { DebtDetail } from './components/debt-detail';
import { DebtList } from './components/debt-list';
import { EditDebtForm } from './components/edit-debt-form';
import { RecordTransactionForm } from './components/record-transaction-form';

type View = 'list' | 'create' | 'detail' | 'edit' | 'add-term';
type DetailPanel = 'overview' | 'transaction' | 'snapshot';
type Confirmation = 'archive' | 'restore' | 'reverse' | null;
type ReverseTarget = {
  readonly id: string;
  readonly expectedUpdatedAtUtc: string;
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

export interface AppProps {
  readonly bridge?: DebtBridge;
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
  const [view, setView] = useState<View>('list');
  const [debts, setDebts] = useState<readonly DebtSummaryDto[]>([]);
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

  const loadDebts = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await invokeBridge(() => bridge.listDebts({ includeArchived }));

    if (result.ok) {
      setDebts(result.value);
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  useEffect(() => {
    let active = true;

    void invokeBridge(() => bridge.listDebts({ includeArchived })).then((result) => {
      if (!active) return;

      if (result.ok) {
        setDebts(result.value);
        setError(null);
      } else {
        setError(result.error);
      }

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [bridge, includeArchived]);

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
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const recordSnapshot = async (
    request: CreateBalanceSnapshotRequest,
  ): Promise<void> => {
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);
    const result = await invokeBridge(() => bridge.createBalanceSnapshot(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Confirmed balance snapshot was recorded.');
      setDetailPanel('overview');
      await loadDebts();
    } else {
      handleFailure(result.error);
    }

    setSaving(false);
  };

  const requestReverseTransaction = (
    transactionId: string,
    expectedUpdatedAtUtc: string,
  ): void => {
    setReverseTarget({ id: transactionId, expectedUpdatedAtUtc });
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
      confirmed: true,
    };
    const result = await invokeBridge(() => bridge.reverseDebtTransaction(request));

    if (result.ok) {
      setSelectedDebt(result.value);
      setSuccessMessage('Transaction was reversed.');
      setDetailPanel('overview');
      setReverseTarget(null);
      await loadDebts();
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
                aria-current={view === 'list' ? 'page' : undefined}
                className="w-full rounded-md bg-slate-200 px-3 py-2 text-left text-sm font-semibold text-slate-900 hover:bg-slate-300"
                onClick={showList}
                type="button"
              >
                Debts
              </button>
            </li>
          </ul>
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
                onRetry={view === 'list' ? () => void loadDebts() : undefined}
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
              }}
              onSelect={(id) => void selectDebt(id)}
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
                    {selectedDebt.name}
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

              {detailPanel === 'snapshot' ? (
                <section
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
                  aria-labelledby="snapshot-workflow-heading"
                >
                  <p className="text-sm font-medium text-slate-500">
                    {selectedDebt.name}
                  </p>
                  <h2
                    className="mt-1 text-3xl font-semibold tracking-tight"
                    id="snapshot-workflow-heading"
                  >
                    Record balance snapshot
                  </h2>
                  <div className="mt-8">
                    <RecordBalanceSnapshotForm
                      busy={saving}
                      debt={selectedDebt}
                      fieldErrors={fieldErrors}
                      onCancel={() => {
                        setDetailPanel('overview');
                        setError(null);
                        setFieldErrors(undefined);
                      }}
                      onSubmit={(request) => void recordSnapshot(request)}
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
                onEdit={() => {
                  setError(null);
                  setFieldErrors(undefined);
                  setDetailPanel('overview');
                  setView('edit');
                }}
                onRecordSnapshot={() => {
                  setError(null);
                  setFieldErrors(undefined);
                  setSuccessMessage(null);
                  setDetailPanel('snapshot');
                }}
                onRecordTransaction={() => {
                  setError(null);
                  setFieldErrors(undefined);
                  setSuccessMessage(null);
                  setDetailPanel('transaction');
                }}
                onReverseTransaction={requestReverseTransaction}
              />
            </div>
          ) : null}

          {view === 'edit' && selectedDebt ? (
            <section
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
              aria-labelledby="workflow-heading"
            >
              <p className="text-sm font-medium text-slate-500">{selectedDebt.name}</p>
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
              <p className="text-sm font-medium text-slate-500">{selectedDebt.name}</p>
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
        (confirmation !== 'reverse' && selectedDebt)) ? (
        <ConfirmationDialog
          busy={saving}
          confirmLabel={
            confirmation === 'archive'
              ? 'Archive debt'
              : confirmation === 'restore'
                ? 'Restore debt'
                : 'Reverse transaction'
          }
          description={
            confirmation === 'archive'
              ? 'This removes the debt from the default list while preserving its terms, audit history, and all related records.'
              : confirmation === 'restore'
                ? 'This returns the debt to the default list while preserving all historical records.'
                : 'This posts a reversal transaction and preserves the original posted activity.'
          }
          onCancel={() => {
            setConfirmation(null);
            setReverseTarget(null);
          }}
          onConfirm={() => void changeArchiveState()}
          title={
            confirmation === 'archive'
              ? 'Archive this debt?'
              : confirmation === 'restore'
                ? 'Restore this debt?'
                : 'Reverse this transaction?'
          }
        />
      ) : null}
    </div>
  );
};
