import { createDecision, loadRules, enforce } from '@gida-concept/pm-agent-core';
import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors, formatCard } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';
import { confirmPrompt } from '../prompts.js';

export async function logCommand(title: string, opts: Record<string, any>): Promise<void> {
  const ctx = await getCommandContext(opts);

  try {
    // Build links from --link and --ticket options
    const links: string[] = [...(opts.link || [])];
    if (opts.ticket) {
      links.push(opts.ticket);
    }

    // Rules enforcement
    const rulesPath = ctx.config.rules?.config_path;
    if (ctx.config.rules?.enabled !== false && rulesPath) {
      const rules = loadRules(rulesPath, 'pm');
      const enforcement = enforce(rules, {
        command: 'log',
        title,
        body: opts.body || '',
        author: opts.author || null,
      });

      if (enforcement.status === 'rejected') {
        throw new PmCliError(`Rule blocked: ${enforcement.results[0]?.message}`, ExitCode.RULE_BLOCKED);
      }

      if (enforcement.status === 'pending_confirmation') {
        const confirmMsg = enforcement.results.find(r => r.action === 'confirm')?.message || 'Proceed?';
        const confirmed = await confirmPrompt(confirmMsg);
        if (!confirmed) {
          throw new PmCliError('Action cancelled by user.', ExitCode.SUCCESS);
        }
      }
    }

    // Truncate title if needed
    if (title.length > 200) {
      console.warn(Colors.warning(`Title truncated from ${title.length} to 200 characters`));
      title = title.slice(0, 197) + '...';
    }

    const decision = createDecision(ctx.db, {
      title,
      body: opts.body || '',
      author: opts.author || undefined,
      links,
    });

    if (shouldOutputJson(opts)) {
      outputJson(decision, opts);
    } else if (opts.quiet) {
      console.log(decision.id);
    } else {
      console.log(formatCard(`ADR ${decision.id}`, [
        { label: 'Title:', value: Colors.highlight(decision.title) },
        { label: 'Author:', value: decision.author || Colors.muted('—') },
        { label: 'Date:', value: Colors.info(decision.made_at) },
        { label: 'Links:', value: decision.linked_entities.length > 0 ? decision.linked_entities.join(', ') : Colors.muted('none') },
      ]));
    }
  } finally {
    closeCommandContext(ctx);
  }
}
