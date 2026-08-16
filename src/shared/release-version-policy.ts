export type ReleaseBump = 'major' | 'minor' | 'patch';

export const determineReleaseBump = (
  commitMessage: string,
  explicitBump?: string,
): ReleaseBump => {
  if (
    explicitBump === 'major' ||
    explicitBump === 'minor' ||
    explicitBump === 'patch'
  ) {
    return explicitBump;
  }
  const subject = commitMessage.split(/\r?\n/, 1)[0] ?? '';
  if (
    /BREAKING CHANGE|BREAKING-CHANGE/.test(commitMessage) ||
    /^[a-z]+![:(]/i.test(subject)
  ) {
    return 'major';
  }
  if (/(^|\n)feat(?:\([^)]*\))?!?:/im.test(commitMessage)) return 'minor';
  return 'patch';
};
