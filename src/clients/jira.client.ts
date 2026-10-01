import { APIRequestContext } from '@playwright/test';
import { BaseClient } from './base.client';
import { env } from '../config/env.config';
import {
  CreateIssueRequest,
  CreatedIssue,
  CurrentUser,
  IssueComment,
  JiraIssue,
  JiraProject,
  SearchIssuesResponse,
  adfFromText,
} from '../models/jira.types';
import { ZephyrTestCase } from '../models/zephyr.types';

/**
 * Typed client for the JIRA Cloud REST API v3.
 * Each method returns parsed, typed data and asserts a successful status
 * (via BaseClient) unless explicitly told otherwise.
 */
export class JiraClient extends BaseClient {
  constructor(request: APIRequestContext) {
    super(request, env.jiraApiBase, env.authHeader);
  }

  /** GET /myself — useful for auth smoke checks. */
  async getCurrentUser(): Promise<CurrentUser> {
    const res = await this.get('/myself');
    return this.json<CurrentUser>(res);
  }

  /** GET /project/search — returns the visible projects. */
  async getProjects(query?: string): Promise<JiraProject[]> {
    const res = await this.get('/project/search', {
      params: query ? { query } : undefined,
    });
    const body = await this.json<{ values: JiraProject[] }>(res);
    return body.values;
  }

  /** GET /project/{key}. */
  async getProject(projectKey: string): Promise<JiraProject> {
    const res = await this.get(`/project/${projectKey}`);
    return this.json<JiraProject>(res);
  }

  /** POST /issue — creates an issue and returns its key/id. */
  async createIssue(payload: CreateIssueRequest): Promise<CreatedIssue> {
    const res = await this.post('/issue', { data: payload });
    return this.json<CreatedIssue>(res);
  }

  /** Convenience helper to create a simple Task with sensible defaults. */
  async createSimpleIssue(
    summary: string,
    options: {
      projectKey?: string;
      issueType?: string;
      description?: string;
      labels?: string[];
    } = {},
  ): Promise<CreatedIssue> {
    const payload: CreateIssueRequest = {
      fields: {
        project: { key: options.projectKey ?? env.jiraProjectKey },
        summary,
        issuetype: { name: options.issueType ?? 'Task' },
        ...(options.description ? { description: adfFromText(options.description) } : {}),
        ...(options.labels ? { labels: options.labels } : {}),
      },
    };
    return this.createIssue(payload);
  }

  /** GET /issue/{key}. */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    const res = await this.get(`/issue/${issueKey}`);
    return this.json<JiraIssue>(res);
  }

  /** PUT /issue/{key} — partial field update. */
  async updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void> {
    await this.put(`/issue/${issueKey}`, { data: { fields } });
  }

  /** POST /search/jql — runs a JQL query (new search endpoint). */
  async searchJql(jql: string, maxResults = 50): Promise<SearchIssuesResponse> {
    const res = await this.post('/search/jql', {
      data: { jql, maxResults, fields: ['summary', 'status', 'issuetype', 'labels'] },
    });
    return this.json<SearchIssuesResponse>(res);
  }

  /** POST /issue/{key}/comment. */
  async addComment(issueKey: string, text: string): Promise<IssueComment> {
    const res = await this.post(`/issue/${issueKey}/comment`, {
      data: { body: adfFromText(text) },
    });
    return this.json<IssueComment>(res);
  }

  /** DELETE /issue/{key}. Returns the raw status for cleanup assertions. */
  async deleteIssue(issueKey: string): Promise<number> {
    const res = await this.delete(`/issue/${issueKey}`, { allowNon2xx: true });
    return res.status();
  }

  /**
   * GET /rest/atm/1.0/testcase/{key} — reads a Zephyr Scale (TM4J) test case.
   * Keys look like "VBANK-T5960" (note the "-T"). Uses the Zephyr base URL,
   * which differs from the standard JIRA REST base.
   */
  async getTestCase(testCaseKey: string): Promise<ZephyrTestCase> {
    const res = await this.get(`${env.zephyrApiBase}/testcase/${testCaseKey}`);
    return this.json<ZephyrTestCase>(res);
  }
}
