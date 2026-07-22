import Database from 'better-sqlite3';
import type { Decision } from '../memory/decisions.js';

export interface ImpactReport {
  target: string;
  direct_dependents: string[];
  transitive_dependents: string[];
  total_affected: number;
  linked_context: {
    decisions: Array<Pick<Decision, 'id' | 'title' | 'body' | 'author' | 'made_at'>>;
    blockers: Array<{ id: string; title: string }>;
    tasks: Array<{ id: string; title: string }>;
    notes: Array<{ id: string; content: string }>;
  };
}

/**
 * Analyze the impact of changing a file.
 * Finds all direct dependents (reverse deps), then transitive dependents,
 * then links PM context that references the file.
 */
export function analyzeImpact(
  db: Database.Database,
  filePath: string,
  depth = 2,
): ImpactReport {
  // Direct dependents: files that import this file
  const directRows = db.prepare(
    'SELECT source_path FROM dependency_edges WHERE target_path = ?',
  ).all(filePath) as { source_path: string }[];
  const directDependents = directRows.map(r => r.source_path);

  // Transitive dependents: files that import our dependents (recursive up to depth)
  const transitiveDependents: string[] = [];
  const visited = new Set<string>([filePath, ...directDependents]);

  let currentLevel = directDependents;
  for (let d = 1; d < depth; d++) {
    if (currentLevel.length === 0) break;

    const targetPlaceholders = currentLevel.map(() => '?').join(',');
    const visitedPlaceholders = Array.from(visited).map(() => '?').join(',');
    const nextLevel = db.prepare(
      `SELECT DISTINCT source_path FROM dependency_edges WHERE target_path IN (${targetPlaceholders}) AND source_path NOT IN (${visitedPlaceholders})`
    ).all(...currentLevel, ...Array.from(visited)) as { source_path: string }[];

    const newPaths: string[] = [];
    for (const row of nextLevel) {
      if (!visited.has(row.source_path)) {
        visited.add(row.source_path);
        newPaths.push(row.source_path);
        transitiveDependents.push(row.source_path);
      }
    }

    currentLevel = newPaths;
  }

  // Linked PM context: entities that reference this file path
  const likePattern = `%${filePath}%`;

  const decisions = db.prepare(
    'SELECT id, title, body, author, made_at FROM decisions WHERE linked_entities LIKE ?',
  ).all(likePattern) as Array<Pick<Decision, 'id' | 'title' | 'body' | 'author' | 'made_at'>>;

  const blockers = db.prepare(
    'SELECT id, title FROM blockers WHERE linked_entities LIKE ? OR description LIKE ?',
  ).all(likePattern, likePattern) as Array<{ id: string; title: string }>;

  const tasks = db.prepare(
    'SELECT id, title FROM tasks WHERE linked_entities LIKE ?',
  ).all(likePattern) as Array<{ id: string; title: string }>;

  const notes = db.prepare(
    'SELECT id, content FROM notes WHERE linked_entities LIKE ? OR content LIKE ?',
  ).all(likePattern, likePattern) as Array<{ id: string; content: string }>;

  return {
    target: filePath,
    direct_dependents: directDependents,
    transitive_dependents: transitiveDependents,
    total_affected: directDependents.length + transitiveDependents.length,
    linked_context: {
      decisions,
      blockers,
      tasks,
      notes,
    },
  };
}
