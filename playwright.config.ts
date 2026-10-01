import { defineConfig } from '@playwright/test';
import { env } from './src/config/env.config';

/**
 * Playwright configuration tuned for pure API testing.
 * No browsers are launched — the APIRequestContext is used directly.
 * See: https://playwright.dev/docs/test-api-testing
 */
export default defineConfig({
  testDir: './tests',
  /* Run all tests in files in parallel. */
  fullyParallel: true,
  /* Fail the build on CI if test.only is left in the source. */
  forbidOnly: !!process.env.CI,
  /* Retry flaky network calls on CI. */
  retries: process.env.CI ? 2 : 0,
  /* Limit workers on CI to avoid Atlassian rate limiting. */
  workers: process.env.CI ? 2 : undefined,
  /* Global timeout per test. */
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  /* Reporters: list for the console, HTML for a browsable report, JUnit for CI. */
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    /* Default base URL — individual clients override per Atlassian product. */
    baseURL: env.baseUrl,
    extraHTTPHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    /* Capture API call traces on first retry for debugging. */
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'jira',
      testDir: './tests/jira',
    },
    {
      name: 'confluence',
      testDir: './tests/confluence',
    },
  ],
});
