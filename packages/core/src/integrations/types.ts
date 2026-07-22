import Database from 'better-sqlite3';
import type { PmAgentConfig } from '../config.js';
import type { Blocker } from '../memory/blockers.js';
import type { Decision } from '../memory/decisions.js';
import type { Task } from '../memory/tasks.js';

export interface Integration {
  name: string;
  detect(config: PmAgentConfig): Promise<boolean>;
  connect(config: PmAgentConfig): Promise<void>;
  fetchBlockers(db: Database.Database): Promise<Blocker[]>;
  fetchDecisions(db: Database.Database): Promise<Decision[]>;
  fetchTasks(db: Database.Database): Promise<Task[]>;
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: 'auth' | 'rate_limit' | 'network' | 'not_found' | 'parse',
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

/**
 * Generic retry with exponential backoff for integration API calls.
 * Retries on 429 and 5xx, immediately throws on 401/4xx.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxRetries?: number; baseDelayMs?: number },
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 1000;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (err instanceof IntegrationError && !err.retryable) {
        throw err;
      }
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
