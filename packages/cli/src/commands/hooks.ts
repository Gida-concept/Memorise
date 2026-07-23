import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { Colors } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';

/**
 * Resolve the path to @gida-concept/pm-agent-hooks package.
 * Searches from the CLI's own node_modules, then walks upward.
 */
function resolveHooksPackagePath(): string | null {
  const searchRoots = [
    path.dirname(new URL(import.meta.url).pathname),
    process.cwd(),
  ];

  for (const root of searchRoots) {
    try {
      const require = createRequire(path.join(root, 'noop.mjs'));
      const resolved = require.resolve('@gida-concept/pm-agent-hooks');
      if (resolved) {
        let pkgDir = path.dirname(resolved);
        while (pkgDir !== path.dirname(pkgDir)) {
          if (fs.existsSync(path.join(pkgDir, 'package.json'))) {
            const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
            if (pkg.name === '@gida-concept/pm-agent-hooks') {
              return pkgDir;
            }
          }
          pkgDir = path.dirname(pkgDir);
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Resolve the path to the hooks source directory (containing .mjs files).
 *
 * Priority:
 * 1. Monorepo dev: packages/hooks/src/ relative to CLI location
 * 2. Installed package: node_modules/@gida-concept/pm-agent-hooks/src/
 * 3. Walk up to find it from require
 */
function resolveHooksSrcPath(): string | null {
  const modulePath = path.dirname(new URL(import.meta.url).pathname);

  // 1. Monorepo dev: walk up from CLI module to find packages/hooks/src
  const monorepoPath = path.resolve(modulePath, '..', '..', '..', '..', 'packages', 'hooks', 'src');
  if (fs.existsSync(path.join(monorepoPath, 'hook-utils.mjs'))) {
    return monorepoPath;
  }

  // 2. Resolve via require using package.json export
  try {
    const require = createRequire(modulePath);
    const pkgJsonPath = require.resolve('@gida-concept/pm-agent-hooks/package.json');
    const pkgDir = path.dirname(pkgJsonPath);
    const srcDir = path.join(pkgDir, 'src');
    if (fs.existsSync(path.join(srcDir, 'hook-utils.mjs'))) {
      return srcDir;
    }
  } catch {
    // Fallback below
  }

  // 3. Try direct node_modules path from cwd
  try {
    const cwd = process.cwd();
    const localPath = path.join(cwd, 'node_modules', '@gida-concept', 'pm-agent-hooks', 'src');
    if (fs.existsSync(path.join(localPath, 'hook-utils.mjs'))) {
      return localPath;
    }
  } catch {
    // Not found
  }

  return null;
}

/**
 * Install PM Agent hooks into a project by copying .mjs files into
 * .claude/hooks/ and writing project-level settings.local.json with
 * relative paths.
 *
 * @param projectPath - Root path of the project
 * @returns The settings object written to disk
 */
export function installHooks(projectPath: string): Record<string, unknown> {
  const hooksSrcDir = resolveHooksSrcPath();
  if (!hooksSrcDir) {
    throw new Error(
      'PM Agent hooks package not found. Make sure @gida-concept/pm-agent-hooks is installed.\n' +
      '  npm install @gida-concept/pm-agent-hooks',
    );
  }

  // Create .claude/hooks/ directory
  const claudeDir = path.join(projectPath, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  // Copy .mjs files
  const filesToCopy = ['hook-utils.mjs', 'pre-tool-use.mjs', 'session-start.mjs'];
  for (const file of filesToCopy) {
    const srcPath = path.join(hooksSrcDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(hooksDir, file));
    }
  }

  // Read or create settings.local.json (preserving existing settings)
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      console.log(Colors.warning('Corrupt settings.local.json, recreating.'));
    }
  }

  // Write relative paths so the hooks survive project relocation
  const hooks: Record<string, string> = (settings.hooks as Record<string, string>) || {};
  hooks.PreToolUse = 'node .claude/hooks/pre-tool-use.mjs';
  hooks.SessionStart = 'node .claude/hooks/session-start.mjs';
  settings.hooks = hooks;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  return settings;
}

/**
 * Get path to .claude/settings.local.json for a project.
 */
function getSettingsPath(projectPath?: string): string {
  const root = projectPath || process.cwd();
  return path.join(root, '.claude', 'settings.local.json');
}

interface HookConfig {
  PreToolUse?: string;
  SessionStart?: string;
}

interface Settings {
  hooks?: HookConfig;
  [key: string]: unknown;
}

/**
 * Check whether a hook value points to PM Agent hook scripts.
 */
function isPmAgentHook(value: string | undefined): boolean {
  if (!value) return false;
  return value.includes('pm-agent-hooks') || value.includes('pre-tool-use.mjs') || value.includes('session-start.mjs');
}

/**
 * pm hooks setup — Write .claude/settings.local.json with PM Agent hooks.
 * Copies hook scripts into .claude/hooks/ and writes relative paths.
 */
export async function hooksSetupCommand(projectPath?: string): Promise<void> {
  const root = projectPath || process.cwd();

  if (!fs.existsSync(root)) {
    throw new PmCliError(`Project path does not exist: ${root}`, ExitCode.CONFIG_ERROR);
  }

  try {
    const settings = installHooks(root);

    console.log(Colors.success('\nPM Agent hooks configured successfully!'));
    console.log(Colors.info(`  Settings: ${path.join(root, '.claude', 'settings.local.json')}`));
    console.log(Colors.muted('  PreToolUse:  ') + Colors.success('ACTIVE'));
    console.log(Colors.muted('  SessionStart: ') + Colors.success('ACTIVE'));
    console.log('');
    console.log(Colors.info('PM Agent will now enforce rules on every Claude Code tool call.'));
    console.log(Colors.info('Restart your Claude Code session for changes to take effect.'));
  } catch (err) {
    if (err instanceof PmCliError) throw err;
    console.log(Colors.warning('\nPM Agent hooks package not found. Install it first:'));
    console.log(Colors.info('  npm install @gida-concept/pm-agent-hooks'));
    console.log(Colors.muted('  (or from the monorepo: npm install -w packages/hooks)'));
  }
}

/**
 * pm hooks status — Check whether PM Agent hooks are active.
 */
export async function hooksStatusCommand(): Promise<void> {
  const settingsPath = getSettingsPath();

  if (!fs.existsSync(settingsPath)) {
    console.log(Colors.warning('\nPM Agent hooks are NOT configured.'));
    console.log(Colors.info('Run `pm hooks setup` to enable them.'));
    return;
  }

  let settings: Settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    console.log(Colors.error('\nFailed to read settings.local.json (corrupt).'));
    console.log(Colors.info('Run `pm hooks setup` to recreate it.'));
    return;
  }

  const hooks = settings.hooks || {};
  const preToolUseActive = isPmAgentHook(hooks.PreToolUse) && fs.existsSync(hooks.PreToolUse?.replace(/^node "/, '').replace(/"$/, '') || '');
  const sessionStartActive = isPmAgentHook(hooks.SessionStart) && fs.existsSync(hooks.SessionStart?.replace(/^node "/, '').replace(/"$/, '') || '');

  console.log(Colors.highlight('\nPM Agent Hooks Status'));
  console.log(Colors.muted('  Settings: ') + Colors.info(settingsPath));
  console.log(Colors.muted('  PreToolUse:  ') + (preToolUseActive ? Colors.success('ACTIVE') : Colors.warning('INACTIVE')));
  console.log(Colors.muted('  SessionStart: ') + (sessionStartActive ? Colors.success('ACTIVE') : Colors.warning('INACTIVE')));
  console.log(Colors.muted('  PreToolUse script: ') + (hooks.PreToolUse ? Colors.muted(hooks.PreToolUse) : Colors.warning('(not set)')));
  console.log(Colors.muted('  SessionStart script: ') + (hooks.SessionStart ? Colors.muted(hooks.SessionStart) : Colors.warning('(not set)')));
}

/**
 * pm hooks remove — Remove PM Agent hooks from project config.
 */
export async function hooksRemoveCommand(projectPath?: string): Promise<void> {
  const root = projectPath || process.cwd();
  const settingsPath = getSettingsPath(root);

  if (!fs.existsSync(settingsPath)) {
    console.log(Colors.warning('\nNo hooks configuration found. Nothing to remove.'));
    return;
  }

  let settings: Settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    throw new PmCliError('Failed to read settings.local.json', ExitCode.CONFIG_ERROR);
  }

  const hooks = settings.hooks || {};
  const hadPreToolUse = isPmAgentHook(hooks.PreToolUse);
  const hadSessionStart = isPmAgentHook(hooks.SessionStart);

  if (!hadPreToolUse && !hadSessionStart) {
    console.log(Colors.warning('\nNo PM Agent hooks found in configuration.'));
    return;
  }

  // Remove PM Agent hook entries
  if (hadPreToolUse) delete hooks.PreToolUse;
  if (hadSessionStart) delete hooks.SessionStart;

  // If no hooks remain, remove the hooks key entirely
  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  } else {
    settings.hooks = hooks;
  }

  // Write back
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  console.log(Colors.success('\nPM Agent hooks removed from project configuration.'));
  console.log(Colors.info(`  Settings: ${settingsPath}`));
  if (hadPreToolUse) console.log(Colors.muted('  PreToolUse: removed'));
  if (hadSessionStart) console.log(Colors.muted('  SessionStart: removed'));
  console.log('');
  console.log(Colors.info('Restart your Claude Code session for changes to take effect.'));
}

/**
 * CLI handler dispatcher.
 */
export async function hooksCommand(action: string, opts: Record<string, any>): Promise<void> {
  switch (action) {
    case 'setup':
      await hooksSetupCommand(opts.projectPath || opts.project_path);
      break;
    case 'status':
      await hooksStatusCommand();
      break;
    case 'remove':
      await hooksRemoveCommand(opts.projectPath || opts.project_path);
      break;
    default:
      console.log(Colors.error(`Unknown hooks action: ${action}`));
      console.log(Colors.info('Available: setup, status, remove'));
  }
}
