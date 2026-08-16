import { useState } from 'react';
import type {
  ArchiveIncomeRecordRequest,
  CreateIncomeRecordRequest,
  IncomeRecordDto,
  UpdateIncomeRecordRequest,
} from '../../../shared/debt-contracts';
import { formatDollarString } from './display-format';

export interface IncomeAssumptionsProps {
  readonly records: readonly IncomeRecordDto[];
  readonly loading: boolean;
  readonly onCreate: (request: CreateIncomeRecordRequest) => void;
  readonly onUpdate: (request: UpdateIncomeRecordRequest) => void;
  readonly onArchive: (request: ArchiveIncomeRecordRequest) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

export const IncomeAssumptions = ({
  records,
  loading,
  onCreate,
  onUpdate,
  onArchive,
}: IncomeAssumptionsProps): React.JSX.Element => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [grossMonthlyIncome, setGrossMonthlyIncome] = useState('');
  const [netMonthlyIncome, setNetMonthlyIncome] = useState('');
  const [otherRecurringMonthlyIncome, setOtherRecurringMonthlyIncome] = useState('');
  const reset = (): void => {
    setEditingId(null);
    setEffectiveDate(today());
    setGrossMonthlyIncome('');
    setNetMonthlyIncome('');
    setOtherRecurringMonthlyIncome('');
  };
  const submit = (): void => {
    const input = {
      effectiveDate,
      grossMonthlyIncome,
      netMonthlyIncome,
      otherRecurringMonthlyIncome: otherRecurringMonthlyIncome || null,
    };
    if (editingId) {
      const existing = records.find((record) => record.id === editingId);
      if (existing)
        onUpdate({
          ...input,
          id: existing.id,
          expectedUpdatedAtUtc: existing.updatedAtUtc,
        });
    } else onCreate(input);
    reset();
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Income / Assumptions</h2>
        <p className="mt-1 text-sm text-slate-600">
          Optional income history used only for debt-burden ratios. It does not import
          spending, create budgets, or change ledger activity.
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <label className="text-sm font-medium">
          Effective date
          <input
            className="mt-1 block w-full rounded border-slate-300"
            onChange={(event) => setEffectiveDate(event.target.value)}
            type="date"
            value={effectiveDate}
          />
        </label>
        <label className="text-sm font-medium">
          Monthly gross income
          <input
            className="mt-1 block w-full rounded border-slate-300"
            inputMode="decimal"
            onChange={(event) => setGrossMonthlyIncome(event.target.value)}
            placeholder="0.00"
            value={grossMonthlyIncome}
          />
        </label>
        <label className="text-sm font-medium">
          Monthly net income
          <input
            className="mt-1 block w-full rounded border-slate-300"
            inputMode="decimal"
            onChange={(event) => setNetMonthlyIncome(event.target.value)}
            placeholder="0.00"
            value={netMonthlyIncome}
          />
        </label>
        <label className="text-sm font-medium">
          Other recurring income
          <input
            className="mt-1 block w-full rounded border-slate-300"
            inputMode="decimal"
            onChange={(event) => setOtherRecurringMonthlyIncome(event.target.value)}
            placeholder="Optional"
            value={otherRecurringMonthlyIncome}
          />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
          disabled={loading}
          onClick={submit}
          type="button"
        >
          {editingId ? 'Save income change' : 'Add income record'}
        </button>
        {editingId ? (
          <button
            className="rounded border px-4 py-2 text-sm font-semibold"
            onClick={reset}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[800px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr>
              {[
                'Effective date',
                'Gross monthly',
                'Net monthly',
                'Other recurring',
                'Actions',
              ].map((header) => (
                <th className="px-3 py-2" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records
              .filter((record) => record.archivedAtUtc === null)
              .map((record) => (
                <tr className="border-b border-slate-100" key={record.id}>
                  <td className="px-3 py-2">{record.effectiveDate}</td>
                  <td className="px-3 py-2">
                    {formatDollarString(record.grossMonthlyIncome)}
                  </td>
                  <td className="px-3 py-2">
                    {formatDollarString(record.netMonthlyIncome)}
                  </td>
                  <td className="px-3 py-2">
                    {formatDollarString(record.otherRecurringMonthlyIncome)}
                  </td>
                  <td className="flex gap-2 px-3 py-2">
                    <button
                      className="font-semibold text-teal-700"
                      onClick={() => {
                        setEditingId(record.id);
                        setEffectiveDate(record.effectiveDate);
                        setGrossMonthlyIncome(record.grossMonthlyIncome);
                        setNetMonthlyIncome(record.netMonthlyIncome);
                        setOtherRecurringMonthlyIncome(
                          record.otherRecurringMonthlyIncome,
                        );
                      }}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="font-semibold text-red-700"
                      onClick={() =>
                        onArchive({
                          id: record.id,
                          expectedUpdatedAtUtc: record.updatedAtUtc,
                        })
                      }
                      type="button"
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
