import { getStandupData } from '@pm-agent/core';
import { withDb } from './db-utils.js';

export async function handleGetStandup(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return withDb((db) => {
    const since = args.since !== undefined ? String(args.since) : undefined;
    const data = getStandupData(db, since);
    return data as unknown as Record<string, unknown>;
  });
}
