/**
 * Safely parse a JSON value that could already be an array/object,
 * or a string that needs parsing, or null/undefined.
 */
export function safeParseJson<T = any>(val: unknown, fallback: T): T {
  if (Array.isArray(val)) return val as T;
  if (typeof val === 'string') {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  return fallback;
}
