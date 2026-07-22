import { getStandupData } from '@pm-agent/core';
import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors } from '../formatters.js';

export async function standupCommand(opts: Record<string, any>): Promise<void> {
  const ctx = getCommandContext(opts);

  try {
    const since = opts.since || undefined;
    const data = getStandupData(ctx.db, since);

    if (shouldOutputJson(opts)) {
      outputJson(data, opts);
    } else {
      console.log(Colors.highlight(`\n  Standup — ${data.date}`));

      if (data.sprint) {
        console.log(`  Sprint: ${Colors.info(data.sprint.name)} (${data.sprint.remaining_days}d remaining, risk: ${data.sprint.risk})`);
      }

      console.log('\n  Yesterday:');
      console.log(`    Decisions:    ${Colors.success(String(data.yesterday.decisions.length))}`);
      console.log(`    Resolved:     ${Colors.success(String(data.yesterday.blockers_resolved.length))}`);
      console.log(`    Notes:        ${Colors.info(String(data.yesterday.notes_count))}`);

      console.log('\n  Blockers:');
      if (data.blockers.length === 0) {
        console.log(Colors.success('    None'));
      } else {
        for (const b of data.blockers) {
          console.log(`    ${Colors.error(b.id)} ${b.title} (${b.age_hours}h)`);
        }
      }
      console.log('');
    }
  } finally {
    closeCommandContext(ctx);
  }
}
