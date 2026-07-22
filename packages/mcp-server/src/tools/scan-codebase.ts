import { loadConfig, openDb, closeDb, getDefaultDataDir } from '@gida-concept/pm-agent-core';
import { scan, scanIncremental, verify } from '@gida-concept/pm-agent-core';
import { throwConfigError } from './db-utils.js';
import path from 'path';

export async function handleScanCodebase(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const config = loadConfig();
    const dataDir = config.memory?.path || getDefaultDataDir(config.project.name);
    const dbPath = path.isAbsolute(dataDir) ? dataDir : path.resolve(config.project.root, dataDir);
    const db = openDb({ path: dbPath });

    try {
      const mode = String(args.mode ?? 'incremental');
      const root = config.project.root;

      const scanOpts = {
        excludePatterns: config.scan?.exclude_patterns,
        maxFileSizeMb: config.scan?.max_file_size_mb ?? 10,
        followSymlinks: config.scan?.follow_symlinks ?? false,
      };

      if (mode === 'verify') {
        const result = await verify(db, root);
        return {
          status: 'completed',
          mode: 'verify',
          ...result,
        };
      }

      const result = mode === 'full'
        ? await scan(db, root, scanOpts)
        : await scanIncremental(db, root, scanOpts);

      return result as unknown as Record<string, unknown>;
    } finally {
      closeDb(db);
    }
  } catch (err) {
    throwConfigError((err as Error).message);
  }
}
