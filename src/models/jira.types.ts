/**
 * Minimal, hand-curated typings for the subset of the JIRA Cloud REST API v3
 * used by this framework. Extend as you cover more endpoints.
 * Reference: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */

/** Atlassian Document Format (ADF) node — used for rich text fields. */
export interface AdfNode {
  type: string;
  version?: number;
  content?: AdfNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  simplified?: boolean;
  self: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask?: boolean;
}

export interface CreateIssueRequest {
  fields: {
    project: { key: string } | { id: string };
    summary: string;
    issuetype: { name: string } | { id: string };
    description?: AdfNode;
    labels?: string[];
    priority?: { name: string };
    assignee?: { accountId: string };
    [field: string]: unknown;
  };
}

export interface CreatedIssue {
  id: string;
  key: string;
  self: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: { name: string; id: string };
    issuetype: JiraIssueType;
    project: JiraProject;
    labels: string[];
    description?: AdfNode | null;
    [field: string]: unknown;
  };
}

export interface SearchIssuesResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface IssueComment {
  id: string;
  self: string;
  body: AdfNode;
  author: { accountId: string; displayName: string };
}

export interface CurrentUser {
  accountId: string;
  emailAddress?: string;
  displayName: string;
  active: boolean;
}

/** Builds a valid ADF document from a plain string. */
export function adfFromText(text: string): AdfNode {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}
