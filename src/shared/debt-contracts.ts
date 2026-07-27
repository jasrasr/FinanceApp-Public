import { z } from 'zod';
import {
  DAY_COUNT_CONVENTIONS,
  DEBT_STATUSES,
  DEBT_TYPES,
  INTEREST_CALCULATION_CONVENTIONS,
  INTEREST_RATE_TYPES,
  PAYMENT_FREQUENCIES,
  TAX_CATEGORIES,
} from './debt-options';

const requiredTextSchema = z.string().trim().min(1).max(500);
const optionalTextSchema = z.string().trim().max(4_000).nullable();
const financialDateInputSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuidSchema = z.uuid();
const utcTimestampSchema = z.iso.datetime({ offset: false });

export const debtTermInputSchema = z
  .object({
    effectiveStartDate: financialDateInputSchema,
    interestRateType: z.enum(INTEREST_RATE_TYPES),
    annualInterestRatePercent: requiredTextSchema,
    dayCountConvention: z.enum(DAY_COUNT_CONVENTIONS),
    calculationConvention: z.enum(INTEREST_CALCULATION_CONVENTIONS),
    requiredPayment: requiredTextSchema,
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    notes: optionalTextSchema,
  })
  .strict();

export const debtCoreInputSchema = z
  .object({
    name: requiredTextSchema,
    creditor: requiredTextSchema,
    ownerEntity: requiredTextSchema,
    debtType: z.enum(DEBT_TYPES),
    purpose: requiredTextSchema,
    status: z.enum(DEBT_STATUSES),
    originalPrincipal: requiredTextSchema,
    originationDate: financialDateInputSchema,
    maturityDate: financialDateInputSchema.nullable(),
    minimumPayment: requiredTextSchema,
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    creditLimit: z.string().trim().max(100).nullable(),
    collateralDescription: optionalTextSchema,
    taxCategory: z.enum(TAX_CATEGORIES),
    deductiblePercentage: requiredTextSchema,
    notes: optionalTextSchema,
  })
  .strict();

export const createDebtRequestSchema = z
  .object({
    debt: debtCoreInputSchema,
    initialTerm: debtTermInputSchema,
  })
  .strict();

export const updateDebtRequestSchema = z
  .object({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    changes: debtCoreInputSchema
      .pick({
        name: true,
        creditor: true,
        ownerEntity: true,
        debtType: true,
        purpose: true,
        status: true,
        maturityDate: true,
        creditLimit: true,
        collateralDescription: true,
        taxCategory: true,
        deductiblePercentage: true,
        notes: true,
      })
      .strict(),
  })
  .strict();

export const addDebtTermRequestSchema = z
  .object({
    debtId: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    term: debtTermInputSchema,
  })
  .strict();

export const listDebtsRequestSchema = z
  .object({
    includeArchived: z.boolean(),
  })
  .strict();

export const getDebtRequestSchema = z.object({ id: uuidSchema }).strict();

export const archiveDebtRequestSchema = z
  .object({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    confirmed: z.literal(true),
  })
  .strict();

export const restoreDebtRequestSchema = archiveDebtRequestSchema;

export const debtTermDtoSchema = z
  .object({
    id: uuidSchema,
    effectiveStartDate: financialDateInputSchema,
    effectiveEndDate: financialDateInputSchema.nullable(),
    interestRateType: z.enum(INTEREST_RATE_TYPES),
    annualInterestRatePercent: z.string(),
    dayCountConvention: z.enum(DAY_COUNT_CONVENTIONS),
    calculationConvention: z.enum(INTEREST_CALCULATION_CONVENTIONS),
    requiredPayment: z.string(),
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    notes: z.string().nullable(),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const debtSummaryDtoSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    creditor: z.string(),
    ownerEntity: z.string(),
    debtType: z.enum(DEBT_TYPES),
    status: z.enum(DEBT_STATUSES),
    originalPrincipal: z.string(),
    originationDate: financialDateInputSchema,
    maturityDate: financialDateInputSchema.nullable(),
    initialTerm: debtTermDtoSchema,
    archivedAtUtc: utcTimestampSchema.nullable(),
  })
  .strict();

export const debtDetailDtoSchema = debtSummaryDtoSchema
  .omit({ initialTerm: true })
  .extend({
    purpose: z.string(),
    minimumPayment: z.string(),
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    creditLimit: z.string().nullable(),
    collateralDescription: z.string().nullable(),
    taxCategory: z.enum(TAX_CATEGORIES),
    deductiblePercentage: z.string(),
    notes: z.string().nullable(),
    terms: z.array(debtTermDtoSchema).min(1),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const applicationErrorSchema = z
  .object({
    code: z.enum([
      'validation',
      'not_found',
      'conflict',
      'database_unavailable',
      'forbidden',
      'internal',
    ]),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .strict();

export const applicationResultSchema = <T extends z.ZodType>(valueSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value: valueSchema }).strict(),
    z.object({ ok: z.literal(false), error: applicationErrorSchema }).strict(),
  ]);

export const debtSummaryListSchema = z.array(debtSummaryDtoSchema);
export const debtListResultSchema = applicationResultSchema(debtSummaryListSchema);
export const debtDetailResultSchema = applicationResultSchema(debtDetailDtoSchema);

export type CreateDebtRequest = z.infer<typeof createDebtRequestSchema>;
export type DebtCoreInput = z.infer<typeof debtCoreInputSchema>;
export type DebtTermInput = z.infer<typeof debtTermInputSchema>;
export type UpdateDebtRequest = z.infer<typeof updateDebtRequestSchema>;
export type AddDebtTermRequest = z.infer<typeof addDebtTermRequestSchema>;
export type ListDebtsRequest = z.infer<typeof listDebtsRequestSchema>;
export type GetDebtRequest = z.infer<typeof getDebtRequestSchema>;
export type ArchiveDebtRequest = z.infer<typeof archiveDebtRequestSchema>;
export type RestoreDebtRequest = z.infer<typeof restoreDebtRequestSchema>;
export type DebtTermDto = z.infer<typeof debtTermDtoSchema>;
export type DebtSummaryDto = z.infer<typeof debtSummaryDtoSchema>;
export type DebtDetailDto = z.infer<typeof debtDetailDtoSchema>;
export type ApplicationError = z.infer<typeof applicationErrorSchema>;
export type ApplicationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApplicationError };
