import { withDb } from './db-utils.js';
import { getActiveBlockers, listDecisions, listTasks, getLatestScope } from '@pm-agent/core';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export async function handlePrepMeeting(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!args.title) {
    throw new McpError(ErrorCode.InvalidParams, 'Required parameter "title" missing');
  }

  return withDb((db, config) => {
    const blockers = getActiveBlockers(db);
    const decisions = listDecisions(db, { limit: 10 });
    const tasks = listTasks(db);
    const scope = getLatestScope(db);

    const brief: Record<string, unknown> = {
      title: args.title,
      project: config.project.name,
      duration_minutes: args.duration_minutes ?? 30,
      date: new Date().toISOString(),
      agenda_items: [
        {
          topic: 'Blockers',
          items: blockers.map((b) => ({ id: b.id, title: b.title, age_hours: b.age_hours })),
        },
        {
          topic: 'Recent Decisions',
          items: decisions.map((d) => ({ id: d.id, title: d.title, author: d.author })),
        },
        {
          topic: 'Task Status',
          items: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, owner: t.owner })),
        },
      ],
      sprint_context: scope
        ? { sprint: scope.sprint_name, remaining_days: scope.remaining_days, risk: scope.risk }
        : null,
      related_tickets: args.related_tickets ?? [],
    };
    return { meeting_brief: brief };
  });
}
