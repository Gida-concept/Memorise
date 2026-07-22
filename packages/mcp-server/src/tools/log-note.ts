import { createNote } from '@pm-agent/core';
import { withDb } from './db-utils.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export async function handleLogNote(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!args.content) {
    throw new McpError(ErrorCode.InvalidParams, 'Required parameter "content" missing');
  }

  return withDb((db) => {
    const content = String(args.content);
    const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];
    const links = Array.isArray(args.links) ? args.links.map(String) : [];

    const note = createNote(db, {
      content,
      tags,
      links,
    });
    return { status: 'completed', note };
  });
}
