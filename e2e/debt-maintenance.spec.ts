import { expect, test, _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('completes the manual debt-maintenance workflow', async () => {
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'debt-tracker-e2e-user-data-'));
  const application = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
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
    await expect(window.getByRole('heading', { name: 'Debt overview' })).toBeVisible();
    await expect(window.getByText('Version 0.8.0')).toBeVisible();
    await expect(window.getByText(/^Last changed: /)).toBeVisible();
    await expect(
      window.getByRole('heading', { name: 'No active debts to summarize' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Workbook import' }).click();
    await expect(
      window.getByRole('heading', { name: 'Stage and map workbook rows' }),
    ).toBeVisible();
    await expect(window.getByText(/No staged workbook imports yet/)).toBeVisible();
    await expect(window.getByText(/staged for review before posting/)).toBeVisible();

    await window.getByRole('button', { name: 'Debts' }).click();
    await expect(
      window.getByRole('heading', { name: 'No debts to display' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Create first debt' }).click();
    await window.getByLabel('Debt name').fill('Fictional Harbor Equipment Note');
    await window.getByLabel('Creditor').fill('Harbor Ridge Cooperative');
    await window.getByLabel('Owner or entity').fill('Generated Example Entity');
    await window.getByLabel('Debt type').selectOption('business');
    await window.getByLabel('Original principal').fill('125000.00');
    await window.getByLabel('Origination date').fill('2025-01-15');
    await window.getByLabel(/Maturity date/).fill('2030-01-15');
    await window.getByLabel('Minimum payment').fill('2450.00');
    await window.getByLabel('Tax category').selectOption('business');
    await window.getByLabel('Deductible percentage').fill('37.25');
    await window.getByLabel('Purpose').fill('Generated equipment acquisition');
    await window.getByLabel('Annual interest rate (%)').fill('5.49');
    await window.getByLabel('Required payment').fill('2450.00');
    await window.getByRole('button', { name: 'Create debt' }).click();

    await expect(
      window.getByRole('heading', { name: 'Fictional Harbor Equipment Note' }),
    ).toBeVisible();
    await expect(
      window.getByText('Debt and initial effective-dated terms were created.'),
    ).toBeVisible();
    await expect(window.getByText('$125,000.00')).toBeVisible();

    await window.getByRole('button', { name: 'Dashboard' }).click();
    await expect(window.getByRole('heading', { name: 'Debt overview' })).toBeVisible();
    await expect(window.getByText('Total active debt')).toBeVisible();
    await expect(window.getByText('$125,000.00')).toBeVisible();
    await window.getByRole('button', { name: 'Debts' }).click();
    await window.getByRole('button', { name: 'View' }).click();

    await window.getByRole('button', { name: 'Edit details' }).click();
    await window
      .getByLabel('Debt name')
      .fill('Updated Fictional Harbor Equipment Note');
    await window.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      window.getByRole('heading', {
        name: 'Updated Fictional Harbor Equipment Note',
      }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Add term period' }).click();
    await window.getByLabel('New effective start date').fill('2026-01-01');
    await window.getByLabel('Annual interest rate (%)').fill('5.75');
    await window.getByLabel('Required payment').fill('2500.00');
    await window.getByRole('button', { name: 'Add term period' }).click();
    await expect(
      window.getByText('A new effective-dated term period was added.'),
    ).toBeVisible();
    await expect(window.getByText('through 2025-12-31')).toBeVisible();
    await expect(window.getByText('5.75%')).toBeVisible();

    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await window.getByLabel('Transaction type').selectOption('payment');
    await window.getByLabel('Source type').selectOption('manual');
    await window.getByLabel('Effective date').fill('2026-01-15');
    await window.getByLabel('Posting date').fill('2026-01-16');
    await window.getByLabel('Total amount').fill('-500.00');
    await window.getByLabel('Source reference').fill('CHK-1001');
    await window.getByLabel('Description').fill('Generated payment.');
    await window.locator('[name="transaction.allocations.principal"]').fill('-400.00');
    await window.locator('[name="transaction.allocations.interest"]').fill('-100.00');
    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await expect(window.getByText('Posted transaction was recorded.')).toBeVisible();
    await expect(window.getByText('-$500.00')).toBeVisible();

    await window.getByRole('button', { name: 'Record snapshot' }).nth(0).click();
    await window.locator('[name="snapshot.effectiveDate"]').fill('2026-01-31');
    await window.locator('[name="snapshot.confirmedBalance"]').fill('124500.00');
    await window.locator('[name="snapshot.sourceType"]').selectOption('statement');
    await window.locator('[name="snapshot.sourceReference"]').fill('STAT-2026-01');
    await window
      .locator('[name="snapshot.notes"]')
      .fill('Generated statement balance.');
    await window.getByRole('button', { name: 'Record snapshot' }).nth(0).click();
    await expect(
      window.getByText('Confirmed balance snapshot was recorded.'),
    ).toBeVisible();
    await expect(window.getByText('$124,500.00')).toBeVisible();

    await window.getByRole('button', { name: 'Record reconciliation' }).nth(0).click();
    await window.locator('[name="reconciliation.statementDate"]').fill('2026-01-31');
    await window
      .locator('[name="reconciliation.statementEndingBalance"]')
      .fill('124500.00');
    await window
      .locator('[name="reconciliation.reconciliationStatus"]')
      .selectOption('reconciled');
    await window
      .locator('[name="reconciliation.sourceReference"]')
      .fill('STAT-2026-01');
    await window
      .locator('[name="reconciliation.explanation"]')
      .fill('Generated statement agrees to the ledger.');
    await window.getByRole('button', { name: 'Record reconciliation' }).nth(0).click();
    await expect(
      window.getByText('Balance reconciliation was recorded.'),
    ).toBeVisible();
    await expect(window.getByText('Reconciled')).toBeVisible();

    await window.getByRole('button', { name: 'Dashboard' }).click();
    await expect(window.getByText('Principal reduction YTD')).toBeVisible();
    await expect(window.getByText('$400.00')).toBeVisible();
    await expect(window.getByText('Interest activity YTD')).toBeVisible();
    await expect(window.getByText('-$100.00')).toBeVisible();
    await window.getByRole('button', { name: 'Debts' }).click();
    await window.getByRole('button', { name: 'View' }).click();

    await window.getByRole('button', { name: 'Reverse' }).click();
    await expect(
      window.getByRole('heading', { name: 'Reverse this transaction?' }),
    ).toBeVisible();
    await window
      .getByRole('dialog')
      .getByRole('button', { name: 'Reverse transaction', exact: true })
      .click();
    await expect(window.getByText('Transaction was reversed.')).toBeVisible();

    await window.getByRole('button', { name: 'Archive debt' }).click();
    await expect(
      window.getByRole('heading', { name: 'Archive this debt?' }),
    ).toBeVisible();
    await window
      .getByRole('dialog')
      .getByRole('button', { name: 'Archive debt', exact: true })
      .click();
    await expect(
      window.getByRole('heading', { name: 'No debts to display' }),
    ).toBeVisible();

    await window.getByRole('checkbox', { name: 'Include archived debts' }).check();
    await expect(
      window.getByText('Updated Fictional Harbor Equipment Note'),
    ).toBeVisible();
    await expect(window.getByText('Archived', { exact: true })).toBeVisible();
    await window.getByRole('button', { name: 'View' }).click();
    await window.getByRole('button', { name: 'Restore debt' }).click();
    await expect(
      window.getByRole('heading', { name: 'Restore this debt?' }),
    ).toBeVisible();
    await window
      .getByRole('dialog')
      .getByRole('button', { name: 'Restore debt', exact: true })
      .click();
    await expect(window.getByText('Debt was restored.')).toBeVisible();

    expect(existsSync(join(userDataDirectory, 'debt-tracker.sqlite3'))).toBe(true);
  } finally {
    await application.close();
    rmSync(userDataDirectory, { force: true, recursive: true });
  }
});
