import { loadConfig, openDb, closeDb, getDefaultDataDir, getTransitiveDependencies } from '@gida-concept/pm-agent-core';
import { throwInputError, throwConfigError } from './db-utils.js';
import path from 'path';

export async function handleGetDependencyGraph(args: Record<string, unknown>): Promise<Record<string, unknown>> {
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
      const depth = (args.depth as number) ?? 1;
      const reverse = args.reverse === true;

      const forwardEdges = db.prepare(
        'SELECT target_path, import_type FROM dependency_edges WHERE source_path = ?'
      ).all(filePath) as { target_path: string; import_type: string }[];

      const reverseEdges = db.prepare(
        'SELECT source_path, import_type FROM dependency_edges WHERE target_path = ?'
      ).all(filePath) as { source_path: string; import_type: string }[];

      // Transitive
      const transitive = getTransitiveDependencies(db, filePath, { depth, reverse });

      return {
        path: filePath,
        depth,
        forward_dependencies: forwardEdges,
        reverse_dependencies: reverseEdges,
        transitive_dependencies: [...new Set(transitive)],
      };
    } finally {
      closeDb(db);
    }
  } catch (err) {
    throwConfigError((err as Error).message);
  }
}
