import { withDb } from './db-utils.js';
import { listDecisions, getActiveBlockers, searchNotes, listTasks, getLatestScope } from '@gida-concept/pm-agent-core';

export async function handleGetContext(_args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return withDb((db, config) => {
    const context: Record<string, unknown> = {
      project: config.project.name,
      root: config.project.root,
      decisions: listDecisions(db, { limit: 5 }),
      blockers: getActiveBlockers(db),
      notes: searchNotes(db, { limit: 5 }),
      tasks: listTasks(db),
      scope: getLatestScope(db) ?? null,
    };
    return context;
  });
}
