import { getLatestScope, getScopeHistory } from '@pm-agent/core';
import { withDb } from './db-utils.js';

export async function handleGetScope(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return withDb((db) => {
    if (args.sprint_name) {
      const sprintName = String(args.sprint_name);
      const history = getScopeHistory(db, sprintName);
      return { sprint_name: sprintName, snapshots: history, count: history.length, is_latest: false };
    }
    const latest = getLatestScope(db);
    return latest
      ? { ...latest, is_latest: true }
      : { sprint_name: null, committed_days: 0, remaining_days: 0, risk: null, captured_at: null, is_latest: false };
  });
}
