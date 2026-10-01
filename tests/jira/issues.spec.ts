import { test, expect } from '../../src/fixtures/api.fixtures';
import { dataFactory } from '../../src/utils/data.factory';

/**
 * Full CRUD lifecycle for a JIRA issue:
 * create -> read -> update -> comment -> search -> delete (cleanup).
 */
test.describe('JIRA - Issue lifecycle', () => {
  let issueKey: string;

  test.afterEach(async ({ jira }) => {
    // Best-effort cleanup so the project is not polluted by automation runs.
    if (issueKey) {
      const status = await jira.deleteIssue(issueKey);
      expect([204, 404]).toContain(status);
      issueKey = '';
    }
  });

  test('create and read an issue @smoke', async ({ jira }) => {
    const summary = dataFactory.issueSummary();
    const created = await jira.createSimpleIssue(summary, {
      description: 'Created by the API automation framework.',
      labels: ['automation', 'playwright'],
    });
    issueKey = created.key;

    expect(created.key).toMatch(/-\d+$/);

    const issue = await jira.getIssue(created.key);
    expect(issue.fields.summary).toBe(summary);
    expect(issue.fields.labels).toContain('automation');
  });

  test('update an issue summary', async ({ jira }) => {
    const created = await jira.createSimpleIssue(dataFactory.issueSummary());
    issueKey = created.key;

    const newSummary = dataFactory.issueSummary();
    await jira.updateIssue(created.key, { summary: newSummary });

    const issue = await jira.getIssue(created.key);
    expect(issue.fields.summary).toBe(newSummary);
  });

  test('add a comment to an issue', async ({ jira }) => {
    const created = await jira.createSimpleIssue(dataFactory.issueSummary());
    issueKey = created.key;

    const comment = await jira.addComment(created.key, 'Automated comment.');
    expect(comment.id).toBeTruthy();
    expect(comment.body.type).toBe('doc');
  });

  test('find a created issue via JQL', async ({ jira }) => {
    const summary = dataFactory.issueSummary();
    const created = await jira.createSimpleIssue(summary);
    issueKey = created.key;

    const result = await jira.searchJql(`key = "${created.key}"`);
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
    expect(result.issues[0].key).toBe(created.key);
  });

  test('rejects an invalid issue payload', async ({ jira }) => {
    // Missing required summary -> expect the client assertion to throw.
    await expect(
      jira.createIssue({
        // @ts-expect-error intentionally invalid payload for negative testing
        fields: { project: { key: 'NON_EXISTENT' }, issuetype: { name: 'Task' } },
      }),
    ).rejects.toThrow();
  });
});
