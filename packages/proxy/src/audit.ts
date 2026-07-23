import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface EnforcementLogEntry {
  timestamp: string;
  tool: string;
  blocked: boolean;
  rule?: string;
  reason?: string;
}

/**
 * Append an enforcement entry to the audit log.
 * Creates the log directory if it doesn't exist.
 * Log file is append-only JSONL (never truncated).
 */
export function logEnforcement(entry: EnforcementLogEntry): void {
  try {
    const logDir = path.resolve(os.homedir(), '.local', 'share', 'pm-agent');
    fs.mkdirSync(logDir, { recursive: true });

    const logPath = path.join(logDir, 'enforcement.log');
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch {
    // Audit logging is best-effort — never crash the proxy
  }
}
