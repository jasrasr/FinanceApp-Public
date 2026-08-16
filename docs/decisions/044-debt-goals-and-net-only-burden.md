# ADR 044: Debt goals use separate records and net-only burden inputs

- Status: Accepted
- Date: 2026-08-16

Debt milestones are planning records in `debt_goals`, separate from the debt
ledger and income events. A goal captures its starting calculated balance, while
current progress and projected dates are derived from the existing balance and
payoff engines. Creating, editing, or archiving a goal cannot post financial
activity.

Gross income remains stored for backward compatibility but is intentionally not
an active entry or debt-burden reporting input. Debt-service ratios use actual
net income events by month; a missing or zero denominator is unavailable rather
than zero.
