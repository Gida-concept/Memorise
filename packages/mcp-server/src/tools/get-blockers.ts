import { getBlockers, getActiveBlockers } from '@gida-concept/pm-agent-core';
import { withDb } from './db-utils.js';

export async function handleGetBlockers(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return withDb((db) => {
    const status = (args.status as string) || 'open';
    const limit = args.limit !== undefined ? Number(args.limit) : undefined;

    let blockers;
    if (status === 'all') {
      blockers = getBlockers(db, { status: 'all', limit });
    } else if (status === 'open') {
      blockers = getActiveBlockers(db, { limit });
    } else {
      blockers = getBlockers(db, { status: 'resolved', limit });
    }

    return {
      blockers,
      active_count: getActiveBlockers(db).length,
      filter_applied: { status, limit: limit ?? null },
    };
  });
}
