# ADR 003: Money and Interest-Rate Storage

## Status

Accepted

## Context

Binary floating-point storage can introduce rounding differences that are
unacceptable for accounting records.

## Decision

Store money as safe-integer cents. Convert decimal strings with
half-away-from-zero rounding at input boundaries.

Store annual rates as integer millionths of the decimal annual rate. Thus,
`5.49%` is `54,900`. Store deductible percentages in basis points, where `100%`
is `10,000`.

## Consequences

- Stored money and rates are exact integers.
- UI formatting is a boundary concern.
- Future financial calculations must operate on integer or rational values and
  document any rounding points.
