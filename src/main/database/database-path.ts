import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

export const APPLICATION_DATABASE_FILENAME = 'debt-tracker.sqlite3';

export const resolveApplicationDatabasePath = (
  electronUserDataDirectory: string,
  applicationRootDirectory?: string,
): string => {
  const normalizedDirectory = normalize(electronUserDataDirectory.trim());

  if (normalizedDirectory === '' || !isAbsolute(normalizedDirectory)) {
    throw new TypeError(
      'Electron user-data directory must be a nonempty absolute path.',
    );
  }

  if (applicationRootDirectory) {
    const applicationRoot = resolve(applicationRootDirectory);
    const relativeToApplication = relative(
      applicationRoot,
      resolve(normalizedDirectory),
    );
    const isInsideApplication =
      relativeToApplication === '' ||
      (!relativeToApplication.startsWith('..') && !isAbsolute(relativeToApplication));

    if (isInsideApplication) {
      throw new TypeError(
        'Electron user-data directory must remain outside the application repository.',
      );
    }
  }

  return join(normalizedDirectory, APPLICATION_DATABASE_FILENAME);
};
