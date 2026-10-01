import { test, expect } from '../../src/fixtures/api.fixtures';
import { env } from '../../src/config/env.config';

/**
 * Auth + project discovery smoke tests for JIRA.
 * Tagged @smoke so they can be run quickly via `npm run test:smoke`.
 */
test.describe('JIRA - Projects @smoke', () => {
  test('authenticated user can be retrieved', async ({ jira }) => {
    const me = await jira.getCurrentUser();
    expect(me.accountId).toBeTruthy();
    expect(me.active).toBe(true);
  });

  test('project list is returned', async ({ jira }) => {
    const projects = await jira.getProjects();
    expect(Array.isArray(projects)).toBe(true);
  });

  test('configured sample project is accessible', async ({ jira }) => {
    const project = await jira.getProject(env.jiraProjectKey);
    expect(project.key).toBe(env.jiraProjectKey);
    expect(project.id).toBeTruthy();
  });
});
