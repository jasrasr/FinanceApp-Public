export type DatePreset =
  | 'current_year'
  | 'prior_year'
  | 'current_month'
  | 'prior_month'
  | 'year_to_date'
  | 'last_12_months'
  | 'all_activity'
  | 'custom';

export interface ReportSessionState {
  readonly datePreset: DatePreset;
  readonly startDate: string;
  readonly endDate: string;
  readonly debtId: string | null;
  readonly debtType: string;
  readonly status: string;
  readonly openSections: readonly string[];
  readonly interestVisibleYears: readonly string[] | null;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const defaultStart = (): string => `${today().slice(0, 4)}-01-01`;

export const defaultReportSessionState = (): ReportSessionState => ({
  datePreset: 'current_year',
  startDate: defaultStart(),
  endDate: today(),
  debtId: null,
  debtType: '',
  status: '',
  openSections: [],
  interestVisibleYears: null,
});
