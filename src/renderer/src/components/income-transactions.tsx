import { useMemo, useState } from 'react';
import type {
  ArchiveIncomeTransactionRequest,
  CreateIncomeTransactionRequest,
  CreateIncomeSourceRequest,
  IncomeSourceDto,
  SetIncomeSourceArchivedRequest,
  UpdateIncomeSourceRequest,
  IncomeTransactionDto,
  UpdateIncomeTransactionRequest,
} from '../../../shared/debt-contracts';
import { formatDollarString } from './display-format';

type Preset = 'ytd' | 'prior-year' | 'last-12-months' | 'all-time' | 'custom';

export interface IncomeTransactionsProps {
  readonly records: readonly IncomeTransactionDto[];
  readonly sources: readonly IncomeSourceDto[];
  readonly loading: boolean;
  readonly onCreate: (request: CreateIncomeTransactionRequest) => void;
  readonly onUpdate: (request: UpdateIncomeTransactionRequest) => void;
  readonly onArchive: (request: ArchiveIncomeTransactionRequest) => void;
  readonly onCreateSource: (
    request: CreateIncomeSourceRequest,
  ) => Promise<IncomeSourceDto | null>;
  readonly onUpdateSource: (request: UpdateIncomeSourceRequest) => void;
  readonly onSetSourceArchived: (request: SetIncomeSourceArchivedRequest) => void;
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
  sources,
  loading,
  onCreate,
  onUpdate,
  onArchive,
  onCreateSource,
  onUpdateSource,
  onSetSourceArchived,
}: IncomeTransactionsProps): React.JSX.Element => {
  const [preset, setPreset] = useState<Preset>('ytd');
  const initial = rangeFor('ytd');
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receivedDate, setReceivedDate] = useState(today());
  const [netAmount, setNetAmount] = useState('');
  const [incomeType, setIncomeType] =
    useState<IncomeTransactionDto['incomeType']>('regular_paycheck');
  const [sourceId, setSourceId] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [newSourceName, setNewSourceName] = useState('');
  const [sourceEditingId, setSourceEditingId] = useState<string | null>(null);
  const [sourceEditingName, setSourceEditingName] = useState('');
  const [quickSourceName, setQuickSourceName] = useState('');
  const visible = useMemo(
    () =>
      records.filter(
        (record) =>
          record.archivedAtUtc === null &&
          record.receivedDate >= start &&
          record.receivedDate <= end &&
          (!sourceFilter || record.sourceId === sourceFilter),
      ),
    [end, records, sourceFilter, start],
  );
  const totals = visible.reduce(
    (result, record) => {
      const net = Number(record.netAmount ?? record.amount);
      const gross = record.grossAmount === null ? 0 : Number(record.grossAmount);
      result.gross += gross;
      if (record.grossAmount !== null) result.grossCount += 1;
      result.net += net;
      if (record.incomeType === 'regular_paycheck') result.regular += net;
      if (record.incomeType === 'bonus') result.bonus += net;
      if (record.incomeType === 'other_income') result.other += net;
      return result;
    },
    { gross: 0, grossCount: 0, net: 0, regular: 0, bonus: 0, other: 0 },
  );
  const months = Math.max(
    1,
    new Set(visible.map((record) => record.receivedDate.slice(0, 7))).size,
  );
  const reset = (): void => {
    setEditingId(null);
    setReceivedDate(today());
    setGrossAmount('');
    setNetAmount('');
    setNotes('');
  };
  const submit = (): void => {
    const input = {
      receivedDate,
      incomeType,
      sourceId,
      notes: notes || null,
      grossAmount: grossAmount || null,
      netAmount,
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
  const addQuickSource = async (): Promise<void> => {
    const name = quickSourceName.trim();
    if (!name) return;
    const created = await onCreateSource({ name });
    if (created) {
      setSourceId(created.id);
      setQuickSourceName('');
    }
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
            Net / take-home amount
            <input
              className="mt-1 block w-full rounded border-slate-300"
              inputMode="decimal"
              required
              value={netAmount}
              onChange={(event) => setNetAmount(event.target.value)}
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
            <select
              className="mt-1 block w-full rounded border-slate-300"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              required
            >
              <option value="">Select a source</option>
              {sources
                .filter(
                  (sourceRecord) =>
                    sourceRecord.archivedAtUtc === null || sourceRecord.id === sourceId,
                )
                .map((sourceRecord) => (
                  <option key={sourceRecord.id} value={sourceRecord.id}>
                    {sourceRecord.name}
                  </option>
                ))}
            </select>
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
          <div className="text-sm md:col-span-2">
            <span className="font-medium">Need another source?</span>
            <div className="mt-1 flex gap-2">
              <input
                aria-label="Quick new income source"
                className="block min-w-0 flex-1 rounded border-slate-300"
                value={quickSourceName}
                onChange={(event) => setQuickSourceName(event.target.value)}
                placeholder="Add new source"
              />
              <button
                className="rounded border px-3 py-2 font-semibold"
                disabled={loading || !quickSourceName.trim()}
                onClick={() => void addQuickSource()}
                type="button"
              >
                Add source
              </button>
            </div>
          </div>
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
        <label className="text-sm font-medium">
          Source filter
          <select
            className="mt-1 block w-full rounded border-slate-300"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
          >
            <option value="">All sources</option>
            {sources.map((sourceRecord) => (
              <option key={sourceRecord.id} value={sourceRecord.id}>
                {sourceRecord.name}
                {sourceRecord.archivedAtUtc ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
      </section>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          ['Net income', totals.net],
          ['Gross income entered', totals.gross],
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
              {label === 'Gross income entered' && totals.grossCount === 0
                ? 'Unavailable'
                : formatDollarString(Number(total).toFixed(2))}
            </p>
          </section>
        ))}
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Income by source</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[620px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Net income</th>
                <th className="px-3 py-2">Regular paychecks</th>
                <th className="px-3 py-2">Bonuses</th>
                <th className="px-3 py-2">Other income</th>
              </tr>
            </thead>
            <tbody>
              {sources
                .map((sourceRecord) => {
                  const sourceRecords = visible.filter(
                    (record) => record.sourceId === sourceRecord.id,
                  );
                  const byType = (type: IncomeTransactionDto['incomeType']): number =>
                    sourceRecords
                      .filter((record) => record.incomeType === type)
                      .reduce(
                        (sum, record) =>
                          sum + Number(record.netAmount ?? record.amount),
                        0,
                      );
                  return {
                    sourceRecord,
                    net: sourceRecords.reduce(
                      (sum, record) => sum + Number(record.netAmount ?? record.amount),
                      0,
                    ),
                    regular: byType('regular_paycheck'),
                    bonus: byType('bonus'),
                    other: byType('other_income'),
                  };
                })
                .filter((row) => row.net > 0)
                .map((row) => (
                  <tr className="border-b border-slate-100" key={row.sourceRecord.id}>
                    <td className="px-3 py-2">{row.sourceRecord.name}</td>
                    <td className="px-3 py-2">
                      {formatDollarString(row.net.toFixed(2))}
                    </td>
                    <td className="px-3 py-2">
                      {formatDollarString(row.regular.toFixed(2))}
                    </td>
                    <td className="px-3 py-2">
                      {formatDollarString(row.bonus.toFixed(2))}
                    </td>
                    <td className="px-3 py-2">
                      {formatDollarString(row.other.toFixed(2))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Income sources</h2>
        <div className="mt-3 flex gap-2">
          <input
            aria-label="New income source name"
            className="min-w-0 flex-1 rounded border-slate-300"
            value={newSourceName}
            onChange={(event) => setNewSourceName(event.target.value)}
            placeholder="Source name"
          />
          <button
            className="rounded bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
            disabled={loading || !newSourceName.trim()}
            onClick={() => {
              void onCreateSource({ name: newSourceName.trim() }).then((created) => {
                if (created) setNewSourceName('');
              });
            }}
            type="button"
          >
            Add source
          </button>
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {sources.map((sourceRecord) => (
            <li className="flex items-center gap-3 py-2" key={sourceRecord.id}>
              {sourceEditingId === sourceRecord.id ? (
                <input
                  aria-label={`Edit ${sourceRecord.name}`}
                  className="min-w-0 flex-1 rounded border-slate-300"
                  value={sourceEditingName}
                  onChange={(event) => setSourceEditingName(event.target.value)}
                />
              ) : (
                <span className="min-w-0 flex-1">
                  {sourceRecord.name}
                  {sourceRecord.archivedAtUtc ? ' (archived)' : ''}
                </span>
              )}
              {sourceEditingId === sourceRecord.id ? (
                <button
                  className="font-semibold text-teal-700"
                  onClick={() => {
                    onUpdateSource({
                      id: sourceRecord.id,
                      name: sourceEditingName,
                      expectedUpdatedAtUtc: sourceRecord.updatedAtUtc,
                    });
                    setSourceEditingId(null);
                  }}
                  type="button"
                >
                  Save
                </button>
              ) : (
                <button
                  className="font-semibold text-teal-700"
                  onClick={() => {
                    setSourceEditingId(sourceRecord.id);
                    setSourceEditingName(sourceRecord.name);
                  }}
                  type="button"
                >
                  Edit
                </button>
              )}
              <button
                className="font-semibold text-slate-700"
                onClick={() =>
                  onSetSourceArchived({
                    id: sourceRecord.id,
                    expectedUpdatedAtUtc: sourceRecord.updatedAtUtc,
                    archived: sourceRecord.archivedAtUtc === null,
                  })
                }
                type="button"
              >
                {sourceRecord.archivedAtUtc ? 'Restore' : 'Archive'}
              </button>
            </li>
          ))}
        </ul>
      </section>
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
                  'Net',
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
                          setNetAmount(record.netAmount ?? record.amount);
                          setIncomeType(record.incomeType);
                          setSourceId(record.sourceId ?? '');
                          setGrossAmount(record.grossAmount ?? '');
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
