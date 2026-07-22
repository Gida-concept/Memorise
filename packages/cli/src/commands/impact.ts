import { analyzeImpact } from '@gida-concept/pm-agent-core';
import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors } from '../formatters.js';

export async function impactCommand(filePath: string, opts: Record<string, any>): Promise<void> {
  const ctx = getCommandContext(opts);

  try {
    const depth = opts.depth || 2;
    const report = analyzeImpact(ctx.db, filePath, depth);

    if (shouldOutputJson(opts)) {
      outputJson(report, opts);
    } else {
      console.log(Colors.highlight(`\n  Impact Analysis: ${filePath}`));
      console.log(`  ${Colors.info('Total affected:')} ${report.total_affected} files`);

      if (report.direct_dependents.length > 0) {
        console.log(`\n  ${Colors.warning('Direct dependents:')}`);
        for (const d of report.direct_dependents) {
          console.log(`    ${d}`);
        }
      }

      if (report.transitive_dependents.length > 0) {
        console.log(`\n  ${Colors.warning(`Transitive dependents (${report.transitive_dependents.length}):`)}`);
        for (const t of report.transitive_dependents.slice(0, 20)) {
          console.log(`    ${t}`);
        }
        if (report.transitive_dependents.length > 20) {
          console.log(Colors.muted(`    ... and ${report.transitive_dependents.length - 20} more`));
        }
      }

      const ctxLinked = report.linked_context;
      if (ctxLinked.decisions.length > 0 || ctxLinked.blockers.length > 0 || ctxLinked.tasks.length > 0 || ctxLinked.notes.length > 0) {
        console.log(`\n  ${Colors.info('Linked context:')}`);
        if (ctxLinked.decisions.length > 0) {
          console.log(`    Decisions: ${ctxLinked.decisions.map(d => d.id).join(', ')}`);
        }
        if (ctxLinked.blockers.length > 0) {
          console.log(`    Blockers:  ${ctxLinked.blockers.map(b => b.id).join(', ')}`);
        }
        if (ctxLinked.tasks.length > 0) {
          console.log(`    Tasks:     ${ctxLinked.tasks.map(t => t.id).join(', ')}`);
        }
        if (ctxLinked.notes.length > 0) {
          console.log(`    Notes:     ${ctxLinked.notes.map(n => n.id).join(', ')}`);
        }
      } else {
        console.log(`\n  ${Colors.muted('No linked PM context found.')}`);
      }
    }
  } finally {
    closeCommandContext(ctx);
  }
}
