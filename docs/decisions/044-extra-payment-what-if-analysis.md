# ADR 044: Extra Payment / What-If Analysis

Accepted for the Extra Payment / What-If Analysis feature.

The analysis is read-only and reuses the existing payoff projection engine. It
does not create transactions, saved scenarios, database records, or payment
schedule changes. Portfolio and individual-debt scope are represented by the
same eligible-debt input path.

Recurring extra payments begin on their selected effective date. A lump sum is
allocated using the selected existing payoff ordering and applied on its
selected date. The current required-payment projection remains the baseline;
current-versus-what-if metrics are derived from the two engine results. No
ledger classifications, transfer treatment, or balance calculations are
changed.
