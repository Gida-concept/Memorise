import Database from 'better-sqlite3';

/**
 * SqliteError shape from better-sqlite3.
 * errno 5 = SQLITE_BUSY, errno 6 = SQLITE_LOCKED
 */
interface SqliteErrorLike extends Error {
  errno?: number;
  code?: string;
}

export interface RetryOptions {
  /** Max retry attempts before giving up (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 50) */
  baseDelayMs?: number;
  /** Max delay cap in ms (default: 1000) */
  maxDelayMs?: number;
  /** Logger callback (default: noop) */
  logger?: (msg: string) => void;
}

/**
 * Returns true if the error is an SQLITE_BUSY or SQLITE_LOCKED contention error
 * that warrants a retry.
 */
function isContentionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Check message content (works across better-sqlite3 versions)
  const msg = err.message ?? '';
  if (msg.includes('SQLITE_BUSY') || msg.includes('SQLITE_LOCKED')) return true;

  // Check errno property (better-sqlite3 SqliteError)
  const sqliteErr = err as SqliteErrorLike;
  if (sqliteErr.errno === 5 || sqliteErr.errno === 6) return true;

  // Check code property
  if (sqliteErr.code === 'SQLITE_BUSY' || sqliteErr.code === 'SQLITE_LOCKED') return true;

  return false;
}

/**
 * Execute a write callback with automatic retry on SQLITE_BUSY / SQLITE_LOCKED.
 * Uses exponential backoff with jitter.
 *
 * @example
 * ```ts
 * const result = withWriteRetry(db, () => {
 *   return db.prepare('INSERT INTO tasks ...').run(...);
 * });
 * ```
 */
export function withWriteRetry<T>(
  db: Database.Database,
  fn: () => T,
  options: RetryOptions = {},
): T {
  const { maxRetries = 3, baseDelayMs = 50, maxDelayMs = 1000, logger } = options;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (err: unknown) {
      lastError = err;

      // Only retry on SQLITE_BUSY or SQLITE_LOCKED
      if (!isContentionError(err)) {
        throw err;
      }

      if (attempt >= maxRetries) {
        throw err; // Last attempt also failed
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs,
        maxDelayMs,
      );

      logger?.(
        `[pm-agent] DB write contention (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms`,
      );

      // Synchronous sleep — better-sqlite3 is synchronous, so we must be too
      // This is fine in CLI/background/server contexts for short delays
      const start = Date.now();
      while (Date.now() - start < delay) {
        // busy-wait
      }
    }
  }

  throw lastError;
}

/**
 * Async wrapper around withWriteRetry for convenience in async contexts.
 * The underlying DB operations remain synchronous, but this allows
 * the retry function to be awaited in an async call chain.
 */
export async function withWriteRetryAsync<T>(
  db: Database.Database,
  fn: () => T,
  options: RetryOptions = {},
): Promise<T> {
  return withWriteRetry(db, fn, options);
}
