import { isAbsolute, join, normalize } from 'node:path';

export const APPLICATION_DATABASE_FILENAME = 'debt-tracker.sqlite3';

export const resolveApplicationDatabasePath = (
  electronUserDataDirectory: string,
): string => {
  const normalizedDirectory = normalize(electronUserDataDirectory.trim());

  if (normalizedDirectory === '' || !isAbsolute(normalizedDirectory)) {
    throw new TypeError(
      'Electron user-data directory must be a nonempty absolute path.',
    );
  }

  return join(normalizedDirectory, APPLICATION_DATABASE_FILENAME);
};
