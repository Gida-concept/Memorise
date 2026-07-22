import { loadConfig, openDb, closeDb, getDefaultDataDir, type PmAgentConfig } from '@gida-concept/pm-agent-core';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import path from 'path';

/** Throw a standard InvalidParams McpError for missing/invalid input */
export function throwInputError(message: string): never {
  throw new McpError(ErrorCode.InvalidParams, message);
}

/** Throw a standard InternalError McpError for config/system errors */
export function throwConfigError(message: string): never {
  throw new McpError(ErrorCode.InternalError, message);
}

export function getConfigAndDb(opts?: { config?: string }): { config: PmAgentConfig; db: Database.Database } {
  const config = loadConfig(opts?.config);
  const dataDir = config.memory?.path || getDefaultDataDir(config.project.name);
  const dbPath = path.isAbsolute(dataDir) ? dataDir : path.resolve(config.project.root, dataDir);
  const db = openDb({ path: dbPath });
  return { config, db };
}

export function withDb<T>(fn: (db: Database.Database, config: PmAgentConfig) => T, opts?: { config?: string }): T {
  const { config, db } = getConfigAndDb(opts);
  try {
    return fn(db, config);
  } finally {
    closeDb(db);
  }
}
