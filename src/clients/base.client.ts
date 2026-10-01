import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { env } from '../config/env.config';
import { logger } from '../utils/logger';

export interface RequestOptions {
  params?: Record<string, string | number | boolean>;
  data?: unknown;
  headers?: Record<string, string>;
  /** When true, do not assert a 2xx response — caller handles the status. */
  allowNon2xx?: boolean;
}

/**
 * BaseClient wraps Playwright's APIRequestContext with:
 *  - automatic Basic auth + JSON headers
 *  - per-product base URLs
 *  - structured request/response logging
 *  - default success assertions with rich failure messages
 *
 * Product clients (JiraClient, ConfluenceClient) extend this.
 */
export abstract class BaseClient {
  protected constructor(
    protected readonly request: APIRequestContext,
    protected readonly baseUrl: string,
    /** Auth header for this client. Defaults to the JIRA Cloud header. */
    protected readonly authHeader: string = env.authHeader,
  ) {}

  protected defaultHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: this.authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private buildUrl(path: string): string {
    if (path.startsWith('http')) return path;
    const normalised = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${normalised}`;
  }

  async get(path: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.send('GET', path, options);
  }

  async post(path: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.send('POST', path, options);
  }

  async put(path: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.send('PUT', path, options);
  }

  async delete(path: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.send('DELETE', path, options);
  }

  private async send(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: RequestOptions,
  ): Promise<APIResponse> {
    const url = this.buildUrl(path);
    logger.debug(`${method} ${url}`, options.data ?? options.params);

    const response = await this.request.fetch(url, {
      method,
      headers: this.defaultHeaders(options.headers),
      params: options.params,
      data: options.data as never,
    });

    logger.debug(`${method} ${url} -> ${response.status()}`);

    if (!options.allowNon2xx) {
      await this.assertOk(response, method, url);
    }
    return response;
  }

  /** Asserts a 2xx status and surfaces the response body on failure. */
  private async assertOk(
    response: APIResponse,
    method: string,
    url: string,
  ): Promise<void> {
    if (response.ok()) return;
    let body = '';
    try {
      body = await response.text();
    } catch {
      /* ignore body read errors */
    }
    expect(
      response.ok(),
      `${method} ${url} failed with ${response.status()} ${response.statusText()}\n${body}`,
    ).toBeTruthy();
  }

  /** Parses a JSON response into a typed object. */
  protected async json<T>(response: APIResponse): Promise<T> {
    return (await response.json()) as T;
  }
}
