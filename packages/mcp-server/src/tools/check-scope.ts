import { captureScope, getLatestScope } from '@gida-concept/pm-agent-core';
import { withDb } from './db-utils.js';
import { handleRules, wrapEnforcementResult } from './rules-utils.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export async function handleCheckScope(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!args.description || args.committed_days == null) {
    throw new McpError(ErrorCode.InvalidParams, 'Required parameters "description" and "committed_days" missing');
  }

  return withDb((db, config) => {
    const description = String(args.description);
    const committedDays = Number(args.committed_days);
    const remainingDays = args.remaining_days != null ? Number(args.remaining_days) : committedDays;
    const sprintName = args.sprint_name ? String(args.sprint_name) : (getLatestScope(db)?.sprint_name ?? 'current');

    const enforcement = handleRules(config, 'pm', {
      command: 'scope',
      description,
      scope: { committed_days: committedDays, remaining_days: remainingDays, sprint_name: sprintName },
    });

    if (enforcement?.status === 'rejected') {
      return {
        status: 'rejected',
        error: enforcement.results[0]?.message ?? 'Blocked by rule enforcement',
        rules_evaluation: enforcement,
      };
    }

    const snapshot = captureScope(db, {
      sprint_name: sprintName,
      committed_days: committedDays,
      remaining_days: remainingDays,
    });

    return wrapEnforcementResult(
      { status: 'completed', scope_snapshot: snapshot },
      enforcement,
    );
  });
}
