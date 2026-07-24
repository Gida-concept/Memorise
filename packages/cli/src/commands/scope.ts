import { captureScope, getLatestScope, loadRules, enforce } from '@gida-concept/pm-agent-core';
import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors, formatCard } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';
import { confirmPrompt } from '../prompts.js';

export async function scopeCommand(description: string, opts: Record<string, any>): Promise<void> {
  const committed = opts.committed;
  if (committed == null || Number.isNaN(committed)) {
    throw new PmCliError('--committed <days> is required for scope check', ExitCode.GENERAL_ERROR);
  }

  const ctx = await getCommandContext(opts);

  try {
    const sprintName = opts.sprint || getLatestScope(ctx.db)?.sprint_name || 'current';
    const remaining = opts.remaining ?? committed;

    // Notify when caller provides same value (likely forgot --remaining)
    if (committed === remaining && !opts.quiet) {
      console.warn(Colors.warning(
        'Note: --committed and --remaining are equal, risk will be 0%. ' +
        'Pass --remaining <days> for accurate assessment.'
      ));
    }

    // Rules enforcement
    const rulesPath = ctx.config.rules?.config_path;
    if (ctx.config.rules?.enabled !== false && rulesPath) {
      const rules = loadRules(rulesPath, 'pm');
      const enforcement = enforce(rules, {
        command: 'scope',
        description,
        scope: { committed_days: committed, remaining_days: remaining, sprint_name: sprintName },
      });

      if (enforcement.status === 'rejected') {
        throw new PmCliError(`Rule blocked: ${enforcement.results[0]?.message}`, ExitCode.RULE_BLOCKED);
      }

      if (enforcement.status === 'pending_confirmation') {
        const confirmMsg = enforcement.results.find(r => r.action === 'confirm')?.message || 'Proceed with scope change?';
        const confirmed = await confirmPrompt(confirmMsg);
        if (!confirmed) {
          throw new PmCliError('Scope check cancelled.', ExitCode.SUCCESS);
        }
      }
    }

    const snapshot = captureScope(ctx.db, {
      sprint_name: sprintName,
      committed_days: committed,
      remaining_days: remaining,
    });

    if (shouldOutputJson(opts)) {
      outputJson(snapshot, opts);
    } else {
      const consumedPct = committed > 0
        ? Math.round(((committed - remaining) / committed) * 100)
        : 0;
      console.log(formatCard('Scope Check', [
        { label: 'Sprint:', value: Colors.highlight(snapshot.sprint_name) },
        { label: 'Committed:', value: Colors.info(`${committed}d`) },
        { label: 'Remaining:', value: remaining !== committed ? Colors.info(`${remaining}d`) : Colors.muted(`${remaining}d (same as committed)`) },
        { label: 'Consumed:', value: Colors.muted(`${consumedPct}%`) },
        { label: 'Risk:', value: snapshot.risk === 'HIGH' ? Colors.error(snapshot.risk) : snapshot.risk === 'MEDIUM' ? Colors.warning(snapshot.risk) : Colors.success(snapshot.risk) },
      ]));
    }
  } finally {
    await closeCommandContext(ctx);
  }
}
