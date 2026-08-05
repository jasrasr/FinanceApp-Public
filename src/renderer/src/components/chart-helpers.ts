const interestYearTreatments = [
  { fill: '#0f766e', stroke: '#115e59' },
  { fill: '#c2410c', stroke: '#9a3412' },
  { fill: '#4338ca', stroke: '#3730a3' },
  { fill: '#be123c', stroke: '#9f1239' },
  { fill: '#047857', stroke: '#065f46' },
  { fill: '#7c3aed', stroke: '#6d28d9' },
  { fill: '#0369a1', stroke: '#075985' },
  { fill: '#a16207', stroke: '#854d0e' },
  { fill: '#b91c1c', stroke: '#991b1b' },
  { fill: '#4d7c0f', stroke: '#3f6212' },
] as const;

export const interestYearTreatment = (
  index: number,
): {
  readonly fill: string;
  readonly stroke: string;
} => interestYearTreatments[index % interestYearTreatments.length]!;

const debtSeriesColors = [
  '#1d4ed8',
  '#047857',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#0891b2',
  '#4d7c0f',
  '#c2410c',
  '#0f766e',
  '#4338ca',
  '#b91c1c',
  '#a16207',
] as const;

export const debtSeriesColor = (index: number): string =>
  debtSeriesColors[index % debtSeriesColors.length] ?? '#1d4ed8';

export interface PayoffChartDateSeries {
  readonly monthlySchedule: readonly { readonly month: string }[];
}

export const buildPayoffChartDateDomain = (
  scenarios: readonly PayoffChartDateSeries[],
): readonly string[] =>
  [
    ...new Set(
      scenarios.flatMap((scenario) =>
        scenario.monthlySchedule.map((entry) => entry.month),
      ),
    ),
  ].sort();

export const buildPayoffChartTickIndexes = (
  projectionDates: readonly string[],
): readonly number[] => {
  if (projectionDates.length <= 1) return [0];
  const maxTicks =
    projectionDates.length > 36
      ? 7
      : projectionDates.length > 18
        ? 6
        : Math.min(7, projectionDates.length);
  const step = Math.max(
    1,
    Math.ceil((projectionDates.length - 1) / Math.max(1, maxTicks - 1)),
  );
  const indexes = new Set<number>([0, projectionDates.length - 1]);
  for (let index = step; index < projectionDates.length - 1; index += step) {
    indexes.add(index);
  }
  return [...indexes].sort((left, right) => left - right);
};

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

export const buildPayoffPrincipalBalanceScale = ({
  chartHeight,
  formatLabel,
  values,
}: {
  readonly chartHeight: number;
  readonly formatLabel: (value: number) => string;
  readonly values: readonly number[];
}): ChartScale => {
  const finiteValues = values.filter(Number.isFinite);
  const rawMaximum = finiteValues.length > 0 ? Math.max(...finiteValues) : 1;
  const targetTicks = localTickTarget(chartHeight);
  const paddedMaximum = Math.max(1, rawMaximum * 1.05);
  let majorUnit = niceMajorUnit(paddedMaximum / Math.max(1, targetTicks - 1));
  let maximum = Math.ceil(paddedMaximum / majorUnit) * majorUnit;
  let tickValues = Array.from(
    { length: Math.round(maximum / majorUnit) + 1 },
    (_, index) => index * majorUnit,
  );

  while (tickValues.length > 7) {
    majorUnit = niceMajorUnit(majorUnit * 1.01);
    maximum = Math.ceil(paddedMaximum / majorUnit) * majorUnit;
    tickValues = Array.from(
      { length: Math.round(maximum / majorUnit) + 1 },
      (_, index) => index * majorUnit,
    );
  }

  return {
    minimum: 0,
    maximum,
    majorUnit,
    tickValues,
    formattedLabels: tickValues.map(formatLabel),
  };
};
