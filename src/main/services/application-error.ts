import type { ApplicationError } from '../../shared/debt-contracts';

export class ApplicationServiceError extends Error {
  public readonly code: ApplicationError['code'];
  public readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;

  public constructor(
    code: ApplicationError['code'],
    message: string,
    fieldErrors?: Readonly<Record<string, readonly string[]>>,
  ) {
    super(message);
    this.name = 'ApplicationServiceError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
