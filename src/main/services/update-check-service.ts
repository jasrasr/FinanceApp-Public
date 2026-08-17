import type { UpdateCheckResultDto } from '../../shared/debt-contracts';
import type { DatabaseContext } from '../database/connection';

const LAST_CHECKED_SETTING_KEY = 'update_check_last_checked_at_utc';
const DISMISSED_VERSION_SETTING_KEY = 'update_check_dismissed_version';

interface UpdateCheckServiceDependencies {
  readonly getContext: () => DatabaseContext;
  readonly currentVersion: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly now?: () => string;
  readonly fetchImpl?: typeof fetch;
}

export interface UpdateCheckService {
  checkForUpdates(): Promise<UpdateCheckResultDto>;
  getCachedStatus(): UpdateCheckResultDto | null;
  dismiss(version: string): UpdateCheckResultDto | null;
}

const parseSemver = (value: string): readonly [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const isNewerVersion = (latest: string, current: string): boolean => {
  const latestParts = parseSemver(latest);
  const currentParts = parseSemver(current);
  if (!latestParts || !currentParts) return false;
  const [latestMajor, latestMinor, latestPatch] = latestParts;
  const [currentMajor, currentMinor, currentPatch] = currentParts;

  if (latestMajor !== currentMajor) return latestMajor > currentMajor;
  if (latestMinor !== currentMinor) return latestMinor > currentMinor;
  return latestPatch > currentPatch;
};

export const createUpdateCheckService = ({
  getContext,
  currentVersion,
  repoOwner,
  repoName,
  now = () => new Date().toISOString(),
  fetchImpl = fetch,
}: UpdateCheckServiceDependencies): UpdateCheckService => {
  let cachedResult: UpdateCheckResultDto | null = null;

  const setting = (key: string): string | null => {
    const row = getContext()
      .sqlite.prepare('select value from application_settings where key = ?')
      .get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  };

  const saveSetting = (key: string, value: string): void => {
    getContext()
      .sqlite.prepare(
        `insert into application_settings (key, value, updated_at_utc) values (?, ?, ?)
         on conflict(key) do update set value = excluded.value, updated_at_utc = excluded.updated_at_utc`,
      )
      .run(key, value, now());
  };

  const buildResult = (
    latestVersion: string | null,
    releaseUrl: string | null,
    checkFailed: boolean,
  ): UpdateCheckResultDto => {
    const dismissedVersion = setting(DISMISSED_VERSION_SETTING_KEY);
    const updateAvailable =
      latestVersion !== null &&
      isNewerVersion(latestVersion, currentVersion) &&
      latestVersion !== dismissedVersion;
    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl,
      checkedAtUtc: now(),
      checkFailed,
    };
  };

  return {
    checkForUpdates: async () => {
      try {
        const response = await fetchImpl(
          `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`,
          {
            headers: { Accept: 'application/vnd.github+json' },
            signal: AbortSignal.timeout(5_000),
          },
        );
        if (!response.ok) {
          cachedResult = buildResult(null, null, true);
          return cachedResult;
        }
        const payload = (await response.json()) as {
          tag_name?: unknown;
          html_url?: unknown;
        };
        const tagName = typeof payload.tag_name === 'string' ? payload.tag_name : null;
        const latestVersion = tagName ? tagName.replace(/^v/, '') : null;
        const releaseUrl = typeof payload.html_url === 'string' ? payload.html_url : null;
        cachedResult = buildResult(latestVersion, releaseUrl, latestVersion === null);
        saveSetting(LAST_CHECKED_SETTING_KEY, cachedResult.checkedAtUtc);
        return cachedResult;
      } catch {
        cachedResult = buildResult(null, null, true);
        return cachedResult;
      }
    },
    getCachedStatus: () => cachedResult,
    dismiss: (version) => {
      saveSetting(DISMISSED_VERSION_SETTING_KEY, version);
      if (cachedResult) {
        cachedResult = { ...cachedResult, updateAvailable: false };
      }
      return cachedResult;
    },
  };
};
