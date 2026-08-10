// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataHealth } from './data-health';
import type { DataHealthDto } from '../../../shared/debt-contracts';

const health: DataHealthDto = {
  effectiveDate: '2026-08-10',
  counts: { current: 1, review: 1, attention: 1 },
  rows: [
    {
      debtId: '00000000-0000-4000-8000-000000000001',
      debtName: 'Current Debt',
      creditor: 'Lender A',
      debtType: 'auto',
      status: 'current' as const,
      currentBalance: '100.00',
      effectiveDate: '2026-08-10',
      lastReconciliationDate: '2026-08-01',
      daysSinceReconciliation: 9,
      activitySinceLastReconciliation: 'No posted activity',
      reasons: [],
    },
    {
      debtId: '00000000-0000-4000-8000-000000000002',
      debtName: 'Attention Debt',
      creditor: 'Lender B',
      debtType: 'mortgage',
      status: 'attention' as const,
      currentBalance: '200.00',
      effectiveDate: '2026-08-10',
      lastReconciliationDate: null,
      daysSinceReconciliation: null,
      activitySinceLastReconciliation: 'No reconciliation yet',
      reasons: [{ code: 'never_reconciled' as const, label: 'Never reconciled' }],
    },
    {
      debtId: '00000000-0000-4000-8000-000000000003',
      debtName: 'Review Debt',
      creditor: 'Lender C',
      debtType: 'personal',
      status: 'review' as const,
      currentBalance: '300.00',
      effectiveDate: '2026-08-10',
      lastReconciliationDate: '2026-08-01',
      daysSinceReconciliation: 9,
      activitySinceLastReconciliation: '1 transaction (10.00)',
      reasons: [
        {
          code: 'activity_since_reconciliation' as const,
          label: 'Activity since last reconciliation',
        },
      ],
    },
  ],
};

describe('DataHealth', () => {
  it('shows summary counts, attention-first rows, concise reasons, and drill-through', () => {
    const onSelectDebt = vi.fn();
    const onAcceptCurrentBalance = vi.fn();
    render(
      <DataHealth
        health={health}
        onAcceptCurrentBalance={onAcceptCurrentBalance}
        onSelectDebt={onSelectDebt}
      />,
    );
    expect(screen.getByText('Attention Debt')).toBeVisible();
    expect(screen.getByText('Never reconciled')).toBeVisible();
    const debtButtons = screen.getAllByRole('button');
    fireEvent.click(
      debtButtons.find((button) => button.textContent === 'Attention Debt')!,
    );
    expect(onSelectDebt).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002');
    expect(screen.getAllByText('Accept current balance')).toHaveLength(2);
    fireEvent.click(screen.getAllByText('Accept current balance')[0]!);
    expect(screen.getByRole('dialog')).toHaveTextContent('Attention Debt');
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Accept current balance',
      }),
    );
    expect(onAcceptCurrentBalance).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000002',
    );
  });

  it('does not offer acceptance for configuration or integrity reasons', () => {
    const restrictedHealth: DataHealthDto = {
      ...health,
      counts: { current: 0, review: 1, attention: 0 },
      rows: [
        {
          ...health.rows[0]!,
          status: 'review',
          reasons: [
            { code: 'missing_due_day', label: 'Missing due day' },
            { code: 'data_integrity', label: 'Data integrity issue' },
          ],
        },
      ],
    };
    render(
      <DataHealth
        health={restrictedHealth}
        onAcceptCurrentBalance={vi.fn()}
        onSelectDebt={vi.fn()}
      />,
    );
    expect(screen.queryByText('Accept current balance')).toBeNull();
  });
});
