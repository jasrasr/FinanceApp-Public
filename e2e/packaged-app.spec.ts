import { expect, test, _electron as electron, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const executablePath = process.env.DEBT_TRACKER_PACKAGED_EXE;
const currentFinancialDate = (): string => new Date().toISOString().slice(0, 10);
const escapedRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
      await expect(window.getByText('Version 0.21.0')).toBeVisible();
      await expect(window.getByText(/^Last changed: /)).toBeVisible();

      await window.getByRole('button', { name: 'Debts' }).click();
      await expect(
        window.getByRole('heading', { name: 'No debts to display' }),
      ).toBeVisible();

      await exercisePackagedHistoricalMortgageWorkflow(window);

      await window.getByRole('button', { name: 'Debts' }).click();
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
      expectHistoricalMortgageExportIntegrity(exportDirectory);

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

const exercisePackagedHistoricalMortgageWorkflow = async (
  window: Page,
): Promise<void> => {
  await createGeneratedMortgage(window);

  await window.getByRole('button', { name: 'Dashboard' }).click();
  await expect(window.getByText('Total active debt')).toBeVisible();
  await expectDashboardMetric(window, 'Total active debt', '$100,000.00');
  await expectDashboardBasisHidden(
    window,
    'Total active debt',
    '$100,000.00',
    /Application-calculated ledger balances for active debts/i,
  );

  await window.getByRole('button', { name: 'Debts' }).click();
  await window
    .getByRole('button', {
      name: /Open Packaged Historical Mortgage/,
    })
    .click();
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
  await expect(
    window.getByLabel('Core debt information').getByText('$300.00'),
  ).toBeVisible();

  await window.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(window.getByRole('heading', { name: 'Edit transaction' })).toBeVisible();
  await expect(window.getByRole('textbox', { name: 'Amount' })).toHaveValue('1500.00');
  await expect(
    window.locator('[name="transaction.allocations.principal"]'),
  ).toHaveValue('1000.00');
  await window.locator('[name="transaction.allocations.interest"]').fill('250.00');
  await expect(
    window.locator('[name="transaction.allocations.principal"]'),
  ).toHaveValue('950.00');
  await window.getByRole('button', { name: 'Save transaction edit' }).click();
  await expect(window.getByText('Transaction edit was saved.')).toBeVisible();

  await window.getByRole('button', { name: 'Dashboard' }).click();
  await expectDashboardMetric(window, 'Total active debt', '$99,050.00');
  await expectDashboardMetric(window, 'Principal reduction YTD', '$0.00');
  await expectDashboardMetric(window, 'Interest activity YTD', '$0.00');
  await expectDashboardMetric(window, 'Current escrow balance', '$300.00');
  await expect(window.getByRole('heading', { name: 'Escrow balances' })).toHaveCount(0);
  await expectDashboardBasisHidden(
    window,
    'Principal reduction YTD',
    '$0.00',
    new RegExp(
      `posted non-superseded activity dated ${escapedRegExp(currentFinancialDate().slice(0, 4))}-01-01 through ${escapedRegExp(currentFinancialDate())}`,
      'i',
    ),
  );

  await window.getByRole('button', { name: 'Debts' }).click();
  await window
    .getByRole('button', {
      name: /Open Packaged Historical Mortgage/,
    })
    .click();
  await window.getByRole('button', { name: 'Reverse' }).first().click();
  await expect(
    window.getByRole('heading', { name: 'Reverse this transaction?' }),
  ).toBeVisible();
  await expect(window.getByLabel('Reversal date')).toHaveValue('2021-06-01');
  await window.getByLabel('Reversal date').fill('2021-06-02');
  await window
    .getByRole('dialog')
    .getByRole('button', { name: 'Reverse transaction', exact: true })
    .click();
  await expect(window.getByText('Transaction was reversed.')).toBeVisible();
  await expect(
    window.getByLabel('Core debt information').getByText('$100,000.00'),
  ).toBeVisible();

  await window.getByRole('button', { name: 'Dashboard' }).click();
  await expectDashboardMetric(window, 'Total active debt', '$100,000.00');
  await expectDashboardMetric(window, 'Principal reduction YTD', '$0.00');
  await expectDashboardMetric(window, 'Interest activity YTD', '$0.00');
  await expectDashboardMetric(window, 'Current escrow balance', '$0.00');
  await expectDashboardBasisHidden(
    window,
    'Interest activity YTD',
    '$0.00',
    new RegExp(
      `dated ${escapedRegExp(currentFinancialDate().slice(0, 4))}-01-01 through ${escapedRegExp(currentFinancialDate())}`,
      'i',
    ),
  );

  await window.getByRole('button', { name: 'Debts' }).click();
  await window
    .getByRole('button', {
      name: /Open Packaged Historical Mortgage/,
    })
    .click();
  await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
  await window.locator('[name="reconciliation.statementDate"]').fill('2026-01-31');
  await window
    .locator('[name="reconciliation.statementEndingBalance"]')
    .fill('99999.00');
  await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
  await expect(window.getByText('Balance reconciliation was recorded.')).toBeVisible();
  await expect(window.getByText('Exception')).toBeVisible();

  await window.getByRole('button', { name: 'Correct' }).last().click();
  await expect(window.getByText(/Correcting the current reconciliation/)).toBeVisible();
  await window
    .locator('[name="reconciliation.statementEndingBalance"]')
    .fill('100000.00');
  await window.getByRole('button', { name: 'Reconcile balance' }).nth(0).click();
  await expect(window.getByText('Balance reconciliation was recorded.')).toBeVisible();
  await expect(
    window.getByLabel('Balance reconciliations').getByText('Superseded'),
  ).toBeVisible();
  await expect(window.getByText('Reconciled').first()).toBeVisible();

  await window.getByRole('button', { name: 'Dashboard' }).click();
  await expect(
    window.getByText(
      'No unreconciled, in-progress, or exception reconciliation items for active debts.',
    ),
  ).toBeVisible();
  await expect(window.getByText('Current escrow balance')).toBeVisible();
  await expect(window.getByRole('heading', { name: 'Escrow balances' })).toHaveCount(0);
};

const expectDashboardMetric = async (
  window: Page,
  label: string,
  value: string,
): Promise<void> => {
  await expect(
    window
      .getByText(label, { exact: true })
      .locator('xpath=ancestor::*[self::section or self::button][1]')
      .getByText(value, {
        exact: true,
      }),
  ).toBeVisible();
};

const expectDashboardBasisHidden = async (
  window: Page,
  label: string,
  value: string,
  basis: RegExp,
): Promise<void> => {
  const effectiveDate = currentFinancialDate();
  const accessibleName = `${label}: ${value} as of ${effectiveDate}`;
  const dashboard = window.locator('section[aria-labelledby="dashboard-heading"]');
  const card =
    label === 'Total active debt' || label === 'Current escrow balance'
      ? dashboard.getByRole('button', { name: accessibleName })
      : dashboard.getByRole('region', { name: accessibleName });

  await expect(card).toBeVisible();
  await expect(card).not.toHaveAccessibleName(basis);
  await expect(card.locator('.sr-only').filter({ hasText: basis })).toHaveCount(1);
  await expect(dashboard.locator('p').filter({ hasText: basis })).toHaveCount(0);
};

const createGeneratedMortgage = async (window: Page): Promise<void> => {
  const createFirstDebtButton = window.getByRole('button', {
    name: 'Create first debt',
  });
  const addDebtButton = window.getByRole('button', { name: 'Add debt' });
  if (await createFirstDebtButton.isVisible()) {
    await createFirstDebtButton.click();
  } else {
    await addDebtButton.click();
  }
  await window.getByLabel('Debt name').fill('Packaged Historical Mortgage');
  await window.getByLabel('Creditor').fill('Packaged Smoke Fictional Mortgage Co.');
  await window.getByLabel('Debt type').selectOption('mortgage');
  await window.getByLabel('Original principal').fill('100000.00');
  await window.getByLabel('Origination date').fill('2020-01-01');
  await window.getByLabel(/Maturity date/).fill('2035-01-01');
  await window.getByLabel('Tax category').selectOption('mortgage_interest');
  await window.getByLabel('Deductible percentage').fill('0');
  await window.getByLabel('Purpose').fill('Generated packaged historical workflow');
  await window.getByLabel('Annual interest rate (%)').fill('4.50');
  await window.getByLabel('Required payment').fill('1500.00');
  await window.getByRole('button', { name: 'Create debt' }).click();
  await expect(
    window.getByRole('heading', {
      name: 'Packaged Historical Mortgage — Packaged Smoke Fictional Mortgage Co.',
    }),
  ).toBeVisible();
};

const parseCsv = (content: string): Record<string, string>[] => {
  const lines = content.trim().split(/\r?\n/);
  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return [];
  const headers = headerLine.split(',');

  return dataLines.map((line) =>
    Object.fromEntries(
      line.split(',').map((value, index) => [headers[index] ?? '', value]),
    ),
  );
};

const expectHistoricalMortgageExportIntegrity = (exportDirectory: string): void => {
  const exportBatchDirectory = readdirSync(exportDirectory)
    .filter((entry) => entry.startsWith('debt-tracker-export-'))
    .sort()
    .at(-1);

  if (!exportBatchDirectory) {
    throw new Error('No generated export directory was found.');
  }

  const exportPath = join(exportDirectory, exportBatchDirectory);
  const debts = parseCsv(readFileSync(join(exportPath, 'actual-debts.csv'), 'utf8'));
  const historicalMortgage = debts.find(
    (debt) => debt.name === 'Packaged Historical Mortgage',
  );

  expect(historicalMortgage).toBeDefined();
  const historicalMortgageId = historicalMortgage?.id;

  if (!historicalMortgageId) {
    throw new Error('Generated historical mortgage export row is missing an id.');
  }

  const transactions = parseCsv(
    readFileSync(join(exportPath, 'actual-posted-transactions.csv'), 'utf8'),
  ).filter((transaction) => transaction.debt_id === historicalMortgageId);
  const transactionIds = new Set(
    transactions
      .map((transaction) => transaction.id)
      .filter((id): id is string => Boolean(id)),
  );
  const allocations = parseCsv(
    readFileSync(join(exportPath, 'actual-transaction-allocations.csv'), 'utf8'),
  ).filter(
    (allocation) =>
      allocation.transaction_id != null &&
      transactionIds.has(allocation.transaction_id),
  );

  const netByAllocationType = new Map<string, number>();
  for (const allocation of allocations) {
    if (!allocation.allocation_type || !allocation.amount_cents) {
      throw new Error('Generated allocation export row is missing required fields.');
    }

    netByAllocationType.set(
      allocation.allocation_type,
      (netByAllocationType.get(allocation.allocation_type) ?? 0) +
        Number(allocation.amount_cents),
    );
  }

  expect(
    transactions.find(
      (transaction) =>
        transaction.transaction_type === 'payment' &&
        transaction.status === 'superseded',
    ),
  ).toMatchObject({
    transaction_date: '2021-06-01',
    total_amount_cents: '-150000',
  });
  expect(
    transactions.find(
      (transaction) =>
        transaction.transaction_type === 'payment' && transaction.status === 'reversed',
    ),
  ).toMatchObject({
    transaction_date: '2021-06-01',
    total_amount_cents: '-150000',
  });
  expect(
    transactions.filter((transaction) => transaction.transaction_type === 'reversal'),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        transaction_date: '2021-06-01',
        total_amount_cents: '150000',
      }),
      expect.objectContaining({
        transaction_date: '2021-06-02',
        total_amount_cents: '150000',
      }),
    ]),
  );
  expect(netByAllocationType.get('principal')).toBe(0);
  expect(netByAllocationType.get('interest')).toBe(0);
  expect(netByAllocationType.get('escrow')).toBe(0);
};

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
  await expect(
    window.getByRole('heading', {
      name: `${name} — Packaged Smoke Fictional Credit Union`,
    }),
  ).toBeVisible();
};
