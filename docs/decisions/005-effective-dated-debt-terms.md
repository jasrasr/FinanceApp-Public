# ADR 005: Effective-Dated Debt Terms

## Status

Accepted

## Context

Rates, required payments, and calculation conventions can change. Overwriting a
single current value would destroy history and make prior calculations
unreproducible.

## Decision

Store debt terms as non-overlapping effective periods with a required start and
optional inclusive end. The database enforces unique start dates per debt and
period ordering; repository validation prevents overlaps.

## Consequences

- Historical rate periods remain available.
- Future changes are inserted as new terms.
- Consumers must select the term effective on the relevant financial date.
