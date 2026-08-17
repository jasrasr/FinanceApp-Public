import BetterSqlite3 from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { DatabaseContext } from '../database/connection';
import { createUpdateCheckService } from './update-check-service';

const createContext = (): DatabaseContext => {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.exec(
    `create table application_settings (
       key text primary key,
       value text not null,
       updated_at_utc text not null
     )`,
  );
  return {
    sqlite,
    database: undefined as unknown as DatabaseContext['database'],
    close: () => sqlite.close(),
  };
};

const jsonResponse = (
  body: unknown,
  ok = true,
): { ok: boolean; json: () => Promise<unknown> } => ({
  ok,
  json: async () => body,
});

describe('update-check service', () => {
  it('reports an available update when the latest release tag is newer', async () => {
    const context = createContext();
    const fetchImpl = (async () =>
      jsonResponse({
        tag_name: 'v1.12.0',
        html_url: 'https://github.com/jasrasr/financeApp-public/releases/tag/v1.12.0',
      })) as unknown as typeof fetch;
    const service = createUpdateCheckService({
      getContext: () => context,
      currentVersion: '1.11.1',
      repoOwner: 'jasrasr',
      repoName: 'financeApp-public',
      now: () => '2026-08-16T00:00:00.000Z',
      fetchImpl,
    });

    const result = await service.checkForUpdates();

    expect(result).toEqual({
      currentVersion: '1.11.1',
      latestVersion: '1.12.0',
      updateAvailable: true,
      releaseUrl: 'https://github.com/jasrasr/financeApp-public/releases/tag/v1.12.0',
      checkedAtUtc: '2026-08-16T00:00:00.000Z',
      checkFailed: false,
    });
  });

  it('reports no update available when already on the latest version', async () => {
    const context = createContext();
    const service = createUpdateCheckService({
      getContext: () => context,
      currentVersion: '1.12.0',
      repoOwner: 'jasrasr',
      repoName: 'financeApp-public',
      now: () => '2026-08-16T00:00:00.000Z',
      fetchImpl: (async () =>
        jsonResponse({
          tag_name: 'v1.12.0',
          html_url: 'https://github.com/jasrasr/financeApp-public/releases/tag/v1.12.0',
        })) as unknown as typeof fetch,
    });

    const result = await service.checkForUpdates();

    expect(result.updateAvailable).toBe(false);
    expect(result.checkFailed).toBe(false);
  });

  it('marks the check as failed on a non-ok HTTP response', async () => {
    const context = createContext();
    const service = createUpdateCheckService({
      getContext: () => context,
      currentVersion: '1.11.1',
      repoOwner: 'jasrasr',
      repoName: 'financeApp-public',
      fetchImpl: (async () => jsonResponse({}, false)) as unknown as typeof fetch,
    });

    const result = await service.checkForUpdates();

    expect(result).toMatchObject({
      checkFailed: true,
      updateAvailable: false,
      latestVersion: null,
    });
  });

  it('marks the check as failed on a malformed response body', async () => {
    const context = createContext();
    const service = createUpdateCheckService({
      getContext: () => context,
      currentVersion: '1.11.1',
      repoOwner: 'jasrasr',
      repoName: 'financeApp-public',
      fetchImpl: (async () =>
        jsonResponse({ unexpected: true })) as unknown as typeof fetch,
    });

    const result = await service.checkForUpdates();

    expect(result.checkFailed).toBe(true);
    expect(result.latestVersion).toBeNull();
  });

  it('marks the check as failed when the network request throws', async () => {
    const context = createContext();
    const service = createUpdateCheckService({
      getContext: () => context,
      currentVersion: '1.11.1',
      repoOwner: 'jasrasr',
      repoName: 'financeApp-public',
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });

    const result = await service.checkForUpdates();

    expect(result.checkFailed).toBe(true);
    expect(result.updateAvailable).toBe(false);
  });

  it('suppresses a dismissed version until a newer release is published', async () => {
    const context = createContext();
    let latestTag = 'v1.12.0';
    const service = createUpdateCheckService({
      getContext: () => context,
      currentVersion: '1.11.1',
      repoOwner: 'jasrasr',
      repoName: 'financeApp-public',
      fetchImpl: (async () =>
        jsonResponse({
          tag_name: latestTag,
          html_url: `https://github.com/jasrasr/financeApp-public/releases/tag/${latestTag}`,
        })) as unknown as typeof fetch,
    });

    const firstResult = await service.checkForUpdates();
    expect(firstResult.updateAvailable).toBe(true);

    const afterDismiss = service.dismiss('1.12.0');
    expect(afterDismiss?.updateAvailable).toBe(false);

    const recheckSameVersion = await service.checkForUpdates();
    expect(recheckSameVersion.updateAvailable).toBe(false);

    latestTag = 'v1.13.0';
    const recheckNewerVersion = await service.checkForUpdates();
    expect(recheckNewerVersion.updateAvailable).toBe(true);
    expect(recheckNewerVersion.latestVersion).toBe('1.13.0');
  });

  it('returns the cached status without making another network request', async () => {
    const context = createContext();
    let callCount = 0;
    const service = createUpdateCheckService({
      getContext: () => context,
      currentVersion: '1.11.1',
      repoOwner: 'jasrasr',
      repoName: 'financeApp-public',
      fetchImpl: (async () => {
        callCount += 1;
        return jsonResponse({ tag_name: 'v1.12.0', html_url: null });
      }) as unknown as typeof fetch,
    });

    expect(service.getCachedStatus()).toBeNull();
    await service.checkForUpdates();
    expect(callCount).toBe(1);
    expect(service.getCachedStatus()?.latestVersion).toBe('1.12.0');
  });
});
