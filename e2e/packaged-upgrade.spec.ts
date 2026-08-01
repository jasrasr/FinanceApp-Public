import { expect, test, _electron as electron } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const executablePath = process.env.DEBT_TRACKER_PACKAGED_EXE;
const userDataDirectory = process.env.DEBT_TRACKER_PACKAGED_USER_DATA_DIR;

test.describe('packaged Windows upgrade behavior', () => {
  test.skip(
    !executablePath || !userDataDirectory,
    'DEBT_TRACKER_PACKAGED_EXE and DEBT_TRACKER_PACKAGED_USER_DATA_DIR are required.',
  );

  test('preserves the existing user-data database after reinstall or upgrade', async () => {
    if (!executablePath || !userDataDirectory) {
      throw new Error('Packaged executable and user-data paths are required.');
    }

    const application = await electron.launch({
      executablePath,
      env: {
        ...process.env,
        DEBT_TRACKER_TEST_MODE: '1',
        DEBT_TRACKER_TEST_USER_DATA_DIR: userDataDirectory,
      },
    });
    application.process().stderr?.on('data', (data: Buffer) => {
      process.stderr.write(data);
    });

    try {
      const window = await application.firstWindow();
      await expect(
        window.getByRole('heading', { name: 'Debt overview' }),
      ).toBeVisible();
      await window.getByRole('button', { name: 'Debts', exact: true }).click();
      await expect(window.getByText('Packaged Fictional Baseline Note')).toBeVisible();
      expect(existsSync(join(userDataDirectory, 'debt-tracker.sqlite3'))).toBe(true);
    } finally {
      await application.close();
    }
  });
});
