import { loadConfig, openDb, closeDb, getDefaultDataDir, type PmAgentConfig } from '@gida-concept/pm-agent-core';
import type Database from 'better-sqlite3';
import path from 'path';

export interface CommandContext {
  config: PmAgentConfig;
  db: Database.Database;
  opts: Record<string, any>;
}

export function getCommandContext(opts: Record<string, any>): CommandContext {
  const configPath = opts.config || process.env.PM_AGENT_CONFIG || undefined;
  const config = loadConfig(configPath);

  const dataDir = config.memory?.path || getDefaultDataDir(config.project.name);
  // Resolve relative to project root if not absolute
  const dbPath = path.isAbsolute(dataDir) ? dataDir : path.resolve(config.project.root, dataDir);

  const db = openDb({ path: dbPath });

  return { config, db, opts };
}

export function closeCommandContext(ctx: CommandContext): void {
  closeDb(ctx.db);
}

export function outputJson(data: unknown, opts: Record<string, any>): void {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function shouldOutputJson(opts: Record<string, any>): boolean {
  return opts.json === true;
}
