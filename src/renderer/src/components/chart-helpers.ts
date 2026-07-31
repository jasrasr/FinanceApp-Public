export const monthlyInterestTickIndexes = (
  periodCount: number,
  chartWidth = 720,
): readonly number[] => {
  if (periodCount <= 1) return [0];
  const widthAllowance = Math.max(4, Math.floor(chartWidth / 96));
  const maxTicks = Math.max(4, Math.min(10, widthAllowance, periodCount));
  const step = Math.max(1, Math.ceil((periodCount - 1) / (maxTicks - 1)));
  const indexes = new Set<number>([0, periodCount - 1]);
  for (let index = step; index < periodCount - 1; index += step) indexes.add(index);
  return [...indexes].sort((a, b) => a - b);
};

export const monthlyInterestTickLabel = (
  period: string,
  visiblePeriodCount: number,
): string => {
  const month = Number(period.slice(5, 7));
  const year = period.slice(0, 4);
  if (visiblePeriodCount > 24)
    return month === 1 ? year : `Q${Math.ceil(month / 3)} ${year}`;
  if (/^\d{4}$/.test(period)) return period;
  const [periodYear, periodMonth] = period.split('-');
  return new Date(
    Date.UTC(Number(periodYear), Number(periodMonth) - 1, 1),
  ).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const interestYearTreatment = (
  index: number,
): {
  readonly dash: string | undefined;
  readonly fill: string;
  readonly stroke: string;
} =>
  [
    { fill: '#0f766e', stroke: '#115e59', dash: undefined },
    { fill: '#c2410c', stroke: '#9a3412', dash: '4 2' },
    { fill: '#4338ca', stroke: '#3730a3', dash: '1 2' },
    { fill: '#991b1b', stroke: '#7f1d1d', dash: '8 2 1 2' },
  ][index % 4]!;
