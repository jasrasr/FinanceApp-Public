import { execFileSync } from 'node:child_process';
import { determineReleaseBump } from '../src/shared/release-version-policy';

const gitCommand = process.platform === 'win32' ? 'git.exe' : 'git';
const lastReleaseCommit = execFileSync(
  gitCommand,
  ['log', '--grep=^chore: release ', '-n', '1', '--format=%H'],
  { encoding: 'utf8' },
).trim();
const commitMessage = execFileSync(
  gitCommand,
  lastReleaseCommit
    ? ['log', `${lastReleaseCommit}..HEAD`, '--pretty=%B']
    : ['log', '-10', '--pretty=%B'],
  { encoding: 'utf8' },
);
const bump = determineReleaseBump(commitMessage, process.env.RELEASE_BUMP);
const npmArguments = ['version', bump, '--no-git-tag-version', '--ignore-scripts'];
const npmExecPath = process.env.npm_execpath;

if (npmExecPath) {
  execFileSync(process.execPath, [npmExecPath, ...npmArguments], { stdio: 'inherit' });
} else {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', npmArguments, {
    stdio: 'inherit',
  });
}
