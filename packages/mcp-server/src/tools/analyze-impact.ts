import { analyzeImpact, loadConfig, openDb, closeDb, getDefaultDataDir } from '@pm-agent/core';
import { throwInputError, throwConfigError } from './db-utils.js';
import path from 'path';

export async function handleAnalyzeImpact(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!args.path) {
    throwInputError('Required parameter "path" missing');
  }

  try {
    const config = loadConfig();
    const dataDir = config.memory?.path || getDefaultDataDir(config.project.name);
    const dbPath = path.isAbsolute(dataDir) ? dataDir : path.resolve(config.project.root, dataDir);
    const db = openDb({ path: dbPath });

    try {
      const filePath = String(args.path);
      const depth = (args.depth as number) ?? 2;
      const report = analyzeImpact(db, filePath, depth);
      return report as unknown as Record<string, unknown>;
    } finally {
      closeDb(db);
    }
  } catch (err) {
    throwConfigError((err as Error).message);
  }
}
