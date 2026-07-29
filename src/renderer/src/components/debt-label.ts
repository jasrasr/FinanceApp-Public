export const combinedDebtLabel = ({
  creditor,
  name,
}: {
  readonly creditor: string;
  readonly name: string;
}): string => `${name} — ${creditor}`;
