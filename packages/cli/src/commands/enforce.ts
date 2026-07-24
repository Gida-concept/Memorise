import fs from 'fs';
import path from 'path';
import toml from 'toml';
import { loadRules, enforce, openDb, closeDb } from '@gida-concept/pm-agent-core';
import type { EnforcementResult, PmAgentConfig } from '@gida-concept/pm-agent-core';
import { Colors } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';

/**
 * Resolve the project's .pm-agent directory and config.
 */
function resolveConfig(): { configDir: string; configPath: string; rulesPath: string; dbPath: string } | null {
  const projectRoot = process.cwd();
  const configDir = path.join(projectRoot, '.pm-agent');
  const configPath = process.env.PM_AGENT_CONFIG || path.join(configDir, 'config.toml');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  // Try to read rules_path from config
  let rulesPath = path.join(configDir, 'rules.toml');
  let dbPath = path.join(configDir, 'pm.db');

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = toml.parse(raw);

    // Interpolate env vars
    const config = parsed as PmAgentConfig;

    if (config.rules?.config_path) {
      rulesPath = config.rules.config_path;
    }
    if (config.memory?.path) {
      dbPath = config.memory.path;
    }
  } catch {
    // Use defaults
  }

  return { configDir, configPath, rulesPath, dbPath };
}

/**
 * Build project context for rule evaluation.
 */
async function buildContext(dbPath: string): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {
    operation: 'enforce',
    project_root: process.cwd(),
  };

  // Try to load context from DB
  try {
    const db = await openDb({ path: dbPath });
    const dbInstance = db as unknown as { prepare: (sql: string) => { get: () => Record<string, unknown>; all: () => Record<string, unknown>[] } };

    // File registry count
    const fileCount = dbInstance.prepare('SELECT COUNT(*) as count FROM file_registry').get();
    context.files_indexed = (fileCount as { count: number })?.count ?? 0;

    // Active blockers
    const blockers = dbInstance.prepare("SELECT id, title, status FROM blockers WHERE status = 'open'").all();
    context.active_blockers = blockers;

    // Recent decisions
    const decisions = dbInstance.prepare('SELECT id, title, made_at FROM decisions ORDER BY made_at DESC LIMIT 5').all();
    context.recent_decisions = decisions;

    // Open tasks
    const openTasks = dbInstance.prepare("SELECT id, title, status FROM tasks WHERE status IN ('todo', 'in_progress', 'blocked')").all();
    context.open_tasks = openTasks;

    closeDb(db);
  } catch {
    // DB not available — enforce against what we have
    context.db_error = 'Could not open project database';
  }

  return context;
}

/**
 * Format enforcement results for CLI output.
 */
function formatResults(result: EnforcementResult): void {
  const triggered = result.results.filter(r => r.triggered);
  const blocked = result.results.filter(r => r.action === 'block' && !r.passed);

  if (result.status === 'rejected') {
    console.log(Colors.error('\n✖ ENFORCEMENT BLOCKED'));
  } else if (triggered.length > 0) {
    console.log(Colors.success('\n✔ Enforcement completed'));
  } else {
    console.log(Colors.success('\n✔ All rules passed — no violations'));
  }

  console.log(Colors.muted(`  Rules evaluated: ${result.rules_evaluated}`));
  console.log(Colors.muted(`  Rules triggered: ${result.rules_triggered}`));
  console.log(Colors.muted(`  Rules blocked:   ${result.rules_blocked}`));
  console.log('');

  if (triggered.length > 0) {
    for (const r of triggered) {
      const severityColor = r.severity === 'hard' ? Colors.error :
        r.severity === 'soft' ? Colors.warning : Colors.info;
      const icon = r.action === 'block' ? '✖' :
        r.action === 'confirm' ? '?' :
        r.action === 'suggest' ? '→' : '•';

      console.log(`  ${severityColor(`${icon} [${r.severity.toUpperCase()}] ${r.rule}`)}`);

      if (r.message) {
        if (r.action === 'block') {
          console.log(Colors.error(`    Blocked: ${r.message}`));
        } else if (r.action === 'confirm') {
          console.log(Colors.warning(`    Confirm: ${r.message}`));
        } else {
          console.log(Colors.muted(`    ${r.message}`));
        }
      }
    }
    console.log('');
  }

  if (blocked.length > 0) {
    console.log(Colors.error(`${blocked.length} hard rule(s) blocked this action.`));
  }

  if (result.confirmation_required) {
    console.log(Colors.warning('Confirmation required for one or more rules.'));
  }
}

/**
 * pm enforce — Run rules engine against current project state.
 */
export async function enforceCommand(opts: Record<string, any>): Promise<void> {
  try {
    const resolved = resolveConfig();
    if (!resolved) {
      throw new PmCliError(
        'PM Agent not initialized in this project.\nRun `pm init` first.',
        ExitCode.CONFIG_ERROR,
      );
    }

    const { rulesPath, dbPath } = resolved;

    // Check rules file exists
    if (!fs.existsSync(rulesPath)) {
      throw new PmCliError(
        `Rules file not found at ${rulesPath}\nRun \`pm init\` to create default rules.`,
        ExitCode.CONFIG_ERROR,
      );
    }

    // Load rules from file
    const rules = loadRules(rulesPath);

    if (rules.length === 0) {
      console.log(Colors.warning('\nNo rules loaded. Add rules to:'));
      console.log(Colors.info(`  ${rulesPath}`));
      return;
    }

    // Build project context
    const context = await buildContext(dbPath);

    // Run enforcement
    const result = enforce(rules, context);

    // Output
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      formatResults(result);
    }

    // Exit with error code if blocked
    if (result.status === 'rejected') {
      process.exit(ExitCode.RULE_BLOCKED);
    }

  } catch (err) {
    if (err instanceof PmCliError) throw err;
    throw new PmCliError(
      `Enforcement failed: ${(err as Error).message}`,
      ExitCode.GENERAL_ERROR,
    );
  }
}
