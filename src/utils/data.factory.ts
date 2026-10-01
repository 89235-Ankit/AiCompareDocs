import { randomUUID } from 'node:crypto';

/**
 * Generates unique, traceable test data so parallel runs never collide and
 * created entities are easy to spot (and clean up) in Atlassian.
 */
export const dataFactory = {
  /** Short unique suffix, e.g. "a1b2c3d4". */
  uniqueId(): string {
    return randomUUID().split('-')[0];
  },

  /** A unique title prefixed so automated artifacts are obvious. */
  title(prefix = 'AUTOMATION'): string {
    return `${prefix}-${Date.now()}-${this.uniqueId()}`;
  },

  /** Convenience for JIRA issue summaries. */
  issueSummary(): string {
    return this.title('AUTO-ISSUE');
  },

  /** Convenience for Confluence page titles (must be unique within a space). */
  pageTitle(): string {
    return this.title('AUTO-PAGE');
  },

  /** Confluence storage-format body for a simple page. */
  pageBody(text = 'Created by Playwright API automation framework.'): string {
    return `<p>${text}</p>`;
  },
};
