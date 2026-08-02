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
    await expect(window.getByText('Version 1.1.0')).toBeVisible();
    await expect(window.getByText(/^Last changed: /)).toBeVisible();
    await expect(window.getByRole('button', { name: 'Workbook import' })).toHaveCount(
      0,
    );
    await expect(
      window.getByRole('heading', { name: 'No active debts to summarize' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Debts', exact: true }).click();
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
    await window.getByLabel('Payment due day').fill('15');
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
    await expect(window.getByText('Day 15')).toBeVisible();

    await window.getByRole('button', { name: 'Dashboard' }).click();
    await expect(window.getByRole('heading', { name: 'Debt overview' })).toBeVisible();
    await expect(window.getByText('Total active debt')).toBeVisible();
    await expect(window.getByText('$125,000.00')).toBeVisible();
    await expect(
      window.getByRole('heading', { name: 'Upcoming payments' }),
    ).toBeVisible();
    await expect(window.getByText('Remaining due')).toBeVisible();
    await window.getByRole('button', { name: 'Debts', exact: true }).click();
    await window
      .getByRole('button', { name: /Open Fictional Harbor Mortgage Note/ })
      .click();

    await window.getByRole('button', { name: 'Edit details' }).click();
    await window.getByLabel('Debt name').fill('Updated Fictional Harbor Mortgage Note');
    await window.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      window.getByRole('heading', {
        name: 'Updated Fictional Harbor Mortgage Note',
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
    await window.locator('[name="transaction.allocations.interest"]').fill('200.00');
    await window.locator('[name="transaction.allocations.escrow"]').fill('300.00');
    await expect(
      window.locator('[name="transaction.allocations.principal"]'),
    ).toHaveValue('1000.00');
    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await expect(window.getByText('Posted transaction was recorded.')).toBeVisible();
    await window.getByRole('button', { name: 'Dashboard' }).click();
    await expect(window.getByText('Principal reduction YTD')).toBeVisible();
    await expect(window.getByText('Interest activity YTD')).toBeVisible();
    await expect(window.getByText('$0.00', { exact: true }).first()).toBeVisible();
    await window.getByRole('button', { name: 'Debts', exact: true }).click();
    await window
      .getByRole('button', {
        name: /Open Updated Fictional Harbor Mortgage Note/,
      })
      .click();

    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await window.getByLabel('Transaction type').selectOption('payment');
    await window.getByLabel('Transaction date').fill('2026-01-15');
    await window.getByRole('textbox', { name: 'Amount' }).fill('500.00');
    await window.locator('[name="transaction.allocations.interest"]').fill('100.00');
    await expect(
      window.locator('[name="transaction.allocations.principal"]'),
    ).toHaveValue('400.00');
    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await expect(window.getByText('Posted transaction was recorded.')).toBeVisible();
    await expect(
      window.locator('tr', { hasText: '2026-01-15' }).getByText('$500.00').first(),
    ).toBeVisible();

    await window
      .locator('tr', { hasText: '2026-01-15' })
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    await expect(
      window.getByRole('heading', { name: 'Edit transaction' }),
    ).toBeVisible();
    await expect(window.getByRole('textbox', { name: 'Amount' })).toHaveValue('500.00');
    await expect(
      window.locator('[name="transaction.allocations.principal"]'),
    ).toHaveValue('400.00');
    await window.locator('[name="transaction.allocations.interest"]').fill('50.00');
    await expect(
      window.locator('[name="transaction.allocations.principal"]'),
    ).toHaveValue('450.00');
    await window.getByRole('button', { name: 'Save transaction edit' }).click();
    await expect(window.getByText('Transaction edit was saved.')).toBeVisible();

    await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
    await window.locator('[name="reconciliation.statementDate"]').fill('2026-01-31');
    await window
      .locator('[name="reconciliation.statementEndingBalance"]')
      .fill('123550.00');
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
      .fill('123450.00');
    await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
    await expect(
      window.getByText(
        /Verified lender balance .* calculated ledger balance .* difference/,
      ),
    ).toBeVisible();
    await window
      .locator('[name="reconciliation.statementEndingBalance"]')
      .fill('123550.00');
    await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
    await expect(
      window.getByText('Balance reconciliation was recorded.'),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Correct' }).last().click();
    await expect(
      window.getByRole('heading', { name: 'Reconcile balance' }),
    ).toBeVisible();
    await window
      .locator('[name="reconciliation.statementEndingBalance"]')
      .fill('123550.00');
    await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
    await expect(
      window.getByText('Balance reconciliation was recorded.'),
    ).toBeVisible();
    await window.getByText('View reconciliation audit history').click();
    await expect(
      window
        .getByLabel('Balance reconciliations')
        .getByText('Superseded', { exact: true }),
    ).toBeVisible();
    await expect(window.getByText('Reconciled').first()).toBeVisible();

    await window.getByRole('button', { name: 'Dashboard' }).click();
    await expect(window.getByText('Principal reduction YTD')).toBeVisible();
    await expect(
      window.getByRole('region', { name: /Principal reduction YTD: \$450\.00/ }),
    ).toBeVisible();
    await expect(window.getByText('Interest activity YTD')).toBeVisible();
    await expect(window.getByText('$50.00', { exact: true })).toBeVisible();
    await expect(window.getByText('Current escrow balance')).toBeVisible();
    await expect(window.getByText('$300.00', { exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Escrow balances' })).toHaveCount(
      0,
    );
    await window
      .getByRole('button', { name: /Current escrow balance: \$300\.00/ })
      .click();
    await expect(
      window.getByRole('heading', { name: 'Escrow balances and activity' }),
    ).toBeVisible();
    await window
      .getByLabel('Escrow activity type')
      .selectOption('homeowners_insurance');
    await window.getByLabel('Transaction date').fill('2026-02-10');
    await window.getByLabel('Amount').fill('50.00');
    await window.getByRole('button', { name: 'Record escrow activity' }).click();
    await expect(window.getByText('Escrow activity was recorded.')).toBeVisible();
    await expect(window.getByText('$250.00').first()).toBeVisible();
    await expect(
      window.getByRole('cell', { name: 'Homeowners insurance payment' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Debts', exact: true }).click();
    await window
      .getByRole('button', {
        name: /Open Updated Fictional Harbor Mortgage Note/,
      })
      .click();
    await window.getByRole('button', { name: 'Record escrow activity' }).click();
    await window.getByLabel('Transaction type').selectOption('payment');
    await window.getByLabel('Transaction date').fill('2026-02-01');
    await window.getByRole('textbox', { name: 'Amount' }).fill('1800.00');
    await window.locator('[name="transaction.allocations.interest"]').fill('500.00');
    await window.locator('[name="transaction.allocations.escrow"]').fill('300.00');
    await expect(
      window.locator('[name="transaction.allocations.principal"]'),
    ).toHaveValue('1000.00');
    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await expect(window.getByText('Posted transaction was recorded.')).toBeVisible();
    await expect(
      window.getByLabel('Core debt information').getByText('$550.00'),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Record escrow activity' }).click();
    await window.getByLabel('Transaction type').selectOption('escrow_disbursement');
    await window.getByLabel('Transaction date').fill('2026-02-15');
    await window.getByRole('textbox', { name: 'Amount' }).fill('125.00');
    await window.locator('[name="transaction.allocations.escrow"]').fill('125.00');
    await window.getByRole('button', { name: 'Record transaction' }).nth(0).click();
    await expect(window.getByText('Posted transaction was recorded.')).toBeVisible();
    await expect(
      window.getByLabel('Core debt information').getByText('$425.00'),
    ).toBeVisible();
    await window
      .locator('tr', { hasText: '2026-02-15' })
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    await expect(
      window.getByRole('heading', { name: 'Edit transaction' }),
    ).toBeVisible();
    await window.getByRole('textbox', { name: 'Amount' }).fill('100.00');
    await window.locator('[name="transaction.allocations.escrow"]').fill('100.00');
    await window.getByRole('button', { name: 'Save transaction edit' }).click();
    await expect(window.getByText('Transaction edit was saved.')).toBeVisible();
    await expect(
      window.getByLabel('Core debt information').getByText('$450.00'),
    ).toBeVisible();
    await window
      .locator('tr', { hasText: '2026-02-15' })
      .getByRole('button', { name: 'Void', exact: true })
      .click();
    await expect(
      window.getByRole('heading', { name: 'Void this transaction?' }),
    ).toBeVisible();
    await window.getByLabel('Void date').fill('2026-02-15');
    await window.getByRole('button', { name: 'Void transaction', exact: true }).click();
    await expect(window.getByText('Transaction was voided.')).toBeVisible();
    await expect(
      window.getByLabel('Core debt information').getByText('$550.00'),
    ).toBeVisible();
    await window.getByText('View audit history').click();
    await expect(window.getByText('Voided original')).toBeVisible();

    await window.getByRole('button', { name: 'Payoff scenarios' }).click();
    await expect(
      window.getByRole('heading', { name: 'Projection and payoff scenarios' }),
    ).toBeVisible();
    await window.getByLabel('Scenario name').fill('Generated E2E Avalanche');
    await window.getByLabel('Scenario start date').fill('2026-07-28');
    await window.getByLabel('Extra monthly payment').fill('250.00');
    await window.getByRole('button', { name: 'Save scenario' }).click();
    await expect(window.getByText('Payoff scenario was saved.')).toBeVisible();
    await expect(
      window.getByRole('heading', { name: 'Generated E2E Avalanche' }),
    ).toBeVisible();
    await expect(window.getByText('Savings vs baseline')).toBeVisible();

    await window.getByRole('button', { name: 'Reports' }).click();
    await expect(window.getByRole('heading', { name: 'Debt reporting' })).toBeVisible();
    await expect(window.getByLabel('Date preset')).toBeVisible();
    await window.getByLabel('Date preset').selectOption('prior_year');
    await expect(window.getByLabel('Start date')).toHaveValue('2025-01-01');
    await window.getByLabel('Date preset').selectOption('all_activity');
    await expect(window.getByLabel('Start date')).toHaveValue('2019-01-01');
    await window.getByLabel('Start date').fill('2018-12-31');
    await expect(window.getByLabel('Start date')).toHaveValue('2019-01-01');
    await window.getByLabel('Date preset').selectOption('last_12_months');
    await expect(window.getByText('Monthly debt rollforward')).toBeVisible();
    await expect(window.getByText('Debt balance history by obligation')).toBeVisible();
    await window.getByText('Monthly debt rollforward').click();
    await expect(
      window.getByRole('columnheader', { name: 'Cash payments' }).first(),
    ).toBeVisible();
    await expect(
      window.getByRole('columnheader', { name: 'Principal adjustments' }).first(),
    ).toBeVisible();
    await expect(
      window.getByRole('columnheader', { name: 'Check' }).first(),
    ).toBeVisible();
    await expect(window.getByText('Actual-versus-plan variance')).toHaveCount(0);
    await expect(window.getByText('Interest-rate sensitivity')).toHaveCount(0);
    await expect(window.getByText('Debt balance trend')).toHaveCount(0);
    await window.getByText('Debt balance history by obligation').click();
    await expect(
      window.getByRole('img', {
        name: /Line chart of debt balance history/i,
      }),
    ).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Total debt balance' }),
    ).toBeVisible();
    const chart = window.getByTestId('balance-history-chart');
    const beforeZoom = await window.getByTestId('balance-history-zoom').textContent();
    const chartWheelPrevented = await chart.evaluate((element) => {
      const event = new WheelEvent('wheel', { cancelable: true, deltaY: -100 });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(chartWheelPrevented).toBe(true);
    await expect(window.getByTestId('balance-history-zoom')).not.toHaveText(
      beforeZoom ?? '',
    );
    const beforePan = await window.getByTestId('balance-history-zoom').textContent();
    const panPrevented = await chart.evaluate((element) => {
      const event = new WheelEvent('wheel', {
        cancelable: true,
        deltaY: -100,
        shiftKey: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(panPrevented).toBe(true);
    await expect(window.getByTestId('balance-history-zoom')).not.toHaveText(
      beforePan ?? '',
    );
    await window.getByRole('button', { name: 'Next period' }).click();
    await expect(window.getByTestId('balance-history-zoom')).toHaveText(
      beforePan ?? '',
    );
    const outsideWheelPrevented = await window.locator('body').evaluate((element) => {
      const event = new WheelEvent('wheel', { cancelable: true, deltaY: -100 });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(outsideWheelPrevented).toBe(false);
    await expect(window.getByText('View chart data').first()).toBeVisible();
    const balanceLegend = window.locator(
      '[aria-label="Debt balance history chart controls"]',
    );
    await balanceLegend.getByRole('button', { name: 'Select none' }).click();
    await expect(
      balanceLegend.getByRole('button', { name: 'Select all' }),
    ).toBeVisible();
    await balanceLegend.getByRole('button', { name: 'Select all' }).click();
    await expect(
      balanceLegend.getByRole('button', { name: 'Select none' }),
    ).toBeVisible();
    await balanceLegend.getByRole('button', { name: 'Total debt balance' }).click();
    await balanceLegend
      .getByRole('button', {
        name: 'Updated Fictional Harbor Mortgage Note',
      })
      .click();
    await expect(window.getByText(/No debt lines are selected/)).toBeVisible();
    await balanceLegend.getByRole('button', { name: 'Total debt balance' }).click();
    await window.getByRole('button', { name: 'Reset zoom' }).click();
    await window.getByText('Interest expense analysis').click();
    await expect(
      window.getByText('Monthly interest expense by month and year'),
    ).toBeVisible();
    await expect(
      window.getByRole('radio', { name: 'Chronological trend' }),
    ).toHaveCount(0);
    await expect(
      window.getByRole('img', {
        name: /Grouped bar chart comparing monthly interest expense across years/i,
      }),
    ).toBeVisible();
    await expect(
      window.getByRole('img', { name: /Bar chart of annual interest expense/i }),
    ).toBeVisible();
    await expect(
      window.getByRole('radio', { name: 'Compare months across years' }),
    ).toHaveCount(0);

    await window.getByRole('button', { name: 'Data management' }).click();
    await expect(
      window.getByRole('heading', { name: 'Backup, restore, and export' }),
    ).toBeVisible();
    await expect(window.getByText(/\\backups$/).first()).toBeVisible();
    await window.getByRole('button', { name: 'Create backup' }).click();
    await expect(
      window.getByText('Database backup was created and validated.'),
    ).toBeVisible();
    await window.getByText('Filename').first().click();
    await expect(window.getByText(/manual-/).first()).toBeVisible();

    await window.getByRole('button', { name: 'Debts', exact: true }).click();
    await window
      .getByRole('button', {
        name: /Open Updated Fictional Harbor Mortgage Note/,
      })
      .click();

    await window.getByRole('button', { name: 'Reverse' }).first().click();
    await expect(
      window.getByRole('heading', { name: 'Reverse this transaction?' }),
    ).toBeVisible();
    await expect(window.getByLabel('Reversal date')).toHaveValue('2026-02-10');
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

    await window.getByRole('button', { name: 'Record refinance' }).click();
    await expect(
      window.getByRole('heading', { name: 'Record refinance' }),
    ).toBeVisible();
    await window.getByLabel(/Refinance date/).fill('2026-03-01');
    await window.getByLabel(/New refinanced principal balance/).fill('124000.00');
    await window.getByLabel(/New annual interest rate/).fill('4.99');
    await window.getByLabel(/New required payment/).fill('2150.00');
    await window.getByLabel(/New maturity date/).fill('2056-03-01');
    await window.getByLabel(/Refinance fees financed into loan/).fill('2500.00');
    await window.getByLabel(/Refinance fees paid in cash/).fill('750.00');
    await window
      .locator('form')
      .getByRole('button', { name: 'Record refinance' })
      .click();
    await expect(
      window.getByText('Refinance was recorded on this debt.'),
    ).toBeVisible();
    await expect(
      window.getByRole('heading', { name: 'Refinance history' }),
    ).toBeVisible();
    await expect(window.getByText('$2,500.00')).toBeVisible();

    await window.getByRole('button', { name: 'Delete debt permanently' }).click();
    const deleteDialog = window.getByRole('dialog', {
      name: 'Delete debt permanently?',
    });
    await expect(
      deleteDialog.getByText('Updated Fictional Harbor Mortgage Note'),
    ).toBeVisible();
    await expect(
      deleteDialog.getByText('Related records that will be deleted'),
    ).toBeVisible();
    await expect(
      deleteDialog.getByText('Required immediate backup status'),
    ).toBeVisible();
    await deleteDialog
      .getByLabel('Type the debt name to confirm')
      .fill('Updated Fictional Harbor Mortgage Note');
    await deleteDialog
      .getByLabel(
        'I understand this cannot be undone except by restoring the validated backup.',
      )
      .check();
    await deleteDialog
      .getByRole('button', { name: 'Delete debt permanently', exact: true })
      .click();
    await expect(
      window.getByText(/Debt was permanently deleted after validated backup/),
    ).toBeVisible();
    await expect(
      window.getByRole('heading', { name: 'No debts to display' }),
    ).toBeVisible();

    expect(existsSync(join(userDataDirectory, 'debt-tracker.sqlite3'))).toBe(true);
  } finally {
    await application.close();
    rmSync(userDataDirectory, { force: true, recursive: true });
  }
});
