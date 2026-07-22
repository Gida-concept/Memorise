import { listDecisions } from '@pm-agent/core';
import { withDb } from './db-utils.js';

export async function handleGetDecisions(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return withDb((db) => {
    const decisions = listDecisions(db, {
      limit: args.limit !== undefined ? Number(args.limit) : 20,
      since: args.since !== undefined ? String(args.since) : undefined,
      author: args.author !== undefined ? String(args.author) : undefined,
    });
    return {
      decisions,
      total: decisions.length,
      query: {
        limit: args.limit ?? 20,
        since: args.since ?? null,
        author: args.author ?? null,
      },
    };
  });
}
