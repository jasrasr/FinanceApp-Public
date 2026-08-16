import { useMemo, useState } from 'react';
import type {
  ArchiveIncomeTransactionRequest,
  CreateIncomeTransactionRequest,
  IncomeTransactionDto,
  UpdateIncomeTransactionRequest,
} from '../../../shared/debt-contracts';
import { formatDollarString } from './display-format';

type Preset = 'ytd' | 'prior-year' | 'last-12-months' | 'all-time' | 'custom';

export interface IncomeTransactionsProps {
  readonly records: readonly IncomeTransactionDto[];
  readonly loading: boolean;
  readonly onCreate: (request: CreateIncomeTransactionRequest) => void;
  readonly onUpdate: (request: UpdateIncomeTransactionRequest) => void;
  readonly onArchive: (request: ArchiveIncomeTransactionRequest) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const rangeFor = (preset: Preset): { start: string; end: string } => {
  const end = today();
  const year = Number(end.slice(0, 4));
  if (preset === 'prior-year')
    return { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` };
  if (preset === 'last-12-months') {
    const start = new Date(Date.UTC(year, Number(end.slice(5, 7)) - 12, 1));
    return { start: start.toISOString().slice(0, 10), end };
  }
  if (preset === 'all-time') return { start: '1900-01-01', end };
  return { start: `${year}-01-01`, end };
};
const typeLabel = (type: IncomeTransactionDto['incomeType']): string =>
  ({
    regular_paycheck: 'Regular Paycheck',
    bonus: 'Bonus',
    other_income: 'Other Income',
  })[type];

export const IncomeTransactions = ({
  records,
  loading,
  onCreate,
  onUpdate,
  onArchive,
}: IncomeTransactionsProps): React.JSX.Element => {
  const [preset, setPreset] = useState<Preset>('ytd');
  const initial = rangeFor('ytd');
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receivedDate, setReceivedDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [incomeType, setIncomeType] =
    useState<IncomeTransactionDto['incomeType']>('regular_paycheck');
  const [source, setSource] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [netAmount, setNetAmount] = useState('');
  const [notes, setNotes] = useState('');
  const visible = useMemo(
    () =>
      records.filter(
        (record) =>
          record.archivedAtUtc === null &&
          record.receivedDate >= start &&
          record.receivedDate <= end,
      ),
    [end, records, start],
  );
  const totals = visible.reduce(
    (result, record) => {
      const net = Number(record.netAmount ?? record.amount);
      const gross = Number(record.grossAmount ?? record.amount);
      result.gross += gross;
      result.net += net;
      if (record.incomeType === 'regular_paycheck') result.regular += net;
      if (record.incomeType === 'bonus') result.bonus += net;
      if (record.incomeType === 'other_income') result.other += net;
      return result;
    },
    { gross: 0, net: 0, regular: 0, bonus: 0, other: 0 },
  );
  const months = Math.max(
    1,
    new Set(visible.map((record) => record.receivedDate.slice(0, 7))).size,
  );
  const reset = (): void => {
    setEditingId(null);
    setReceivedDate(today());
    setAmount('');
    setIncomeType('regular_paycheck');
    setSource('');
    setGrossAmount('');
    setNetAmount('');
    setNotes('');
  };
  const submit = (): void => {
    const input = {
      receivedDate,
      amount,
      incomeType,
      source,
      notes: notes || null,
      grossAmount: grossAmount || null,
      netAmount: netAmount || null,
    };
    const existing = editingId
      ? records.find((record) => record.id === editingId)
      : null;
    if (existing)
      onUpdate({
        ...input,
        id: existing.id,
        expectedUpdatedAtUtc: existing.updatedAtUtc,
      });
    else onCreate(input);
    reset();
  };
  return (
    <section aria-labelledby="income-transactions-heading" className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Actual income
        </p>
        <h1 className="mt-1 text-3xl font-semibold" id="income-transactions-heading">
          Income
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Record paychecks, bonuses, and other income received. Income remains separate
          from the debt ledger.
        </p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Add Income</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm font-medium">
            Date received
            <input
              className="mt-1 block w-full rounded border-slate-300"
              type="date"
              value={receivedDate}
              onChange={(event) => setReceivedDate(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Amount received
            <input
              className="mt-1 block w-full rounded border-slate-300"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="text-sm font-medium">
            Income type
            <select
              className="mt-1 block w-full rounded border-slate-300"
              value={incomeType}
              onChange={(event) =>
                setIncomeType(event.target.value as IncomeTransactionDto['incomeType'])
              }
            >
              <option value="regular_paycheck">Regular Paycheck</option>
              <option value="bonus">Bonus</option>
              <option value="other_income">Other Income</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Source / employer
            <input
              className="mt-1 block w-full rounded border-slate-300"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Gross amount (optional)
            <input
              className="mt-1 block w-full rounded border-slate-300"
              inputMode="decimal"
              value={grossAmount}
              onChange={(event) => setGrossAmount(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Net / take-home (optional)
            <input
              className="mt-1 block w-full rounded border-slate-300"
              inputMode="decimal"
              value={netAmount}
              onChange={(event) => setNetAmount(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            Notes
            <input
              className="mt-1 block w-full rounded border-slate-300"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
            disabled={loading}
            onClick={submit}
            type="button"
          >
            {editingId ? 'Save income change' : 'Add Income'}
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
      </section>
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <label className="text-sm font-medium">
          Period
          <select
            className="mt-1 block w-full rounded border-slate-300"
            value={preset}
            onChange={(event) => {
              const next = event.target.value as Preset;
              const nextRange = rangeFor(next);
              setPreset(next);
              setStart(nextRange.start);
              setEnd(nextRange.end);
            }}
          >
            <option value="ytd">Year to date</option>
            <option value="prior-year">Prior year</option>
            <option value="last-12-months">Last 12 months</option>
            <option value="all-time">All time</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Start date
          <input
            className="mt-1 block w-full rounded border-slate-300"
            disabled={preset !== 'custom'}
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          End date
          <input
            className="mt-1 block w-full rounded border-slate-300"
            disabled={preset !== 'custom'}
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
      </section>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          ['Gross income', totals.gross],
          ['Net income', totals.net],
          ['Regular paychecks', totals.regular],
          ['Bonuses', totals.bonus],
          ['Other income', totals.other],
          ['Average monthly net', totals.net / months],
        ].map(([label, total]) => (
          <section
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            key={String(label)}
          >
            <h2 className="whitespace-nowrap text-sm font-semibold text-slate-600">
              {label}
            </h2>
            <p className="mt-2 text-xl font-semibold">
              {formatDollarString(Number(total).toFixed(2))}
            </p>
          </section>
        ))}
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Income transactions</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1050px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>
                {[
                  'Date',
                  'Source',
                  'Type',
                  'Amount',
                  'Gross',
                  'Net',
                  'Notes',
                  'Actions',
                ].map((header) => (
                  <th className="whitespace-nowrap px-3 py-2" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible
                .slice()
                .reverse()
                .map((record) => (
                  <tr className="border-b border-slate-100" key={record.id}>
                    <td className="whitespace-nowrap px-3 py-2">
                      {record.receivedDate}
                    </td>
                    <td className="px-3 py-2">{record.source}</td>
                    <td className="px-3 py-2">{typeLabel(record.incomeType)}</td>
                    <td className="px-3 py-2">{formatDollarString(record.amount)}</td>
                    <td className="px-3 py-2">
                      {record.grossAmount
                        ? formatDollarString(record.grossAmount)
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {record.netAmount ? formatDollarString(record.netAmount) : '—'}
                    </td>
                    <td className="max-w-[240px] px-3 py-2">{record.notes ?? '—'}</td>
                    <td className="flex gap-2 px-3 py-2">
                      <button
                        className="font-semibold text-teal-700"
                        onClick={() => {
                          setEditingId(record.id);
                          setReceivedDate(record.receivedDate);
                          setAmount(record.amount);
                          setIncomeType(record.incomeType);
                          setSource(record.source);
                          setGrossAmount(record.grossAmount ?? '');
                          setNetAmount(record.netAmount ?? '');
                          setNotes(record.notes ?? '');
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
    </section>
  );
};
