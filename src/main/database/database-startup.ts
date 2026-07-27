import type { DatabaseContext } from './connection';
import { openMigratedDatabase } from './connection';
import { resolveApplicationDatabasePath } from './database-path';

export interface ApplicationDatabaseOptions {
  readonly userDataDirectory: string;
  readonly applicationRootDirectory: string;
  readonly migrationsDirectory: string;
}

export const initializeApplicationDatabase = ({
  userDataDirectory,
  applicationRootDirectory,
  migrationsDirectory,
}: ApplicationDatabaseOptions): DatabaseContext =>
  openMigratedDatabase(
    resolveApplicationDatabasePath(userDataDirectory, applicationRootDirectory),
    migrationsDirectory,
  );
