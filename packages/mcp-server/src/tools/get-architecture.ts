import { loadConfig, openDb, closeDb, getDefaultDataDir } from '@gida-concept/pm-agent-core';
import { throwConfigError } from './db-utils.js';
import path from 'path';

export async function handleGetArchitecture(_args: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const config = loadConfig();
    const dataDir = config.memory?.path || getDefaultDataDir(config.project.name);
    const dbPath = path.isAbsolute(dataDir) ? dataDir : path.resolve(config.project.root, dataDir);
    const db = openDb({ path: dbPath });

    try {
      const entries = db.prepare(`
        SELECT path, role, framework FROM architecture_map ORDER BY role, path
      `).all() as { path: string; role: string; framework: string | null }[];

      const byRole: Record<string, string[]> = {};
      for (const entry of entries) {
        if (!byRole[entry.role]) byRole[entry.role] = [];
        byRole[entry.role]!.push(entry.path);
      }

      return {
        total_files: entries.length,
        framework: [...new Set(entries.filter(e => e.framework).map(e => e.framework))],
        entry_points: entries.filter(e => e.role === 'entrypoint').map(e => e.path),
        roles: Object.fromEntries(
          Object.entries(byRole).map(([role, paths]) => [role, { count: paths.length, files: paths.slice(0, 10) }])
        ),
      };
    } finally {
      closeDb(db);
    }
  } catch (err) {
    throwConfigError((err as Error).message);
  }
}
