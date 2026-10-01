import { APIRequestContext } from '@playwright/test';
import { BaseClient } from './base.client';
import { env } from '../config/env.config';
import {
  ConfluenceContent,
  ConfluenceSpace,
  ContentSearchResponse,
  CreatePageRequest,
  SpaceListResponse,
  UpdatePageRequest,
  storageBody,
} from '../models/confluence.types';

/**
 * Typed client for the Confluence Cloud REST API (wiki/rest/api).
 */
export class ConfluenceClient extends BaseClient {
  constructor(request: APIRequestContext) {
    super(request, env.confluenceApiBase, env.confluenceAuthHeader);
  }

  /**
   * Extracts the numeric page id from a Confluence URL such as
   * https://confluence.avaloq.net/spaces/~U006848/pages/908842684/Test+Data
   */
  static extractPageId(pageUrl: string): string {
    const match = pageUrl.match(/\/pages\/(\d+)/);
    if (!match) {
      throw new Error(`Could not extract a page id from URL: ${pageUrl}`);
    }
    return match[1];
  }

  /** GET /space — lists spaces, optionally filtered by key. */
  async getSpaces(spaceKey?: string, limit = 25): Promise<ConfluenceSpace[]> {
    const res = await this.get('/space', {
      params: spaceKey ? { spaceKey, limit } : { limit },
    });
    const body = await this.json<SpaceListResponse>(res);
    return body.results;
  }

  /** GET /space/{key}. */
  async getSpace(spaceKey: string): Promise<ConfluenceSpace> {
    const res = await this.get(`/space/${spaceKey}`);
    return this.json<ConfluenceSpace>(res);
  }

  /** POST /content — creates a page. */
  async createPage(payload: CreatePageRequest): Promise<ConfluenceContent> {
    const res = await this.post('/content', { data: payload });
    return this.json<ConfluenceContent>(res);
  }

  /** Convenience helper to create a simple page in a space. */
  async createSimplePage(
    title: string,
    bodyHtml: string,
    options: { spaceKey?: string; parentId?: string } = {},
  ): Promise<ConfluenceContent> {
    const payload: CreatePageRequest = {
      type: 'page',
      title,
      space: { key: options.spaceKey ?? env.confluenceSpaceKey },
      ...(options.parentId ? { ancestors: [{ id: options.parentId }] } : {}),
      body: storageBody(bodyHtml),
    };
    return this.createPage(payload);
  }

  /** GET /content/{id} — expand body + version by default. */
  async getPage(
    contentId: string,
    expand = 'body.storage,version,space',
  ): Promise<ConfluenceContent> {
    const res = await this.get(`/content/${contentId}`, { params: { expand } });
    return this.json<ConfluenceContent>(res);
  }

  /**
   * PUT /content/{id} — updates a page. Confluence requires the *next*
   * version number, so callers should pass current version + 1.
   */
  async updatePage(
    contentId: string,
    title: string,
    bodyHtml: string,
    nextVersion: number,
  ): Promise<ConfluenceContent> {
    const payload: UpdatePageRequest = {
      type: 'page',
      title,
      version: { number: nextVersion },
      body: storageBody(bodyHtml),
    };
    const res = await this.put(`/content/${contentId}`, { data: payload });
    return this.json<ConfluenceContent>(res);
  }

  /** GET /content/search — CQL search. */
  async searchCql(cql: string, limit = 25): Promise<ContentSearchResponse> {
    const res = await this.get('/content/search', { params: { cql, limit } });
    return this.json<ContentSearchResponse>(res);
  }

  /** DELETE /content/{id}. Returns the raw status for cleanup assertions. */
  async deletePage(contentId: string): Promise<number> {
    const res = await this.delete(`/content/${contentId}`, { allowNon2xx: true });
    return res.status();
  }
}
