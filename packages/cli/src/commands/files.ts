import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors, formatTable } from '../formatters.js';
import { glob } from 'glob';

export async function filesCommand(opts: Record<string, any>): Promise<void> {
  const ctx = await getCommandContext(opts);

  try {
    let indexedFiles = ctx.db.prepare('SELECT path, type, size, hash, last_indexed_at FROM file_registry ORDER BY path').all() as any[];

    // Filter by type
    if (opts.type) {
      indexedFiles = indexedFiles.filter(f => f.type === opts.type);
    }

    // Show files on disk not in registry
    if (opts.unindexed) {
      const indexedPaths = new Set(indexedFiles.map(f => f.path));
      const root = ctx.config.project.root;
      const ignoreModule = await import('ignore');
      const ig = ignoreModule.default();
      ig.add(['node_modules', '.git', 'dist', 'build']);

      const unindexed: string[] = [];
      const globResults = await glob('**/*', { cwd: root, nodir: true, dot: true, follow: false });

      for (const relativePath of globResults) {
        if (!ig.ignores(relativePath) && !indexedPaths.has(relativePath)) {
          unindexed.push(relativePath);
        }
      }

      if (shouldOutputJson(opts)) {
        outputJson({ indexed: indexedFiles.length, unindexed: unindexed.length, files: unindexed }, opts);
      } else {
        console.log(Colors.info(`\n  Indexed: ${indexedFiles.length} files`));
        console.log(Colors.warning(`  Unindexed: ${unindexed.length} files\n`));
        if (unindexed.length > 0) {
          for (const f of unindexed.slice(0, 30)) {
            console.log(`  ${Colors.muted(f)}`);
          }
          if (unindexed.length > 30) {
            console.log(Colors.muted(`  ... and ${unindexed.length - 30} more`));
          }
        }
      }
      return;
    }

    // Count by type
    const typeCounts = new Map<string, number>();
    for (const f of indexedFiles) {
      typeCounts.set(f.type, (typeCounts.get(f.type) || 0) + 1);
    }

    if (shouldOutputJson(opts)) {
      outputJson({ files: indexedFiles, total: indexedFiles.length, by_type: Object.fromEntries(typeCounts) }, opts);
    } else {
      console.log(Colors.highlight(`\n  File Registry: ${indexedFiles.length} files\n`));
      console.log(formatTable(
        ['Type', 'Count'],
        [...typeCounts.entries()].map(([type, count]) => [type, String(count)])
      ));

      if (indexedFiles.length <= 30) {
        console.log(`\n${Colors.muted('Files:')}`);
        for (const f of indexedFiles) {
          console.log(`  ${f.path} (${Colors.muted(f.type)}, ${(f.size / 1024).toFixed(1)}KB)`);
        }
      }
    }
  } finally {
    await closeCommandContext(ctx);
  }
}
