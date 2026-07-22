import { scan as fullScan, scanIncremental, verify } from '@gida-concept/pm-agent-core';
import { loadConfig, openDb, getDefaultDataDir } from '@gida-concept/pm-agent-core';
import { Colors, formatTable } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';
import path from 'path';

export async function scanCommand(opts: Record<string, any>): Promise<void> {
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
    const scanOpts = {
      excludePatterns: config.scan?.exclude_patterns,
      maxFileSizeMb: config.scan?.max_file_size_mb ?? 10,
      followSymlinks: config.scan?.follow_symlinks ?? false,
    };

    if (opts.verify) {
      const result = await verify(db, root);
      console.log(formatTable(
        ['Metric', 'Value'],
        [
          ['Indexed matching', String(result.indexed_matching)],
          ['New on disk', String(result.new_on_disk.length)],
          ['Deleted from disk', String(result.deleted_from_disk.length)],
          ['Modified since index', String(result.modified_since_index.length)],
        ]
      ));
      return;
    }

    const mode = opts.full ? 'full' : 'incremental';
    console.log(Colors.info(`Starting ${mode} scan of ${root}...`));

    const result = mode === 'full'
      ? await fullScan(db, root, scanOpts)
      : await scanIncremental(db, root, scanOpts);

    console.log(Colors.success(`\nScan complete in ${result.duration_seconds.toFixed(1)}s`));
    console.log(formatTable(
      ['Metric', 'Value'],
      [
        ['Total files', String(result.total)],
        ['New', String(result.new)],
        ['Modified', String(result.modified)],
        ['Deleted', String(result.deleted)],
        ['Source', String(result.summary.source)],
        ['Test', String(result.summary.test)],
        ['Doc', String(result.summary.doc)],
        ['Config', String(result.summary.config)],
        ['Asset', String(result.summary.asset)],
      ]
    ));

    if (result.dependencies) {
      console.log(`\n${Colors.info('Dependencies:')} ${result.dependencies.total_edges} edges, ${result.dependencies.circular_count} circular`);
    }
    if (result.architecture) {
      console.log(`${Colors.info('Framework:')} ${result.architecture.framework || 'unknown'}`);
      console.log(`${Colors.info('Entry points:')} ${result.architecture.entry_points.join(', ') || 'none'}`);
    }
  } finally {
    db.close();
  }
}
