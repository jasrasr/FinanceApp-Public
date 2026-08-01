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

export interface ChartScaleOptions {
  readonly values: readonly number[];
  readonly chartHeight: number;
  readonly includeZero: boolean;
  readonly allowExcludeZero?: boolean;
  readonly formatLabel: (value: number) => string;
}

export interface ChartScale {
  readonly minimum: number;
  readonly maximum: number;
  readonly majorUnit: number;
  readonly tickValues: readonly number[];
  readonly formattedLabels: readonly string[];
}

const niceSteps = [1, 2, 2.5, 5, 10] as const;

const niceMajorUnit = (rawUnit: number): number => {
  if (!Number.isFinite(rawUnit) || rawUnit <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(rawUnit)));
  const normalized = rawUnit / power;
  const step = niceSteps.find((candidate) => normalized <= candidate) ?? 10;
  return step * power;
};

const localTickTarget = (chartHeight: number): number =>
  Math.max(4, Math.min(7, Math.round(chartHeight / 42)));

export const buildChartScale = ({
  allowExcludeZero = false,
  chartHeight,
  formatLabel,
  includeZero,
  values,
}: ChartScaleOptions): ChartScale => {
  const finiteValues = values.filter(Number.isFinite);
  const rawMinimum = finiteValues.length > 0 ? Math.min(...finiteValues) : 0;
  const rawMaximum = finiteValues.length > 0 ? Math.max(...finiteValues) : 1;
  const crossesZero = rawMinimum <= 0 && rawMaximum >= 0;
  const span = Math.max(1, rawMaximum - rawMinimum);
  const mustIncludeZero = includeZero || crossesZero;
  const misleadingWithoutZero =
    rawMinimum > 0 && rawMinimum / Math.max(rawMaximum, 1) < 0.25;
  const lower =
    mustIncludeZero || !allowExcludeZero || misleadingWithoutZero
      ? Math.min(0, rawMinimum)
      : Math.max(0, rawMinimum - span * 0.12);
  const upperHeadroom = span * 0.12;
  const upper = rawMaximum <= lower ? lower + 1 : rawMaximum + upperHeadroom;
  const targetTicks = localTickTarget(chartHeight);
  let majorUnit = niceMajorUnit((upper - lower) / Math.max(1, targetTicks - 1));
  let minimum = Math.floor(lower / majorUnit) * majorUnit;
  let maximum = Math.ceil(upper / majorUnit) * majorUnit;
  let tickValues = Array.from(
    { length: Math.round((maximum - minimum) / majorUnit) + 1 },
    (_, index) => minimum + index * majorUnit,
  );

  while (tickValues.length > 7) {
    majorUnit = niceMajorUnit(majorUnit * 1.01);
    minimum = Math.floor(lower / majorUnit) * majorUnit;
    maximum = Math.ceil(upper / majorUnit) * majorUnit;
    tickValues = Array.from(
      { length: Math.round((maximum - minimum) / majorUnit) + 1 },
      (_, index) => minimum + index * majorUnit,
    );
  }

  return {
    minimum,
    maximum,
    majorUnit,
    tickValues,
    formattedLabels: tickValues.map(formatLabel),
  };
};
