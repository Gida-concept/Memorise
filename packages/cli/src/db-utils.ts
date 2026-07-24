import { loadConfig, openDb, closeDb, getDefaultDataDir, type PmAgentConfig, type Database } from '@gida-concept/pm-agent-core';
import path from 'path';

export interface CommandContext {
  config: PmAgentConfig;
  db: Database;
  opts: Record<string, any>;
}

export async function getCommandContext(opts: Record<string, any>): Promise<CommandContext> {
  const configPath = opts.config || process.env.PM_AGENT_CONFIG || undefined;
  const config = loadConfig(configPath);

  const dataDir = config.memory?.path || getDefaultDataDir(config.project.name);
  // Resolve relative to project root if not absolute
  const dbPath = path.isAbsolute(dataDir) ? dataDir : path.resolve(config.project.root, dataDir);

  const db = await openDb({ path: dbPath });

  return { config, db, opts };
}

export async function closeCommandContext(ctx: CommandContext): Promise<void> {
  await closeDb(ctx.db);
}

export function outputJson(data: unknown, opts: Record<string, any>): void {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function shouldOutputJson(opts: Record<string, any>): boolean {
  return opts.json === true;
}
