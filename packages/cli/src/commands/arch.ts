import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors } from '../formatters.js';

export async function archCommand(opts: Record<string, any>): Promise<void> {
  const ctx = await getCommandContext(opts);

  try {
    const entries = ctx.db.prepare(`
      SELECT path, role, framework, metadata FROM architecture_map
      ORDER BY role, path
    `).all() as { path: string; role: string; framework: string | null; metadata: string }[];

    // Group by role
    const byRole = new Map<string, typeof entries>();
    for (const entry of entries) {
      const group = byRole.get(entry.role) || [];
      group.push(entry);
      byRole.set(entry.role, group);
    }

    // Get entry points
    const entryPoints = entries.filter(e => e.role === 'entrypoint');

    // Get framework
    const frameworks = [...new Set(entries.filter(e => e.framework).map(e => e.framework))] as string[];

    if (shouldOutputJson(opts)) {
      outputJson({
        framework: frameworks,
        entry_points: entryPoints.map(e => e.path),
        architecture: Object.fromEntries(byRole),
        total_files: entries.length,
      }, opts);
    } else {
      console.log(Colors.highlight(`\n  Architecture Overview\n`));

      if (frameworks.length > 0) {
        console.log(`  ${Colors.info('Detected frameworks:')} ${frameworks.join(', ')}`);
      }

      if (entryPoints.length > 0) {
        console.log(`\n  ${Colors.info('Entry points:')}`);
        for (const ep of entryPoints) {
          console.log(`    ${ep.path}`);
        }
      }

      console.log(`\n  ${Colors.info('Roles:')}`);
      for (const [role, files] of byRole) {
        console.log(`    ${Colors.highlight(role)} (${files.length} files)`);
        if (files.length <= 5) {
          for (const f of files) {
            console.log(`      ${f.path}`);
          }
        }
      }

      console.log(`\n  ${Colors.muted(`Total: ${entries.length} indexed files`)}`);
    }
  } finally {
    closeCommandContext(ctx);
  }
}
