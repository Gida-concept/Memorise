import { withDb } from './db-utils.js';
import { listDecisions, getActiveBlockers, searchNotes, listTasks, getLatestScope } from '@gida-concept/pm-agent-core';

export async function handleGetContext(_args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return withDb((db, config) => {
    // Check if semantic summaries exist
    const summaryCount = db.prepare('SELECT COUNT(*) as count FROM file_summaries').get() as { count: number } | undefined;

    let projectUnderstanding: Record<string, unknown>;
    if (summaryCount && summaryCount.count > 0) {
      // Load aggregate summary data from file_summaries
      const summaries = db.prepare('SELECT path, summary, purpose, exports, key_types FROM file_summaries').all() as {
        path: string;
        summary: string;
        purpose: string;
        exports: string;
        key_types: string;
      }[];

      const byPurpose: Record<string, number> = {};
      const allExports = new Set<string>();
      const allTypes = new Set<string>();

      for (const s of summaries) {
        byPurpose[s.purpose] = (byPurpose[s.purpose] || 0) + 1;
        try {
          JSON.parse(s.exports).forEach((e: string) => allExports.add(e));
          JSON.parse(s.key_types).forEach((t: string) => allTypes.add(t));
        } catch {
          // skip malformed JSON
        }
      }

      projectUnderstanding = {
        summaryCount: summaryCount.count,
        purposes: byPurpose,
        topExports: Array.from(allExports).slice(0, 20),
        topInterfaces: Array.from(allTypes).slice(0, 15),
      };
    } else {
      projectUnderstanding = {
        summaryCount: 0,
        note: 'Run pm_understand_codebase for deep analysis',
      };
    }

    const context: Record<string, unknown> = {
      project: config.project.name,
      root: config.project.root,
      decisions: listDecisions(db, { limit: 5 }),
      blockers: getActiveBlockers(db),
      notes: searchNotes(db, { limit: 5 }),
      tasks: listTasks(db),
      scope: getLatestScope(db) ?? null,
      project_understanding: projectUnderstanding,
    };
    return context;
  });
}
