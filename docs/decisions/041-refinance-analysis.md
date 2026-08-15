# ADR 041: Read-only refinance analysis

Accepted for version 1.8.0.

Refinance analysis is a session-only, read-only comparison. The main process
uses the current application-calculated balance and the existing payoff engine
for both current and proposed terms. It does not create a debt, transaction,
term, refinance event, analysis record, or other persisted activity.

Cash closing costs are added to refinance cumulative cash outflow only.
Financed closing costs are added to proposed principal. Cash-out proceeds are
reported separately and are excluded from savings and break-even calculations.
