import { test, expect } from '../../src/fixtures/api.fixtures';
import { env } from '../../src/config/env.config';

/**
 * Space discovery smoke tests for Confluence.
 */
test.describe('Confluence - Spaces @smoke', () => {
  test('space list is returned', async ({ confluence }) => {
    const spaces = await confluence.getSpaces();
    expect(Array.isArray(spaces)).toBe(true);
  });

  test('configured sample space is accessible', async ({ confluence }) => {
    const space = await confluence.getSpace(env.confluenceSpaceKey);
    expect(space.key).toBe(env.confluenceSpaceKey);
    expect(space.id).toBeTruthy();
  });
});
