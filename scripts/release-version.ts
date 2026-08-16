import { execFileSync } from 'node:child_process';
import { determineReleaseBump } from '../src/shared/release-version-policy';

const commitMessage = execFileSync(
  process.platform === 'win32' ? 'git.exe' : 'git',
  ['log', '-1', '--pretty=%B'],
  { encoding: 'utf8' },
);
const bump = determineReleaseBump(commitMessage, process.env.RELEASE_BUMP);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

execFileSync(
  npmCommand,
  ['version', bump, '--no-git-tag-version', '--ignore-scripts'],
  { stdio: 'inherit' },
);
