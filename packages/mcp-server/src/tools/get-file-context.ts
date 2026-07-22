import { loadConfig, openDb, closeDb, getDefaultDataDir } from '@pm-agent/core';
import { throwInputError, throwConfigError } from './db-utils.js';
import path from 'path';
import fs from 'fs';

export async function handleGetFileContext(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!args.path) {
    throwInputError('Required parameter "path" missing');
  }

  try {
    const config = loadConfig();
    const root = config.project.root;
    const relativePath = String(args.path);
    const absolutePath = path.resolve(root, relativePath);

    // Path traversal protection
    if (!absolutePath.startsWith(path.resolve(root))) {
      throwConfigError('Path escapes project root');
    }

    if (!fs.existsSync(absolutePath)) {
      throwConfigError(`File not found: ${relativePath}`);
    }

    const stat = fs.statSync(absolutePath);

    const dataDir = config.memory?.path || getDefaultDataDir(config.project.name);
    const dbPath = path.isAbsolute(dataDir) ? dataDir : path.resolve(config.project.root, dataDir);
    const db = openDb({ path: dbPath });

    try {
      const registryEntry = db.prepare('SELECT * FROM file_registry WHERE path = ?').get(relativePath);
      const archEntry = db.prepare('SELECT * FROM architecture_map WHERE path = ?').get(relativePath);

      let content: string | null = null;
      if (stat.size < 100 * 1024) { // Only read files under 100KB
        try {
          content = fs.readFileSync(absolutePath, 'utf-8');
        } catch {
          content = '[binary file]';
        }
      } else {
        content = `[file too large: ${(stat.size / 1024).toFixed(0)}KB]`;
      }

      return {
        path: relativePath,
        size: stat.size,
        modified_at: stat.mtime.toISOString(),
        registry: registryEntry || null,
        architecture: archEntry || null,
        content: content ? content.slice(0, 10000) : null,
      };
    } finally {
      closeDb(db);
    }
  } catch (err) {
    throwConfigError((err as Error).message);
  }
}
