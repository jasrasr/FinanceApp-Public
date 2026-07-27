const assertScale = (scaleDigits: number): void => {
  if (!Number.isInteger(scaleDigits) || scaleDigits < 0 || scaleDigits > 12) {
    throw new RangeError('Scale digits must be an integer between 0 and 12.');
  }
};

const assertSafeInteger = (value: number): void => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('Scaled value exceeds the safe-integer range.');
  }
};

export const decimalStringToScaledInteger = (
  input: string,
  scaleDigits: number,
  allowNegative = true,
): number => {
  assertScale(scaleDigits);

  const normalized = input.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(normalized);

  if (!match) {
    throw new TypeError('Value must be a decimal string.');
  }

  const signText = match[1] ?? '';
  const wholeText = match[2] ?? '';
  const fractionText = match[3] ?? '';
  const isNegative = signText === '-';

  if (isNegative && !allowNegative) {
    throw new RangeError('Value cannot be negative.');
  }

  const scale = 10n ** BigInt(scaleDigits);
  const keptFraction = fractionText.slice(0, scaleDigits).padEnd(scaleDigits, '0');
  const discardedFraction = fractionText.slice(scaleDigits);
  const shouldRound =
    discardedFraction.length > 0 && discardedFraction.charAt(0) >= '5';

  let scaled = BigInt(wholeText) * scale;
  scaled += keptFraction === '' ? 0n : BigInt(keptFraction);

  if (shouldRound) {
    scaled += 1n;
  }

  if (isNegative) {
    scaled = -scaled;
  }

  const result = Number(scaled);
  assertSafeInteger(result);
  return result;
};

export const scaledIntegerToDecimalString = (
  value: number,
  scaleDigits: number,
  trimTrailingZeros = false,
): string => {
  assertScale(scaleDigits);
  assertSafeInteger(value);

  const sign = value < 0 ? '-' : '';
  const absolute = BigInt(Math.abs(value));
  const scale = 10n ** BigInt(scaleDigits);
  const whole = absolute / scale;

  if (scaleDigits === 0) {
    return `${sign}${whole}`;
  }

  let fraction = (absolute % scale).toString().padStart(scaleDigits, '0');

  if (trimTrailingZeros) {
    fraction = fraction.replace(/0+$/, '');
  }

  return fraction === '' ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
};
