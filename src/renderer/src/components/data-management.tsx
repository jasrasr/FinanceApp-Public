import type { DataManagementStatusDto } from '../../../shared/debt-contracts';
import { formatTimestamp } from './display-format';

export interface DataManagementProps {
  readonly loading: boolean;
  readonly restoring: boolean;
  readonly status: DataManagementStatusDto | null;
  readonly onBackup: () => void;
  readonly onExport: () => void;
  readonly onRefresh: () => void;
  readonly onRestore: (backupId: string) => void;
}

const statusLabel = (value: string): string => value.replaceAll('_', ' ');

export const DataManagement = ({
  loading,
  onBackup,
  onExport,
  onRefresh,
  onRestore,
  restoring,
  status,
}: DataManagementProps): React.JSX.Element => (
  <section aria-labelledby="data-management-heading" className="space-y-6">
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
      <p className="text-sm font-medium text-slate-500">Data management</p>
      <h2
        className="mt-1 text-3xl font-semibold tracking-tight"
        id="data-management-heading"
      >
        Backup, restore, and export
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
        Backups use SQLite-safe backup behavior and are validated before success is
        reported. Exports are written outside the repository and label actual,
        confirmed, calculated, and scenario values separately.
      </p>
    </div>

    {loading ? (
      <section className="rounded-xl border border-slate-200 bg-white p-10">
        <p className="text-sm font-medium text-slate-600">
          Loading data-management status…
        </p>
      </section>
    ) : null}

    {!loading && status ? (
      <>
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Backup directory
            </p>
            <p className="mt-2 break-all text-sm text-slate-700">
              {status.backupDirectoryDisplayPath}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Last successful backup
            </p>
            <p className="mt-2 text-sm text-slate-700">
              {status.lastSuccessfulBackupAtUtc
                ? formatTimestamp(status.lastSuccessfulBackupAtUtc)
                : 'No validated backup is available yet.'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Latest operation
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Backup: {statusLabel(status.lastBackup.status)}. Restore:{' '}
              {statusLabel(status.lastRestore.status)}.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Backup and export actions</h3>
              <p className="mt-1 text-sm text-slate-600">
                Restore requires selecting a validated backup below and explicit
                confirmation.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold"
                onClick={onRefresh}
                type="button"
              >
                Refresh
              </button>
              <button
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                onClick={onBackup}
                type="button"
              >
                Create backup
              </button>
              <button
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                onClick={onExport}
                type="button"
              >
                Export CSV files
              </button>
            </div>
          </div>
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p>{status.lastBackup.message}</p>
            <p>{status.lastRestore.message}</p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Available backups</h3>
          {status.availableBackups.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              No validated backups are available yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2">Backup file</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2 text-right">Size</th>
                    <th className="px-3 py-2">Integrity</th>
                    <th className="px-3 py-2">Restore</th>
                  </tr>
                </thead>
                <tbody>
                  {status.availableBackups.map((backup) => (
                    <tr className="border-t border-slate-100" key={backup.id}>
                      <td className="max-w-[22rem] break-all px-3 py-2 font-mono text-xs">
                        {backup.fileName}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {statusLabel(backup.kind)}
                      </td>
                      <td className="px-3 py-2">
                        {formatTimestamp(backup.createdAtUtc)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {backup.sizeBytes.toLocaleString()} bytes
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {statusLabel(backup.integrityStatus)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          className="font-semibold text-slate-900 underline disabled:text-slate-400"
                          disabled={backup.integrityStatus !== 'valid' || restoring}
                          onClick={() => onRestore(backup.id)}
                          type="button"
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    ) : null}
  </section>
);
