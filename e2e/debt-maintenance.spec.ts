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
    await expect(window.getByText('Version 0.16.0')).toBeVisible();
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
    await window.getByLabel('Debt name').fill('Fictional Harbor Mortgage Note');
    await window.getByLabel('Creditor').fill('Harbor Ridge Cooperative');
    await window.getByLabel('Debt type').selectOption('mortgage');
    await window.getByLabel('Original principal').fill('125000.00');
    await window.getByLabel('Origination date').fill('2020-01-15');
    await window.getByLabel(/Maturity date/).fill('2030-01-15');
    await window.getByLabel('Tax category').selectOption('mortgage_interest');
    await window.getByLabel('Deductible percentage').fill('37.25');
    await window.getByLabel('Purpose').fill('Generated home mortgage');
    await window.getByLabel('Annual interest rate (%)').fill('5.49');
    await window.getByLabel('Required payment').fill('2450.00');
    await window.getByRole('button', { name: 'Create debt' }).click();

    await expect(
      window.getByRole('heading', {
        name: 'Fictional Harbor Mortgage Note — Harbor Ridge Cooperative',
      }),
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
    await window
      .getByRole('button', { name: /Open Fictional Harbor Mortgage Note/ })
      .click();

    await window.getByRole('button', { name: 'Edit details' }).click();
    await window.getByLabel('Debt name').fill('Updated Fictional Harbor Mortgage Note');
    await window.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      window.getByRole('heading', {
        name: 'Updated Fictional Harbor Mortgage Note — Harbor Ridge Cooperative',
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
    await expect(window.getByText('5.75%')).toBeVisible();
    await expect(window.getByText('$2,500.00 Monthly')).toBeVisible();

    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await window.getByLabel('Transaction type').selectOption('payment');
    await window.getByLabel('Transaction date').fill('2021-06-01');
    await window.getByRole('textbox', { name: 'Amount' }).fill('1500.00');
    await window.locator('[name="transaction.allocations.principal"]').fill('1000.00');
    await window.locator('[name="transaction.allocations.interest"]').fill('200.00');
    await window.locator('[name="transaction.allocations.escrow"]').fill('300.00');
    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await expect(window.getByText('Posted transaction was recorded.')).toBeVisible();
    await window.getByRole('button', { name: 'Dashboard' }).click();
    await expect(window.getByText('Principal reduction YTD')).toBeVisible();
    await expect(window.getByText('Interest activity YTD')).toBeVisible();
    await expect(window.getByText('$0.00', { exact: true }).first()).toBeVisible();
    await window.getByRole('button', { name: 'Debts' }).click();
    await window
      .getByRole('button', {
        name: /Open Updated Fictional Harbor Mortgage Note/,
      })
      .click();

    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await window.getByLabel('Transaction type').selectOption('payment');
    await window.getByLabel('Transaction date').fill('2026-01-15');
    await window.getByRole('textbox', { name: 'Amount' }).fill('500.00');
    await window.locator('[name="transaction.allocations.principal"]').fill('400.00');
    await window.locator('[name="transaction.allocations.interest"]').fill('100.00');
    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await expect(window.getByText('Posted transaction was recorded.')).toBeVisible();
    await expect(window.getByText('$500.00', { exact: true })).toBeVisible();

    await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
    await window.locator('[name="reconciliation.statementDate"]').fill('2026-01-31');
    await window
      .locator('[name="reconciliation.statementEndingBalance"]')
      .fill('123600.00');
    await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
    await expect(
      window.getByText('Balance reconciliation was recorded.'),
    ).toBeVisible();
    await expect(window.getByText('Reconciled')).toBeVisible();
    await expect(
      window.getByRole('heading', { name: 'Confirmed balance snapshots' }),
    ).toHaveCount(0);

    await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
    await window.locator('[name="reconciliation.statementDate"]').fill('2026-02-01');
    await window
      .locator('[name="reconciliation.statementEndingBalance"]')
      .fill('123500.00');
    await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
    await expect(
      window.getByText('Balance reconciliation was recorded.'),
    ).toBeVisible();
    await expect(window.getByText('Exception')).toBeVisible();
    await window.getByRole('button', { name: 'Correct' }).last().click();
    await expect(
      window.getByText(/Correcting the current reconciliation/),
    ).toBeVisible();
    await window
      .locator('[name="reconciliation.statementEndingBalance"]')
      .fill('123600.00');
    await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
    await expect(
      window.getByText('Balance reconciliation was recorded.'),
    ).toBeVisible();
    await expect(window.getByText('Superseded')).toBeVisible();
    await expect(window.getByText('Reconciled').first()).toBeVisible();

    await window.getByRole('button', { name: 'Dashboard' }).click();
    await expect(window.getByText('Principal reduction YTD')).toBeVisible();
    await expect(window.getByText('$400.00')).toBeVisible();
    await expect(window.getByText('Interest activity YTD')).toBeVisible();
    await expect(window.getByText('$100.00', { exact: true })).toBeVisible();
    await expect(window.getByText('Current escrow balance')).toBeVisible();
    await expect(window.getByText('$300.00', { exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Escrow balances' })).toHaveCount(
      0,
    );

    await window.getByRole('button', { name: 'Debts' }).click();
    await window
      .getByRole('button', {
        name: /Open Updated Fictional Harbor Mortgage Note/,
      })
      .click();
    await window.getByRole('button', { name: 'Record escrow activity' }).click();
    await window.getByLabel('Transaction type').selectOption('payment');
    await window.getByLabel('Transaction date').fill('2026-02-01');
    await window.getByRole('textbox', { name: 'Amount' }).fill('1800.00');
    await window.locator('[name="transaction.allocations.principal"]').fill('1000.00');
    await window.locator('[name="transaction.allocations.interest"]').fill('500.00');
    await window.locator('[name="transaction.allocations.escrow"]').fill('300.00');
    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await expect(window.getByText('Posted transaction was recorded.')).toBeVisible();
    await expect(
      window.getByLabel('Core debt information').getByText('$600.00'),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Record escrow activity' }).click();
    await window.getByLabel('Transaction type').selectOption('escrow_disbursement');
    await window.getByLabel('Transaction date').fill('2026-02-15');
    await window.getByRole('textbox', { name: 'Amount' }).fill('125.00');
    await window
      .getByLabel('Description')
      .fill('Generated property tax escrow disbursement.');
    await window.locator('[name="transaction.allocations.escrow"]').fill('125.00');
    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await expect(window.getByText('Posted transaction was recorded.')).toBeVisible();
    await expect(
      window.getByLabel('Core debt information').getByText('$475.00'),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Payoff scenarios' }).click();
    await expect(
      window.getByRole('heading', { name: 'Projection and payoff scenarios' }),
    ).toBeVisible();
    await window.getByLabel('Scenario name').fill('Generated E2E Avalanche');
    await window.getByLabel('Scenario start date').fill('2026-07-28');
    await window.getByLabel('Extra monthly payment').fill('250.00');
    await window.getByRole('button', { name: 'Save scenario' }).click();
    await expect(window.getByText('Payoff scenario was saved.')).toBeVisible();
    await expect(window.getByText('Generated E2E Avalanche')).toBeVisible();
    await expect(window.getByText('Savings vs baseline')).toBeVisible();

    await window.getByRole('button', { name: 'Reports' }).click();
    await expect(window.getByRole('heading', { name: 'Debt reporting' })).toBeVisible();
    await expect(window.getByLabel('Date preset')).toBeVisible();
    await window.getByLabel('Date preset').selectOption('prior_year');
    await expect(window.getByLabel('Start date')).toHaveValue('2025-01-01');
    await window.getByLabel('Date preset').selectOption('last_12_months');
    await expect(window.getByText('Monthly debt rollforward')).toBeVisible();
    await expect(window.getByText('Debt balance history by obligation')).toBeVisible();
    await window.getByText('Monthly debt rollforward').click();
    await expect(
      window.getByText(/Application-calculated ledger balances/).first(),
    ).toBeVisible();
    await expect(
      window.getByText('Actual-versus-plan variance using saved payoff scenarios'),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Data management' }).click();
    await expect(
      window.getByRole('heading', { name: 'Backup, restore, and export' }),
    ).toBeVisible();
    await expect(window.getByText(/\\backups$/).first()).toBeVisible();
    await window.getByRole('button', { name: 'Create backup' }).click();
    await expect(
      window.getByText('Database backup was created and validated.'),
    ).toBeVisible();
    await expect(window.getByText(/manual-/).first()).toBeVisible();

    await window.getByRole('button', { name: 'Debts' }).click();
    await window
      .getByRole('button', {
        name: /Open Updated Fictional Harbor Mortgage Note/,
      })
      .click();

    await window.getByRole('button', { name: 'Reverse' }).first().click();
    await expect(
      window.getByRole('heading', { name: 'Reverse this transaction?' }),
    ).toBeVisible();
    await expect(window.getByLabel('Reversal date')).toHaveValue('2021-06-01');
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
      window.getByText('Updated Fictional Harbor Mortgage Note'),
    ).toBeVisible();
    await expect(window.getByText('Archived', { exact: true })).toBeVisible();
    await window
      .getByRole('button', {
        name: /Open Updated Fictional Harbor Mortgage Note/,
      })
      .click();
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
