import type {
  ImportBatchDto,
  ImportBatchSummaryDto,
  ImportSheetMappingDto,
  StagedImportRowDto,
} from '../../../shared/debt-contracts';

const recordTypeLabels: Readonly<Record<string, string>> = {
  debt: 'Debt',
  transaction: 'Transaction',
  term: 'Debt term',
  balance_snapshot: 'Balance snapshot',
  unknown: 'Unknown',
};

const reviewStatusLabels: Readonly<Record<string, string>> = {
  needs_review: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
  deferred: 'Deferred',
};

const activityLabels: Readonly<Record<string, string>> = {
  actual: 'Actual',
  projected: 'Projected',
  ambiguous: 'Ambiguous',
};

const ReviewBadge = ({
  children,
}: {
  readonly children: string;
}): React.JSX.Element => (
  <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
    {children}
  </span>
);

export interface WorkbookImportProps {
  readonly batches: readonly ImportBatchSummaryDto[];
  readonly selectedBatch: ImportBatchDto | null;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly onSelectWorkbook: () => void;
  readonly onSelectBatch: (id: string) => void;
  readonly onReviewMapping: (
    mapping: ImportSheetMappingDto,
    reviewStatus: 'approved' | 'rejected' | 'deferred',
  ) => void;
  readonly onReviewRow: (
    row: StagedImportRowDto,
    reviewStatus: 'approved' | 'rejected' | 'deferred',
  ) => void;
}

export const WorkbookImport = ({
  batches,
  selectedBatch,
  loading,
  saving,
  onSelectWorkbook,
  onSelectBatch,
  onReviewMapping,
  onReviewRow,
}: WorkbookImportProps): React.JSX.Element => (
  <section className="space-y-6">
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Workbook import</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">
            Stage and map workbook rows
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Imported workbook rows are staged for review only. This workflow does not
            post debts, terms, transactions, balance snapshots, or reconciliations.
            Formulas are preserved as source metadata and are not translated into
            application calculation logic.
          </p>
        </div>
        <button
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={saving}
          onClick={onSelectWorkbook}
          type="button"
        >
          {saving ? 'Staging workbook…' : 'Select workbook'}
        </button>
      </div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[310px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold">Import batches</h3>
        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading import batches…</p>
        ) : batches.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-slate-600">
            No staged workbook imports yet. Select a workbook to create the first review
            batch.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {batches.map((batch) => (
              <li key={batch.id}>
                <button
                  className="w-full rounded-lg border border-slate-200 px-3 py-3 text-left text-sm hover:bg-slate-50"
                  onClick={() => onSelectBatch(batch.id)}
                  type="button"
                >
                  <span className="block font-semibold text-slate-900">
                    {batch.sourceWorkbookName}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Imported {batch.importedAtUtc}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {selectedBatch ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold">
                  {selectedBatch.sourceWorkbookName}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Staged {selectedBatch.importedAtUtc}. Workbook fingerprint is
                  preserved for duplicate review; the source file is not copied into the
                  repository.
                </p>
              </div>
              <ReviewBadge>{selectedBatch.status}</ReviewBadge>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs font-semibold text-slate-500 uppercase">
                  Staged rows
                </dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {selectedBatch.controlTotals.totalRows}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs font-semibold text-slate-500 uppercase">
                  Ambiguous rows
                </dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {selectedBatch.controlTotals.ambiguousRows}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs font-semibold text-slate-500 uppercase">
                  Invalid rows
                </dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {selectedBatch.controlTotals.invalidRows}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs font-semibold text-slate-500 uppercase">
                  Exceptions
                </dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {selectedBatch.controlTotals.reconciliationExceptionRows}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold">Sheet mapping review</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="py-2 pr-4">Sheet</th>
                    <th className="py-2 pr-4">Detected as</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Fields</th>
                    <th className="py-2 pr-4">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedBatch.sheetMappings.map((mapping) => (
                    <tr key={mapping.id}>
                      <td className="py-3 pr-4 font-medium">
                        {mapping.sourceSheetName}
                      </td>
                      <td className="py-3 pr-4">
                        {recordTypeLabels[mapping.proposedRecordType]}
                      </td>
                      <td className="py-3 pr-4">
                        {reviewStatusLabels[mapping.reviewStatus]}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {Object.keys(mapping.fieldMapping).slice(0, 6).join(', ') ||
                          'No fields detected'}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-2">
                          {(['approved', 'rejected', 'deferred'] as const).map(
                            (status) => (
                              <button
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={saving}
                                key={status}
                                onClick={() => onReviewMapping(mapping, status)}
                                type="button"
                              >
                                {reviewStatusLabels[status]}
                              </button>
                            ),
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold">Staged row review</h3>
            <p className="mt-2 text-sm text-slate-600">
              Source displayed values and formulas are preserved separately from
              normalized proposed values. Approval here is review-only and does not post
              activity.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="py-2 pr-4">Source</th>
                    <th className="py-2 pr-4">Detected as</th>
                    <th className="py-2 pr-4">Actual/projected</th>
                    <th className="py-2 pr-4">Values</th>
                    <th className="py-2 pr-4">Issues</th>
                    <th className="py-2 pr-4">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedBatch.stagedRows.slice(0, 100).map((row) => (
                    <tr key={row.id}>
                      <td className="py-3 pr-4 font-medium">
                        {row.sourceSheetName} row {row.sourceRowNumber}
                      </td>
                      <td className="py-3 pr-4">
                        {recordTypeLabels[row.proposedRecordType]}
                      </td>
                      <td className="py-3 pr-4">
                        {activityLabels[row.activityClassification]}
                      </td>
                      <td className="max-w-sm py-3 pr-4 text-slate-600">
                        {Object.entries(row.sourceDisplayedValues)
                          .slice(0, 4)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join('; ')}
                        {Object.keys(row.sourceFormulas).length > 0 ? (
                          <span className="block text-xs font-semibold text-slate-500">
                            Formula source preserved
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {[
                          ...row.validationMessages,
                          row.duplicateCandidate ? 'Duplicate candidate' : null,
                          row.reconciliationException,
                        ]
                          .filter(Boolean)
                          .join('; ') || 'No issues detected'}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-2">
                          {(['approved', 'rejected', 'deferred'] as const).map(
                            (status) => (
                              <button
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={
                                  saving ||
                                  (status === 'approved' &&
                                    row.activityClassification === 'ambiguous')
                                }
                                key={status}
                                onClick={() => onReviewRow(row, status)}
                                type="button"
                              >
                                {reviewStatusLabels[status]}
                              </button>
                            ),
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-10 shadow-sm">
          <h3 className="text-xl font-semibold">No import batch selected</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Select a staged batch or choose a workbook. Any workbook selected here is
            treated as untrusted input and staged for review before a future posting
            workflow can use it.
          </p>
        </section>
      )}
    </div>
  </section>
);
