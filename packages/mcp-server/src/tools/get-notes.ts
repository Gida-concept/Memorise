import { searchNotes } from '@pm-agent/core';
import { withDb } from './db-utils.js';

export async function handleGetNotes(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return withDb((db) => {
    const notes = searchNotes(db, {
      tag: args.tag !== undefined ? String(args.tag) : undefined,
      search: args.search !== undefined ? String(args.search) : undefined,
      limit: args.limit !== undefined ? Number(args.limit) : undefined,
      since: args.since !== undefined ? String(args.since) : undefined,
    });
    return { notes, total: notes.length, filter_tag: args.tag ?? null };
  });
}
