import dotenv from 'dotenv';

// Load variables from a local .env file if present.
dotenv.config();

/**
 * Reads a required environment variable, throwing a descriptive error when
 * missing so misconfiguration fails fast instead of producing 401s later.
 */
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Copy .env.example to .env and fill in the value.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function basicHeader(user: string, secret: string): string {
  return `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`;
}

/** Atlassian Cloud base (used by JIRA in this setup). */
const baseUrl = stripTrailingSlash(
  optional('ATLASSIAN_BASE_URL', 'https://your-domain.atlassian.net'),
);

/**
 * Confluence can live on a different host and deployment than JIRA.
 * For Server/Data Center the REST base is "<host>/rest/api" (no "/wiki"),
 * and auth is typically Basic (username + password) or Bearer (PAT).
 */
type Deployment = 'cloud' | 'server';
type AuthScheme = 'basic' | 'bearer';

const confluenceDeployment = optional(
  'CONFLUENCE_DEPLOYMENT',
  'cloud',
).toLowerCase() as Deployment;

const confluenceAuthScheme = optional(
  'CONFLUENCE_AUTH_SCHEME',
  // Cloud defaults to basic (email + token); Server defaults to basic too here.
  'basic',
).toLowerCase() as AuthScheme;

// Falls back to the Atlassian Cloud base if no dedicated Confluence host is set.
const confluenceBaseUrl = stripTrailingSlash(
  optional('CONFLUENCE_BASE_URL', baseUrl),
);

const confluenceApiBase =
  confluenceDeployment === 'server'
    ? `${confluenceBaseUrl}/rest/api`
    : `${confluenceBaseUrl}/wiki/rest/api`;

/**
 * JIRA can also be Cloud or Server/Data Center on its own host.
 * Server/DC uses REST API v2 ("/rest/api/2") and Bearer (PAT) or Basic auth.
 * Zephyr Scale (TM4J) test cases live under "/rest/atm/1.0".
 */
const jiraDeployment = optional('JIRA_DEPLOYMENT', 'cloud').toLowerCase() as Deployment;

const jiraAuthScheme = optional('JIRA_AUTH_SCHEME', 'basic').toLowerCase() as AuthScheme;

// Falls back to the Atlassian Cloud base if no dedicated JIRA host is set.
const jiraBaseUrl = stripTrailingSlash(optional('JIRA_BASE_URL', baseUrl));

const jiraApiVersion = jiraDeployment === 'server' ? '2' : '3';
const jiraApiBase = `${jiraBaseUrl}/rest/api/${jiraApiVersion}`;
const jiraAgileBase = `${jiraBaseUrl}/rest/agile/1.0`;
/** Zephyr Scale (Test Management for JIRA) REST base. */
const zephyrApiBase = `${jiraBaseUrl}/rest/atm/1.0`;

/**
 * Centralised, typed access to all runtime configuration.
 * Import this instead of reading process.env directly.
 */
export const env = {
  baseUrl,
  email: optional('ATLASSIAN_EMAIL', 'placeholder@example.com'),
  apiToken: optional('ATLASSIAN_API_TOKEN', 'placeholder-token'),

  /** JIRA deployment + REST endpoints (Cloud v3 or Server/DC v2). */
  jiraDeployment,
  jiraBaseUrl,
  jiraApiBase,
  jiraAgileBase,
  /** Zephyr Scale (TM4J) REST base for test-case reads. */
  zephyrApiBase,

  /** JIRA Server/DC credentials. */
  jiraUsername: optional('JIRA_USERNAME', optional('ATLASSIAN_EMAIL', '')),
  jiraPassword: optional('JIRA_PASSWORD', optional('ATLASSIAN_API_TOKEN', '')),
  /** Personal Access Token for JIRA Bearer auth (Server 8.14+ / DC). */
  jiraPat: optional('JIRA_PAT', ''),

  /** Confluence deployment + REST base (Cloud or Server/DC). */
  confluenceDeployment,
  confluenceBaseUrl,
  confluenceApiBase,

  /** Confluence Server/DC Basic credentials (or Cloud email+token). */
  confluenceUsername: optional('CONFLUENCE_USERNAME', optional('ATLASSIAN_EMAIL', '')),
  confluencePassword: optional('CONFLUENCE_PASSWORD', optional('ATLASSIAN_API_TOKEN', '')),
  /** Personal Access Token for Bearer auth (Server 7.9+ / DC). */
  confluencePat: optional('CONFLUENCE_PAT', ''),

  /** Sample data keys used by the example specs. */
  jiraProjectKey: optional('JIRA_PROJECT_KEY', 'TEST'),
  confluenceSpaceKey: optional('CONFLUENCE_SPACE_KEY', 'DOCS'),
  /** Specific page id to read in the read-page spec. */
  confluencePageId: optional('CONFLUENCE_PAGE_ID', '908842684'),
  /** Zephyr Scale test-case key to read in the read-testcase spec. */
  jiraTestCaseKey: optional('JIRA_TESTCASE_KEY', 'VBANK-T5960'),

  /**
   * HTTP auth header for JIRA, respecting the configured scheme.
   * Cloud defaults to Basic (email + token); Server can use Bearer (PAT).
   */
  get authHeader(): string {
    if (jiraAuthScheme === 'bearer') {
      return `Bearer ${this.jiraPat}`;
    }
    if (jiraDeployment === 'server') {
      return basicHeader(this.jiraUsername, this.jiraPassword);
    }
    return basicHeader(this.email, this.apiToken);
  },

  /** Auth header for Confluence, respecting the configured scheme. */
  get confluenceAuthHeader(): string {
    if (confluenceAuthScheme === 'bearer') {
      return `Bearer ${this.confluencePat}`;
    }
    return basicHeader(this.confluenceUsername, this.confluencePassword);
  },

  /** Fail fast helper for JIRA tests that need live credentials. */
  assertCredentials(): void {
    required('ATLASSIAN_EMAIL');
    required('ATLASSIAN_API_TOKEN');
    required('ATLASSIAN_BASE_URL');
  },

  /** Fail fast helper for Confluence tests that need live credentials. */
  assertConfluenceCredentials(): void {
    required('CONFLUENCE_BASE_URL');
    if (confluenceAuthScheme === 'bearer') {
      required('CONFLUENCE_PAT');
    } else {
      required('CONFLUENCE_USERNAME');
      required('CONFLUENCE_PASSWORD');
    }
  },
};

export type Env = typeof env;
