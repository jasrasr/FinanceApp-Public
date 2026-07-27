import { defineConfig } from '@playwright/test';

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  outputDir: 'test-results',
  reporter: 'line',
  retries: 0,
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
});
