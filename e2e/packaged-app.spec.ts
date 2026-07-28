import { expect, test, _electron as electron, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const executablePath = process.env.DEBT_TRACKER_PACKAGED_EXE;

test.describe('packaged Windows application', () => {
  test.skip(!executablePath, 'DEBT_TRACKER_PACKAGED_EXE is required.');

  test('launches installed app and exercises database, backup, restore, and export', async () => {
    if (!executablePath) throw new Error('Packaged executable path is required.');

    const userDataDirectory =
      process.env.DEBT_TRACKER_PACKAGED_USER_DATA_DIR ??
      mkdtempSync(join(tmpdir(), 'debt-tracker-packaged-user-data-'));
    const exportDirectory =
      process.env.DEBT_TRACKER_TEST_EXPORT_DIR ??
      mkdtempSync(join(tmpdir(), 'debt-tracker-packaged-export-'));
    const shouldCleanUserData = !process.env.DEBT_TRACKER_PACKAGED_USER_DATA_DIR;
    const shouldCleanExportDirectory = !process.env.DEBT_TRACKER_TEST_EXPORT_DIR;

    const application = await electron.launch({
      executablePath,
      env: {
        ...process.env,
        DEBT_TRACKER_TEST_MODE: '1',
        DEBT_TRACKER_TEST_USER_DATA_DIR: userDataDirectory,
        DEBT_TRACKER_TEST_EXPORT_DIR: exportDirectory,
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
      await expect(window.getByText('Version 0.14.0')).toBeVisible();
      await expect(window.getByText(/^Last changed: /)).toBeVisible();

      await window.getByRole('button', { name: 'Debts' }).click();
      await expect(
        window.getByRole('heading', { name: 'No debts to display' }),
      ).toBeVisible();

      await createGeneratedDebt(window, {
        name: 'Packaged Fictional Baseline Note',
        principal: '42000.00',
        payment: '925.00',
        maturity: '2031-05-15',
      });

      await window.getByRole('button', { name: 'Data management' }).click();
      await expect(
        window.getByRole('heading', { name: 'Backup, restore, and export' }),
      ).toBeVisible();
      await window.getByRole('button', { name: 'Create backup' }).click();
      await expect(
        window.getByText('Database backup was created and validated.'),
      ).toBeVisible();
      await expect(window.getByText(/manual-/).first()).toBeVisible();

      await window.getByRole('button', { name: 'Debts' }).click();
      await createGeneratedDebt(window, {
        name: 'Packaged Fictional Post Backup Draw',
        principal: '8700.00',
        payment: '230.00',
        maturity: '2029-08-31',
      });

      await window.getByRole('button', { name: 'Data management' }).click();
      window.once('dialog', (dialog) => dialog.accept());
      await window.getByRole('button', { name: 'Restore' }).first().click();
      await expect(
        window.getByText('Database restore completed from a validated backup.'),
      ).toBeVisible();

      await window.getByRole('button', { name: 'Debts' }).click();
      await expect(window.getByText('Packaged Fictional Baseline Note')).toBeVisible();
      await expect(
        window.getByText('Packaged Fictional Post Backup Draw'),
      ).not.toBeVisible();

      await window.getByRole('button', { name: 'Data management' }).click();
      await window.getByRole('button', { name: 'Export CSV files' }).click();
      await expect(
        window.getByText(/Export completed with \d+ CSV files/),
      ).toBeVisible();

      expect(existsSync(join(userDataDirectory, 'debt-tracker.sqlite3'))).toBe(true);
      expect(existsSync(join(userDataDirectory, 'backups'))).toBe(true);
      expect(existsSync(join(userDataDirectory, 'diagnostics', 'startup.json'))).toBe(
        true,
      );
      expect(
        readdirSync(exportDirectory).some((entry) =>
          entry.startsWith('debt-tracker-export-'),
        ),
      ).toBe(true);
      expect(resolve(userDataDirectory).startsWith(resolve(process.cwd()))).toBe(false);
      expect(resolve(exportDirectory).startsWith(resolve(process.cwd()))).toBe(false);
    } finally {
      await application.close();
      if (shouldCleanUserData)
        rmSync(userDataDirectory, { force: true, recursive: true });
      if (shouldCleanExportDirectory) {
        rmSync(exportDirectory, { force: true, recursive: true });
      }
    }
  });
});

const createGeneratedDebt = async (
  window: Page,
  {
    maturity,
    name,
    payment,
    principal,
  }: {
    readonly maturity: string;
    readonly name: string;
    readonly payment: string;
    readonly principal: string;
  },
): Promise<void> => {
  const createFirstDebtButton = window.getByRole('button', {
    name: 'Create first debt',
  });
  const addDebtButton = window.getByRole('button', { name: 'Add debt' });
  if (await createFirstDebtButton.isVisible()) {
    await createFirstDebtButton.click();
  } else {
    await addDebtButton.click();
  }
  await window.getByLabel('Debt name').fill(name);
  await window.getByLabel('Creditor').fill('Packaged Smoke Fictional Credit Union');
  await window.getByLabel('Debt type').selectOption('business');
  await window.getByLabel('Original principal').fill(principal);
  await window.getByLabel('Origination date').fill('2026-01-15');
  await window.getByLabel(/Maturity date/).fill(maturity);
  await window.getByLabel('Tax category').selectOption('business');
  await window.getByLabel('Deductible percentage').fill('0');
  await window.getByLabel('Purpose').fill('Generated packaging smoke workflow');
  await window.getByLabel('Annual interest rate (%)').fill('4.25');
  await window.getByLabel('Required payment').fill(payment);
  await window.getByRole('button', { name: 'Create debt' }).click();
  await expect(window.getByRole('heading', { name })).toBeVisible();
};
