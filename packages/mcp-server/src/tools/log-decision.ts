import { createDecision } from '@gida-concept/pm-agent-core';
import { withDb } from './db-utils.js';
import { handleRules, wrapEnforcementResult } from './rules-utils.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export async function handleLogDecision(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!args.title) {
    throw new McpError(ErrorCode.InvalidParams, 'Required parameter "title" missing');
  }

  return withDb((db, config) => {
    const title = String(args.title);
    const body = args.body !== undefined ? String(args.body) : '';
    const author = args.author !== undefined ? String(args.author) : undefined;
    const links = Array.isArray(args.links) ? args.links.map(String) : [];

    const enforcement = handleRules(config, 'pm', {
      command: 'log',
      title,
      body,
      author: author ?? null,
    });

    if (enforcement?.status === 'rejected') {
      return {
        status: 'rejected',
        error: enforcement.results[0]?.message ?? 'Blocked by rule enforcement',
        rules_evaluation: enforcement,
      };
    }

    const decision = createDecision(db, {
      title,
      body,
      author,
      links,
    });

    return wrapEnforcementResult(
      { status: 'completed', decision },
      enforcement,
    );
  });
}
