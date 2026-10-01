import { test, expect } from '../../src/fixtures/api.fixtures';
import { env } from '../../src/config/env.config';
import { logger } from '../../src/utils/logger';
import { ZephyrTestStep } from '../../src/models/zephyr.types';

/**
 * Reads a Zephyr Scale (TM4J) test case from JIRA Server/DC.
 *
 * Target:
 *   https://jira.service.avaloq.com/secure/Tests.jspa#/testCase/VBANK-T5960
 *   -> GET https://jira.service.avaloq.com/rest/atm/1.0/testcase/VBANK-T5960
 *
 * Configure in .env:
 *   JIRA_DEPLOYMENT=server
 *   JIRA_BASE_URL=https://jira.service.avaloq.com
 *   JIRA_AUTH_SCHEME=bearer
 *   JIRA_PAT=<your-token>
 *   JIRA_TESTCASE_KEY=VBANK-T5960   # optional; defaults to this key
 *
 * Run:
 *   npx playwright test tests/jira/read-testcase.spec.ts --project=jira
 */

/** Cheap HTML -> plain text for readable console output. */
function toPlainText(html = ''): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

test.describe('JIRA - Read Zephyr Scale test case', () => {
  test('read test case VBANK-T5960', async ({ jira }, testInfo) => {
    const key = env.jiraTestCaseKey;

    const testCase = await test.step(`GET test case ${key}`, async () => {
      return jira.getTestCase(key);
    });

    // Build a human-readable summary so the content shows up in the report.
    const lines: string[] = [];
    lines.push('=== Zephyr Scale Test Case ===');
    lines.push(`URL:       ${env.jiraBaseUrl}/secure/Tests.jspa#/testCase/${key}`);
    lines.push(`Key:       ${testCase.key}`);
    lines.push(`Name:      ${testCase.name}`);
    lines.push(`Project:   ${testCase.projectKey ?? 'n/a'}`);
    lines.push(`Status:    ${testCase.status ?? 'n/a'}`);
    lines.push(`Priority:  ${testCase.priority ?? 'n/a'}`);
    lines.push(`Folder:    ${testCase.folder ?? 'n/a'}`);
    lines.push(`Owner:     ${testCase.owner ?? 'n/a'}`);
    if (testCase.objective) {
      lines.push('', '--- Objective ---', toPlainText(testCase.objective));
    }
    if (testCase.precondition) {
      lines.push('', '--- Precondition ---', toPlainText(testCase.precondition));
    }

    const steps: ZephyrTestStep[] = testCase.testScript?.steps ?? [];
    if (steps.length > 0) {
      lines.push('', `--- Steps (${steps.length}) ---`);
      steps.forEach((step, i) => {
        lines.push(`Step ${i + 1}:`);
        if (step.description) lines.push(`  Action:   ${toPlainText(step.description)}`);
        if (step.testData) lines.push(`  Data:     ${toPlainText(step.testData)}`);
        if (step.expectedResult)
          lines.push(`  Expected: ${toPlainText(step.expectedResult)}`);
      });
    } else if (testCase.testScript?.text) {
      lines.push('', '--- Test script (plain text) ---', toPlainText(testCase.testScript.text));
    }

    const summary = lines.join('\n');

    // Echo to the console (terminal) as before.
    logger.info(summary);

    // Surface the details INSIDE the Playwright HTML report:
    // 1) each step as a named report step,
    await test.step(`Test case: ${testCase.key} - ${testCase.name}`, async () => {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await test.step(
          `Step ${i + 1}: ${toPlainText(s.description) || '(no action)'}` +
            (s.expectedResult ? ` -> ${toPlainText(s.expectedResult)}` : ''),
          async () => {
            /* details captured in the step title + attachments below */
          },
        );
      }
    });

    // 2) attachments visible under the test's "Attachments" section.
    await testInfo.attach('test-case-summary.txt', {
      body: summary,
      contentType: 'text/plain',
    });
    await testInfo.attach('test-case-raw.json', {
      body: JSON.stringify(testCase, null, 2),
      contentType: 'application/json',
    });

    expect(testCase.key).toBe(key);
    expect(testCase.name).toBeTruthy();
  });
});
