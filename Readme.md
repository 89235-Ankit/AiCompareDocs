# Atlassian API Automation Framework

An API test-automation framework for **Confluence** and **JIRA Cloud** REST APIs,
built with **[Playwright Test](https://playwright.dev/docs/test-api-testing)** and **TypeScript**.

It uses Playwright's `APIRequestContext` for fast, browser-less HTTP testing,
with typed product clients, custom fixtures, structured logging, and full CRUD
example suites for both products.

---

## Features

- **Typed API clients** — `JiraClient` and `ConfluenceClient` wrap each endpoint with strong types.
- **Custom fixtures** — authenticated `jira` and `confluence` clients injected into every test.
- **Basic auth** — Atlassian Cloud email + API token, base64-encoded automatically.
- **Auto success assertions** — non-2xx responses fail with the full response body.
- **Data factory** — collision-free unique titles/summaries for parallel runs.
- **Self-cleaning tests** — created issues/pages are deleted in `afterEach`.
- **Reporters** — console `list`, browsable HTML, and JUnit XML for CI.
- **GitHub Actions** workflow included.

---

## Project structure

```
.
├── playwright.config.ts          # Playwright runner config (projects: jira, confluence)
├── tsconfig.json
├── .env.example                  # Copy to .env and fill in credentials
├── src/
│   ├── config/env.config.ts      # Typed env loading + auth header
│   ├── clients/
│   │   ├── base.client.ts        # Shared HTTP wrapper (auth, logging, assertions)
│   │   ├── jira.client.ts        # JIRA REST API v3 client
│   │   └── confluence.client.ts  # Confluence REST API client
│   ├── models/                   # Request/response TypeScript types
│   ├── utils/                    # logger + data factory
│   └── fixtures/api.fixtures.ts  # Playwright fixtures injecting the clients
└── tests/
    ├── jira/                     # projects + issue lifecycle specs
    └── confluence/               # spaces + page lifecycle specs
```

---

## Prerequisites

- **Node.js 18+** (20 LTS recommended)
- An **Atlassian Cloud** site (`https://your-domain.atlassian.net`)
- An **API token** from <https://id.atlassian.com/manage-profile/security/api-tokens>

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your local credentials file
cp .env.example .env        # (Windows PowerShell: Copy-Item .env.example .env)

# 3. Edit .env with your Atlassian site, email, API token,
#    plus a JIRA project key and Confluence space key to test against.
```

`.env` values:

| Variable                | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `ATLASSIAN_BASE_URL`    | Your site, e.g. `https://your-domain.atlassian.net`|
| `ATLASSIAN_EMAIL`       | Account email used for API access                  |
| `ATLASSIAN_API_TOKEN`   | API token (treat as a password)                    |
| `JIRA_PROJECT_KEY`      | Project key for issue tests, e.g. `TEST`           |
| `CONFLUENCE_SPACE_KEY`  | Space key for page tests, e.g. `DOCS`              |

---

## Running tests

```bash
npm test                 # run everything
npm run test:jira        # only JIRA suites
npm run test:confluence  # only Confluence suites
npm run test:smoke       # only @smoke-tagged tests
npm run test:ui          # Playwright UI mode
npm run report           # open the last HTML report
npm run typecheck        # tsc type checking (no live calls)
```

Set verbose request/response logging with `LOG_LEVEL=debug`.

---

## Writing a new test

```ts
import { test, expect } from '../../src/fixtures/api.fixtures';

test('create an issue', async ({ jira }) => {
  const issue = await jira.createSimpleIssue('My summary', {
    description: 'Hello from Playwright',
    labels: ['demo'],
  });
  expect(issue.key).toBeTruthy();
});
```

To cover a new endpoint, add a typed method to the relevant client in
`src/clients` and a model in `src/models`.

---

## CI

A ready-to-use GitHub Actions workflow lives in
`.github/workflows/api-tests.yml`. Add these repository secrets:
`ATLASSIAN_BASE_URL`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`,
`JIRA_PROJECT_KEY`, `CONFLUENCE_SPACE_KEY`.

---

## API references

- JIRA Cloud REST v3: <https://developer.atlassian.com/cloud/jira/platform/rest/v3/>
- Confluence Cloud REST: <https://developer.atlassian.com/cloud/confluence/rest/v1/>
- Playwright API testing: <https://playwright.dev/docs/test-api-testing>

---

## Git quick start

```bash
git init
git add --all
git commit -m "Initial Commit: Playwright Atlassian API automation framework"
git remote add origin https://bitbucket.sits.avaloq.net/scm/~u006848/git-setup.git
git push -u origin HEAD:Develop/first-project
```