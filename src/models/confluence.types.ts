/**
 * Minimal typings for the Confluence Cloud REST API (wiki/rest/api).
 * Reference: https://developer.atlassian.com/cloud/confluence/rest/v1/
 */

export type ContentType = 'page' | 'blogpost';
export type ContentStatus = 'current' | 'trashed' | 'draft';

export interface ConfluenceSpace {
  id: number;
  key: string;
  name: string;
  type: string;
  _links: { self: string; webui?: string };
}

export interface SpaceListResponse {
  results: ConfluenceSpace[];
  start: number;
  limit: number;
  size: number;
}

export interface ContentBody {
  storage: {
    value: string;
    representation: 'storage';
  };
}

export interface CreatePageRequest {
  type: ContentType;
  title: string;
  space: { key: string };
  ancestors?: Array<{ id: string }>;
  body: ContentBody;
}

export interface UpdatePageRequest {
  type: ContentType;
  title: string;
  version: { number: number };
  body: ContentBody;
}

export interface ConfluenceContent {
  id: string;
  type: ContentType;
  status: ContentStatus;
  title: string;
  space?: ConfluenceSpace;
  version: { number: number };
  body?: { storage: { value: string; representation: string } };
  _links: { self: string; webui?: string; base?: string };
}

export interface ContentSearchResponse {
  results: ConfluenceContent[];
  start: number;
  limit: number;
  size: number;
  _links: { self: string; next?: string };
}

/** Helper to build a storage-representation body from raw HTML/storage markup. */
export function storageBody(value: string): ContentBody {
  return { storage: { value, representation: 'storage' } };
}
