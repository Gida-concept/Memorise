import { semanticScan } from '@gida-concept/pm-agent-core';
import { loadConfig, openDb, getDefaultDataDir } from '@gida-concept/pm-agent-core';
import { Colors, formatTable } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';
import path from 'path';

export async function understandCommand(opts: Record<string, any>): Promise<void> {
  const configPath = opts.config || process.env.PM_AGENT_CONFIG || undefined;
  let config;
  try {
    config = loadConfig(configPath);
  } catch {
    throw new PmCliError('Configuration not found. Run `pm init` first.', ExitCode.CONFIG_ERROR);
  }

  const dataDir = config.memory?.path || getDefaultDataDir(config.project.name);
  const dbPath = path.isAbsolute(dataDir) ? dataDir : path.resolve(config.project.root, dataDir);
  const db = openDb({ path: dbPath });

  try {
    const root = config.project.root;
    console.log(Colors.info(`Analyzing codebase semantics for ${root}...`));

    const result = await semanticScan(db, root);

    if (result.summaryCount === 0) {
      console.log(Colors.warning('\nNo files in registry. Run `pm scan` first.'));
      return;
    }

    const pm = result.projectMap;

    console.log(Colors.success(`\nSemantic analysis complete — ${result.summaryCount} files summarized\n`));

    // Frameworks
    if (pm.frameworks.length > 0) {
      console.log(Colors.info('Detected Frameworks:'));
      pm.frameworks.forEach(fw => console.log(`  ${Colors.highlight('*')} ${fw}`));
      console.log();
    }

    // Entry points
    console.log(Colors.info('Entry Points:'));
    if (pm.entryPoints.length > 0) {
      pm.entryPoints.forEach(ep => console.log(`  ${Colors.highlight('*')} ${ep}`));
    } else {
      console.log(`  ${Colors.muted('(none detected)')}`);
    }
    console.log();

    // File counts by purpose
    console.log(Colors.info('File Counts by Purpose:'));
    const purposeRows = Object.entries(pm.moduleSummary.byPurpose)
      .sort((a, b) => b[1] - a[1])
      .map(([purpose, count]) => [purpose, String(count)]);
    console.log(formatTable(['Purpose', 'Count'], purposeRows));
    console.log();

    // File counts by directory
    console.log(Colors.info('File Counts by Directory:'));
    const dirRows = Object.entries(pm.moduleSummary.byDirectory)
      .sort((a, b) => b[1] - a[1])
      .map(([dir, count]) => [dir, String(count)]);
    console.log(formatTable(['Directory', 'Count'], dirRows));
    console.log();

    // Architecture layers
    console.log(`${Colors.info('Architecture Layers:')} ${pm.architectureLayers.join(', ') || 'none'}`);
    console.log();

    // Top exports
    if (pm.topExports.length > 0) {
      console.log(`${Colors.info('Top Exports:')} ${pm.topExports.slice(0, 15).join(', ')}${pm.topExports.length > 15 ? `, +${pm.topExports.length - 15} more` : ''}`);
    }

    // Top interfaces
    if (pm.topInterfaces.length > 0) {
      console.log(`${Colors.info('Top Types/Interfaces:')} ${pm.topInterfaces.slice(0, 10).join(', ')}${pm.topInterfaces.length > 10 ? `, +${pm.topInterfaces.length - 10} more` : ''}`);
    }

    console.log(`\n${Colors.muted(`Total: ${pm.moduleSummary.totalFiles} files in registry, ${pm.moduleSummary.sourceFiles || '?'} source files analyzed`)}`);
  } finally {
    db.close();
  }
}
