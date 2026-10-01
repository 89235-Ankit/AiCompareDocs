import { test, expect } from '../../src/fixtures/api.fixtures';
import { ConfluenceClient } from '../../src/clients/confluence.client';
import { env } from '../../src/config/env.config';
import { logger } from '../../src/utils/logger';

/**
 * Reads a specific Confluence page and prints its metadata + body.
 *
 * Target (Server/Data Center):
 *   https://confluence.avaloq.net/spaces/~U006848/pages/908842684/Test+Data+TW+2.0
 *
 * Configure in .env:
 *   CONFLUENCE_DEPLOYMENT=server
 *   CONFLUENCE_BASE_URL=https://confluence.avaloq.net
 *   CONFLUENCE_AUTH_SCHEME=basic
 *   CONFLUENCE_USERNAME=<your-username>
 *   CONFLUENCE_PASSWORD=<your-password>
 *   CONFLUENCE_PAGE_ID=908842684   # optional; defaults to this id
 *
 * Run:
 *   npx playwright test tests/confluence/read-page.spec.ts --project=confluence
 */
const PAGE_URL =
  'https://confluence.avaloq.net/spaces/~U006848/pages/908842684/Test+Data+TW+2.0';

/** Cheap storage->plain-text for readable console output. */
function toPlainText(storage = ''): string {
  return storage
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

test.describe('Confluence - Read specific page', () => {
  test('read "Test Data TW 2.0" page by id', async ({ confluence }) => {
    // Prefer the env id; fall back to parsing it out of the known URL.
    const pageId = env.confluencePageId || ConfluenceClient.extractPageId(PAGE_URL);

    const page = await confluence.getPage(pageId);

    logger.info('--- Confluence page ---');
    logger.info(`Id:      ${page.id}`);
    logger.info(`Title:   ${page.title}`);
    logger.info(`Space:   ${page.space?.key ?? 'n/a'}`);
    logger.info(`Version: ${page.version.number}`);
    logger.info(`WebUI:   ${page._links.base ?? ''}${page._links.webui ?? ''}`);
    logger.info('--- Body (plain text) ---');
    logger.info(toPlainText(page.body?.storage.value).slice(0, 4000));

    expect(page.id).toBe(pageId);
    expect(page.title).toBeTruthy();
  });
});
