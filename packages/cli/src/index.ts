#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { logCommand } from './commands/log.js';
import { blockersCommand } from './commands/blockers.js';
import { noteCommand } from './commands/note.js';
import { scopeCommand } from './commands/scope.js';
import { standupCommand } from './commands/standup.js';
import { statusCommand } from './commands/status.js';
import { rulesCommand } from './commands/rules.js';
import { scanCommand } from './commands/scan.js';
import { dependsCommand } from './commands/depends.js';
import { impactCommand } from './commands/impact.js';
import { searchCommand } from './commands/search.js';
import { archCommand } from './commands/arch.js';
import { filesCommand } from './commands/files.js';
import { Colors } from './formatters.js';
import { ExitCode } from './exit-codes.js';
import { PmCliError } from './errors.js';

const program = new Command();

program
  .name('pm')
  .description('PM Agent -- AI-native product management for developers')
  .version('0.1.2')
  .option('--config <path>', 'Path to config file')
  .option('-p, --project <name>', 'Project name')
  .option('--verbose', 'Detailed output with debug info', false)
  .option('-q, --quiet', 'Minimal output', false)
  .option('-j, --json', 'JSON output', false);

// ---- Commands -------------------------------------------------------

program
  .command('init')
  .description('First-time setup')
  .option('-f, --force', 'Overwrite existing config and DB')
  .option('-n, --name <name>', 'Project name')
  .option('-s, --scan', 'Auto-scan after init')
  .action((opts) => initCommand(opts));

program
  .command('log')
  .description('Log a decision')
  .argument('<title>', 'Decision title')
  .option('-b, --body <body>', 'Decision body')
  .option('-a, --author <author>', 'Who made the decision')
  .option('-l, --link <entities...>', 'Link to entities')
  .option('-t, --ticket <ticket>', 'Associate with ticket ID')
  .action((title, opts) => logCommand(title, opts));

program
  .command('blockers')
  .description('List and manage blockers')
  .option('-a, --all', 'Include resolved')
  .option('--age <duration>', 'Minimum age filter (e.g. 24h, 3d, 30m)')
  .option('-r, --resolve <id>', 'Mark blocker resolved by ID')
  .action((opts) => blockersCommand(opts));

program
  .command('note')
  .description('Quick capture a note')
  .argument('<content>', 'Note content')
  .option('-t, --tag <tags...>', 'Tags')
  .option('-l, --link <entities...>', 'Link to entities')
  .action((content, opts) => noteCommand(content, opts));

program
  .command('scope')
  .description('Assess sprint scope and risk. Shows what fraction of remaining sprint capacity a new scope item would consume.')
  .argument('<description>', 'Scope change description')
  .option('-c, --committed <days>', 'Days this scope item consumes (required)', parseFloat)
  .option('-r, --remaining <days>', 'Days remaining in the sprint (defaults to --committed, making risk 0%)', parseFloat)
  .option('--sprint <name>', 'Sprint name (defaults to latest)')
  .action((description, opts) => scopeCommand(description, opts));

program
  .command('standup')
  .description('Daily standup summary')
  .option('--since <date>', 'ISO date lookback (default: 24h ago)')
  .action((opts) => standupCommand(opts));

program
  .command('status')
  .description('Project overview')
  .action((opts) => statusCommand(opts));

// Rules subcommand group
const rules = program
  .command('rules')
  .description('Manage rules');

rules
  .command('list')
  .description('List all rules')
  .option('--scope <scope>', 'Filter by scope (pm, code, all)')
  .action((subOpts, cmdObj) => rulesCommand('list', { ...subOpts, ...cmdObj.parent.opts() }, cmdObj.parent.opts()));

rules
  .command('add')
  .description('Add a new rule')
  .argument('<name>', 'Rule name')
  .option('--scope <scope>', 'Rule scope (pm, code, all)')
  .option('--trigger <expr>', 'Trigger expression')
  .option('--condition <expr>', 'Condition expression')
  .option('--action <action>', 'Action string (e.g. "block: \'message\'")')
  .option('--severity <severity>', 'Severity (hard, soft, info)')
  .option('--description <desc>', 'Rule description')
  .action((name, subOpts, cmdObj) => rulesCommand('add', { name, ...subOpts, ...cmdObj.parent.opts() }, cmdObj.parent.opts()));

rules
  .command('remove')
  .description('Remove a rule')
  .argument('<name>')
  .action((name, _, cmdObj) => rulesCommand('remove', { name, ...cmdObj.parent.opts() }, cmdObj.parent.opts()));

rules
  .command('enable')
  .description('Enable a rule')
  .argument('<name>')
  .action((name, _, cmdObj) => rulesCommand('enable', { name, ...cmdObj.parent.opts() }, cmdObj.parent.opts()));

rules
  .command('disable')
  .description('Disable a rule')
  .argument('<name>')
  .action((name, _, cmdObj) => rulesCommand('disable', { name, ...cmdObj.parent.opts() }, cmdObj.parent.opts()));

rules
  .command('toggle')
  .description('Toggle a rule')
  .argument('<name>')
  .action((name, _, cmdObj) => rulesCommand('toggle', { name, ...cmdObj.parent.opts() }, cmdObj.parent.opts()));

rules
  .command('show')
  .description('Show rule details')
  .argument('<name>')
  .action((name, _, cmdObj) => rulesCommand('show', { name, ...cmdObj.parent.opts() }, cmdObj.parent.opts()));

rules
  .command('reload')
  .description('Reload rules from file')
  .action((_, cmdObj) => rulesCommand('reload', { ...cmdObj.parent.opts() }, cmdObj.parent.opts()));

// Phase 6 stubs
program
  .command('scan')
  .description('Scan codebase')
  .option('-f, --full', 'Cold-start full walk')
  .option('-w, --watch', 'Continuous file watching')
  .option('-V, --verify', 'Check index consistency')
  .option('--incremental', 'Only changed files')
  .action((opts) => scanCommand(opts));

program
  .command('depends')
  .description('Show dependency graph')
  .argument('<path>', 'File path')
  .option('-d, --depth <depth>', 'Traversal depth', parseInt)
  .option('-r, --reverse', 'Only show reverse deps')
  .action((path, opts) => dependsCommand(path, opts));

program
  .command('impact')
  .description('Analyze impact of changes')
  .argument('<path>', 'File path')
  .option('-d, --depth <depth>', 'Transitive depth', parseInt)
  .action((path, opts) => impactCommand(path, opts));

program
  .command('search')
  .description('Full-text search')
  .argument('<query>', 'Search query')
  .option('--scope <scope>', 'Search scope (code, docs, all)')
  .option('--type <type>', 'File type (source, test, doc, config)')
  .option('-l, --limit <limit>', 'Max results', parseInt)
  .action((query, opts) => searchCommand(query, opts));

program
  .command('arch')
  .description('Show architecture overview')
  .action((opts) => archCommand(opts));

program
  .command('files')
  .description('List indexed files')
  .option('--type <type>', 'File type filter (source, test, doc, config, asset)')
  .option('-u, --unindexed', 'Show files not in registry')
  .action((opts) => filesCommand(opts));

// ---- Parse -----------------------------------------------------------

(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof PmCliError) {
      console.error(Colors.error(err.message));
      process.exit(err.exitCode);
    }
    console.error(Colors.error(`Unexpected error: ${(err as Error).message}`));
    process.exit(ExitCode.GENERAL_ERROR);
  }
})();
