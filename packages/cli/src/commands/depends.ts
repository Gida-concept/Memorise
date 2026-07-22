import { getTransitiveDependencies } from '@pm-agent/core';
import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors } from '../formatters.js';

export async function dependsCommand(filePath: string, opts: Record<string, any>): Promise<void> {
  const ctx = getCommandContext(opts);

  try {
    const depth = opts.depth || 1;

    // Get forward dependencies (what this file imports)
    const forwardEdges = ctx.db.prepare(
      'SELECT target_path, import_type FROM dependency_edges WHERE source_path = ?'
    ).all(filePath) as { target_path: string; import_type: string }[];

    // Get reverse dependencies (what imports this file)
    const reverseEdges = ctx.db.prepare(
      'SELECT source_path, import_type FROM dependency_edges WHERE target_path = ?'
    ).all(filePath) as { source_path: string; import_type: string }[];

    // Get transitive deps if depth > 1
    const transitive = getTransitiveDependencies(ctx.db, filePath, { depth, reverse: opts.reverse });

    if (shouldOutputJson(opts)) {
      outputJson({
        path: filePath,
        depth,
        forward_dependencies: forwardEdges,
        reverse_dependencies: reverseEdges,
        transitive_dependencies: [...new Set(transitive)],
      }, opts);
    } else {
      console.log(Colors.highlight(`\n  Dependencies for: ${filePath}`));

      if (forwardEdges.length > 0) {
        console.log(`\n  ${Colors.info('Forward (imports):')}`);
        for (const e of forwardEdges) {
          console.log(`    ${e.target_path} (${Colors.muted(e.import_type)})`);
        }
      } else {
        console.log(`\n  ${Colors.muted('No forward dependencies found.')}`);
      }

      if (!opts.reverse) {
        if (transitive.length > 0) {
          console.log(`\n  ${Colors.info(`Transitive (depth ${depth}):`)}`);
          for (const t of [...new Set(transitive)].slice(0, 20)) {
            console.log(`    ${t}`);
          }
          if ([...new Set(transitive)].length > 20) {
            console.log(Colors.muted(`    ... and ${[...new Set(transitive)].length - 20} more`));
          }
        }
      }

      console.log(`\n  ${Colors.info('Reverse (imported by):')}`);
      if (reverseEdges.length > 0) {
        for (const e of reverseEdges) {
          console.log(`    ${e.source_path} (${Colors.muted(e.import_type)})`);
        }
      } else {
        console.log(Colors.muted('    No reverse dependencies found.'));
      }
    }
  } finally {
    closeCommandContext(ctx);
  }
}
