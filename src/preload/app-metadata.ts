import { appMetadataDtoSchema, type AppMetadataDto } from '../shared/debt-contracts';
import packageMetadata from '../../package.json';

const deterministicValidationMetadata = {
  version: packageMetadata.version,
  lastChangedAtUtc: '2026-08-15T00:00:00.000Z',
} as const;

const importMeta = import.meta as ImportMeta & {
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export const appMetadata: AppMetadataDto = appMetadataDtoSchema.parse({
  version:
    importMeta.env?.VITE_DEBT_TRACKER_APP_VERSION ??
    deterministicValidationMetadata.version,
  lastChangedAtUtc:
    importMeta.env?.VITE_DEBT_TRACKER_LAST_CHANGED_AT_UTC ??
    deterministicValidationMetadata.lastChangedAtUtc,
});
