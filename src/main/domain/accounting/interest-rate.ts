import { decimalStringToScaledInteger, scaledIntegerToDecimalString } from './decimal';

export const ANNUAL_RATE_SCALE = 1_000_000;
export const DEDUCTIBLE_PERCENTAGE_SCALE = 10_000;

export const percentStringToRateMicros = (percent: string): number =>
  decimalStringToScaledInteger(percent, 4, false);

export const rateMicrosToPercentString = (rateMicros: number): string =>
  scaledIntegerToDecimalString(rateMicros, 4, true);

export const rateMicrosToDecimalString = (rateMicros: number): string =>
  scaledIntegerToDecimalString(rateMicros, 6);

export const percentStringToBasisPoints = (percent: string): number =>
  decimalStringToScaledInteger(percent, 2, false);

export const basisPointsToPercentString = (basisPoints: number): string =>
  scaledIntegerToDecimalString(basisPoints, 2, true);
