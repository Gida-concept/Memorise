import { getBlockers, getActiveBlockers, resolveBlocker, getBlocker } from '@pm-agent/core';
import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors, formatTable } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';

export async function blockersCommand(opts: Record<string, any>): Promise<void> {
  const ctx = getCommandContext(opts);

  try {
    // Handle --resolve
    if (opts.resolve) {
      const blocker = getBlocker(ctx.db, opts.resolve);
      if (!blocker) {
        throw new PmCliError(`Blocker ${opts.resolve} not found`, ExitCode.GENERAL_ERROR);
      }
      resolveBlocker(ctx.db, opts.resolve);
      if (shouldOutputJson(opts)) {
        outputJson({ resolved: opts.resolve, status: 'resolved' }, opts);
      } else {
        console.log(Colors.success(`Blocker ${opts.resolve} resolved.`));
      }
      return;
    }

    const statusFilter = opts.all ? 'all' : 'open';
    const blockers = opts.all
      ? getBlockers(ctx.db, { status: 'all' })
      : getActiveBlockers(ctx.db);

    // Filter by age if specified
    let filtered = blockers;
    if (opts.age) {
      const ageMatch = opts.age.match(/^(\d+(?:\.\d+)?)([hdm])$/);
      if (ageMatch) {
        const value = parseFloat(ageMatch[1]!);
        const unit = ageMatch[2]!;
        const hours = unit === 'h' ? value : unit === 'd' ? value * 24 : value / 60;
        filtered = blockers.filter(b => b.age_hours >= hours);
      }
    }

    if (shouldOutputJson(opts)) {
      outputJson({ blockers: filtered, count: filtered.length }, opts);
    } else if (opts.quiet) {
      console.log(String(filtered.length));
    } else if (filtered.length === 0) {
      console.log(Colors.success(statusFilter === 'all' ? 'No blockers found.' : 'No active blockers.'));
    } else {
      console.log(formatTable(
        ['ID', 'Title', 'Age', 'Status'],
        filtered.map(b => [
          Colors.highlight(b.id),
          b.title,
          Colors.warning(`${b.age_hours}h`),
          b.status === 'open' ? Colors.error('open') : Colors.success('resolved'),
        ])
      ));
      console.log(Colors.muted(`\n${filtered.length} blocker${filtered.length !== 1 ? 's' : ''}`));
    }
  } finally {
    closeCommandContext(ctx);
  }
}
