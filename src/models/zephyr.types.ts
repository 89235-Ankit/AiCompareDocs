/**
 * Minimal typings for Zephyr Scale (Test Management for JIRA / TM4J) test cases.
 * Server/DC REST base: <jira>/rest/atm/1.0
 * Reference: https://support.smartbear.com/zephyr-scale-server/api-docs/
 */

export interface ZephyrTestStep {
  index?: number;
  description?: string;
  testData?: string;
  expectedResult?: string;
}

export interface ZephyrTestScript {
  type?: string; // "STEP_BY_STEP" | "PLAIN_TEXT" | "BDD"
  text?: string;
  steps?: ZephyrTestStep[];
}

export interface ZephyrTestCase {
  key: string;
  name: string;
  status?: string;
  priority?: string;
  folder?: string;
  projectKey?: string;
  owner?: string;
  precondition?: string;
  objective?: string;
  labels?: string[];
  testScript?: ZephyrTestScript;
  [field: string]: unknown;
}
