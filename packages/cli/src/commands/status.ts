import { listDecisions, getBlockers, searchNotes, listTasks, getLatestScope } from '@gida-concept/pm-agent-core';
import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors, formatCard } from '../formatters.js';

export async function statusCommand(opts: Record<string, any>): Promise<void> {
  const ctx = getCommandContext(opts);

  try {
    const decisions = listDecisions(ctx.db, { limit: 5 });
    const activeBlockers = getBlockers(ctx.db, { status: 'open' });
    const notes = searchNotes(ctx.db, { limit: 5 });
    const tasks = listTasks(ctx.db);
    const scope = getLatestScope(ctx.db);

    const data = {
      project: ctx.config.project.name,
      decisions: { total: decisions.length, recent: decisions.map(d => ({ id: d.id, title: d.title })) },
      blockers: { active: activeBlockers.length },
      notes: { total: notes.length },
      tasks: { total: tasks.length },
      scope: scope || null,
    };

    if (shouldOutputJson(opts)) {
      outputJson(data, opts);
    } else {
      console.log(Colors.highlight(`\n  ${ctx.config.project.name}`));
      console.log(Colors.muted(`  ${ctx.config.project.root}\n`));

      console.log(formatCard('Summary', [
        { label: 'Decisions:', value: Colors.info(String(decisions.length)) },
        { label: 'Blockers:', value: activeBlockers.length > 0 ? Colors.error(String(activeBlockers.length)) : Colors.success('0') },
        { label: 'Tasks:', value: Colors.info(String(tasks.length)) },
        { label: 'Notes:', value: Colors.info(String(notes.length)) },
        { label: 'Sprint:', value: scope ? Colors.highlight(`${scope.sprint_name} (${scope.remaining_days}d remaining)`) : Colors.muted('No sprint data') },
      ]));
    }
  } finally {
    closeCommandContext(ctx);
  }
}
