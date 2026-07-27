// @vitest-environment node

import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  APPLICATION_DATABASE_FILENAME,
  resolveApplicationDatabasePath,
} from './database-path';

describe('persistent application database location', () => {
  it('resolves under user data while remaining outside the repository', () => {
    const userData = resolve(tmpdir(), 'debt-tracker-generated-user-data');
    const result = resolveApplicationDatabasePath(userData, process.cwd());

    expect(result).toBe(join(userData, APPLICATION_DATABASE_FILENAME));
    expect(result.startsWith(process.cwd())).toBe(false);
  });

  it('rejects a user-data directory inside the repository', () => {
    expect(() =>
      resolveApplicationDatabasePath(
        resolve(process.cwd(), 'local-data'),
        process.cwd(),
      ),
    ).toThrow('must remain outside');
  });
});
