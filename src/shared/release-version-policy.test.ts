import { describe, expect, it } from 'vitest';
import { determineReleaseBump } from './release-version-policy';

describe('release version bump policy', () => {
  it('uses a minor bump for feature commits', () => {
    expect(determineReleaseBump('feat: add income analysis')).toBe('minor');
  });

  it('uses a patch bump for fixes and maintenance', () => {
    expect(determineReleaseBump('fix: correct chart labels')).toBe('patch');
    expect(determineReleaseBump('chore: update documentation')).toBe('patch');
  });

  it('recognizes feature titles in merge commit bodies', () => {
    expect(
      determineReleaseBump('Merge pull request #42\n\nfeat: add debt burden ratios'),
    ).toBe('minor');
  });

  it('recognizes breaking changes and explicit release overrides', () => {
    expect(determineReleaseBump('feat!: replace the reporting API')).toBe('major');
    expect(determineReleaseBump('docs: release notes', 'minor')).toBe('minor');
  });
});
