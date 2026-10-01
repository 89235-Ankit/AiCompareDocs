import { test, expect } from '../../src/fixtures/api.fixtures';
import { dataFactory } from '../../src/utils/data.factory';

/**
 * Full CRUD lifecycle for a Confluence page:
 * create -> read -> update -> search -> delete (cleanup).
 */
test.describe('Confluence - Page lifecycle', () => {
  let pageId: string;

  test.afterEach(async ({ confluence }) => {
    if (pageId) {
      const status = await confluence.deletePage(pageId);
      expect([204, 404]).toContain(status);
      pageId = '';
    }
  });

  test('create and read a page @smoke', async ({ confluence }) => {
    const title = dataFactory.pageTitle();
    const created = await confluence.createSimplePage(title, dataFactory.pageBody());
    pageId = created.id;

    expect(created.id).toBeTruthy();
    expect(created.title).toBe(title);

    const page = await confluence.getPage(created.id);
    expect(page.title).toBe(title);
    expect(page.body?.storage.value).toContain('Playwright');
  });

  test('update a page bumps its version', async ({ confluence }) => {
    const created = await confluence.createSimplePage(
      dataFactory.pageTitle(),
      dataFactory.pageBody(),
    );
    pageId = created.id;

    const newTitle = dataFactory.pageTitle();
    const updated = await confluence.updatePage(
      created.id,
      newTitle,
      dataFactory.pageBody('Updated content.'),
      created.version.number + 1,
    );

    expect(updated.title).toBe(newTitle);
    expect(updated.version.number).toBe(created.version.number + 1);
  });

  test('find a created page via CQL', async ({ confluence }) => {
    const title = dataFactory.pageTitle();
    const created = await confluence.createSimplePage(title, dataFactory.pageBody());
    pageId = created.id;

    // Confluence's search index is eventually consistent, so a freshly created
    // page may not appear immediately. Poll until it is indexed (or time out).
    await expect
      .poll(
        async () => {
          const result = await confluence.searchCql(`title = "${title}"`);
          return result.results[0]?.title;
        },
        {
          message: `Page "${title}" was not returned by CQL search in time`,
          timeout: 30_000,
          intervals: [1_000, 2_000, 3_000, 5_000],
        },
      )
      .toBe(title);
  });

  test('rejects creating a page in a non-existent space', async ({ confluence }) => {
    await expect(
      confluence.createSimplePage(dataFactory.pageTitle(), dataFactory.pageBody(), {
        spaceKey: 'THIS_SPACE_DOES_NOT_EXIST_XYZ',
      }),
    ).rejects.toThrow();
  });
});
