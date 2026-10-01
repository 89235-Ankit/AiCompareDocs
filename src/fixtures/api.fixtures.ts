import { test as base, request as playwrightRequest, APIRequestContext } from '@playwright/test';
import { JiraClient } from '../clients/jira.client';
import { ConfluenceClient } from '../clients/confluence.client';
import { env } from '../config/env.config';

/**
 * Custom Playwright fixtures that inject ready-to-use, authenticated API
 * clients into every test. Usage:
 *
 *   test('create issue', async ({ jira }) => { ... });
 *   test('create page',  async ({ confluence }) => { ... });
 */
interface ApiFixtures {
  apiContext: APIRequestContext;
  jira: JiraClient;
  confluence: ConfluenceClient;
}

export const test = base.extend<ApiFixtures>({
  // A single shared APIRequestContext per test with auth headers applied.
  apiContext: async ({}, use) => {
    const context = await playwrightRequest.newContext({
      extraHTTPHeaders: {
        Authorization: env.authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      ignoreHTTPSErrors: true,
    });
    await use(context);
    await context.dispose();
  },

  jira: async ({ apiContext }, use) => {
    await use(new JiraClient(apiContext));
  },

  confluence: async ({ apiContext }, use) => {
    await use(new ConfluenceClient(apiContext));
  },
});

export { expect } from '@playwright/test';
