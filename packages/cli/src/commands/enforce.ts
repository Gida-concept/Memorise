import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { Colors } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';

// ---------------------------------------------------------------------------
// Hooks installation (Phase 1 — Claude Code hooks)
// ---------------------------------------------------------------------------

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
 */
function resolveHooksSrcPath(): string | null {
  const modulePath = path.dirname(new URL(import.meta.url).pathname);

  // Monorepo dev: walk up from CLI module to find packages/hooks/src
  const monorepoPath = path.resolve(modulePath, '..', '..', '..', '..', 'packages', 'hooks', 'src');
  if (fs.existsSync(path.join(monorepoPath, 'hook-utils.mjs'))) {
    return monorepoPath;
  }

  // Installed package in node_modules
  try {
    const require = createRequire(modulePath);
    const resolved = require.resolve('@gida-concept/pm-agent-hooks/src/pre-tool-use.mjs');
    if (resolved) {
      const srcDir = path.dirname(resolved);
      if (fs.existsSync(path.join(srcDir, 'hook-utils.mjs'))) {
        return srcDir;
      }
    }
  } catch {
    // Not found via require
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
function installHooks(projectPath: string): Record<string, unknown> {
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
  // Claude Code v0.2+ requires array-of-matchers format
  const hooks: Record<string, HookMatcherGroup[]> = (settings.hooks as Record<string, HookMatcherGroup[]>) || {};
  hooks.PreToolUse = [
    {
      hooks: [
        {
          type: 'command',
          command: 'node .claude/hooks/pre-tool-use.mjs',
          args: [],
        },
      ],
    },
  ];
  hooks.SessionStart = [
    {
      hooks: [
        {
          type: 'command',
          command: 'node .claude/hooks/session-start.mjs',
          args: [],
        },
      ],
    },
  ];
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

interface HookMatcherGroup {
  matcher?: string;
  hooks: Array<{
    type: string;
    command?: string;
    args?: string[];
    [key: string]: unknown;
  }>;
}

interface Settings {
  hooks?: Record<string, HookMatcherGroup[]>;
  [key: string]: unknown;
}

/**
 * Check whether a hook configuration has PM Agent hook scripts.
 * Works with the new array-of-matcher-groups format.
 */
function hasPmAgentHook(groups: HookMatcherGroup[] | undefined): boolean {
  if (!groups || !Array.isArray(groups)) return false;
  for (const group of groups) {
    if (!group.hooks || !Array.isArray(group.hooks)) continue;
    for (const hook of group.hooks) {
      const cmd = hook.command || '';
      if (cmd.includes('pm-agent-hooks') || cmd.includes('pre-tool-use.mjs') || cmd.includes('session-start.mjs')) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Multi-client config writing (Phase 4 — MCP Proxy)
// ---------------------------------------------------------------------------

/**
 * Write proxy entry to .cursor/mcp.json for Cursor IDE.
 */
function setupForCursor(projectPath: string): boolean {
  const cursorDir = path.join(projectPath, '.cursor');
  const mcpPath = path.join(cursorDir, 'mcp.json');

  if (!fs.existsSync(cursorDir)) {
    return false; // Cursor not in use
  }

  let config: Record<string, unknown> = {};
  if (fs.existsSync(mcpPath)) {
    try {
      config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    } catch {
      // Corrupt file — start fresh
    }
  }

  const mcpServers = (config.mcpServers as Record<string, unknown>) || {};
  mcpServers['pm-agent'] = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@gida-concept/pm-agent-proxy'],
  };
  config.mcpServers = mcpServers;

  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return true;
}

/**
 * Write proxy entry to .continue/config.json for Continue.dev.
 */
function setupForContinue(projectPath: string): boolean {
  const continueDir = path.join(projectPath, '.continue');
  const configPath = path.join(continueDir, 'config.json');

  if (!fs.existsSync(continueDir)) {
    return false; // Continue not in use
  }

  let config: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // Corrupt file
    }
  }

  const mcpServers = (config.mcpServers as Record<string, unknown>) || {};
  mcpServers['pm-agent'] = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@gida-concept/pm-agent-proxy'],
  };
  config.mcpServers = mcpServers;

  fs.mkdirSync(continueDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return true;
}

/**
 * Write proxy entry to .vscode/settings.json for VS Code (GitHub Copilot).
 */
function setupForVSCode(projectPath: string): boolean {
  const vscodeDir = path.join(projectPath, '.vscode');
  const settingsPath = path.join(vscodeDir, 'settings.json');

  if (!fs.existsSync(vscodeDir)) {
    return false; // VS Code not configured at project level
  }

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      // Corrupt file
    }
  }

  // VS Code uses the experimental MCP configuration format
  const mcp = (settings['github.copilot.chat.mcpServers'] as Record<string, unknown>) || {};
  mcp['pm-agent'] = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@gida-concept/pm-agent-proxy'],
  };
  settings['github.copilot.chat.mcpServers'] = mcp;

  fs.mkdirSync(vscodeDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  return true;
}

/**
 * Write proxy entry to .mcp.json for Claude Code.
 * Replaces the direct PM Agent server entry with the proxy entry.
 */
function setupForClaudeCode(projectPath: string): boolean {
  const mcpPath = path.join(projectPath, '.mcp.json');

  if (!fs.existsSync(mcpPath)) {
    return false; // No MCP config
  }

  try {
    let config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    const mcpServers = (config.mcpServers as Record<string, unknown>) || {};

    // Replace the pm-agent entry with the proxy
    mcpServers['pm-agent'] = {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@gida-concept/pm-agent-proxy'],
    };
    config.mcpServers = mcpServers;

    fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect which clients are in use by checking for their config directories/files.
 */
function detectClients(projectPath: string): string[] {
  const clients: string[] = [];

  if (fs.existsSync(path.join(projectPath, '.cursor'))) clients.push('Cursor');
  if (fs.existsSync(path.join(projectPath, '.continue'))) clients.push('Continue');
  if (fs.existsSync(path.join(projectPath, '.vscode'))) clients.push('VS Code');
  if (fs.existsSync(path.join(projectPath, '.mcp.json'))) clients.push('Claude Code');

  return clients;
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

/**
 * pm enforce setup — Configure PM Agent hooks and proxy for the project.
 * Installs Claude Code hooks + git hooks. Optionally configures other clients.
 */
export async function enforceSetupCommand(projectPath?: string, allClients?: boolean): Promise<void> {
  const root = projectPath || process.cwd();

  if (!fs.existsSync(root)) {
    throw new PmCliError(`Project path does not exist: ${root}`, ExitCode.CONFIG_ERROR);
  }

  // Step 1: Install Claude Code hooks (always)
  let hooksConfigured = false;
  try {
    const settings = installHooks(root);
    hooksConfigured = true;

    console.log(Colors.success('\nPM Agent hooks configured successfully!'));
    console.log(Colors.info(`  Settings: ${path.join(root, '.claude', 'settings.local.json')}`));
    console.log(Colors.muted('  PreToolUse:  ') + Colors.success('ACTIVE'));
    console.log(Colors.muted('  SessionStart: ') + Colors.success('ACTIVE'));
  } catch (err) {
    console.log(Colors.warning('\n  Claude Code hooks: ') + Colors.error('FAILED'));
    console.log(Colors.muted(`  ${(err as Error).message}`));
  }

  // Step 2: Configure clients with proxy
  if (allClients) {
    console.log('');
    console.log(Colors.highlight('Configuring MCP Proxy for detected clients...'));
    console.log('');

    const clients = detectClients(root);
    if (clients.length === 0) {
      console.log(Colors.warning('  No supported clients detected in project.'));
      console.log(Colors.info('  Supported clients: Cursor, Continue, VS Code, Claude Code'));
    } else {
      for (const client of clients) {
        let success = false;
        switch (client) {
          case 'Cursor':
            success = setupForCursor(root);
            break;
          case 'Continue':
            success = setupForContinue(root);
            break;
          case 'VS Code':
            success = setupForVSCode(root);
            break;
          case 'Claude Code':
            success = setupForClaudeCode(root);
            break;
        }
        if (success) {
          console.log(`  ${Colors.muted(client + ':')} ${Colors.success('CONFIGURED')} (proxy: @gida-concept/pm-agent-proxy)`);
        } else {
          console.log(`  ${Colors.muted(client + ':')} ${Colors.warning('SKIPPED')}`);
        }
      }
    }
  }

  // Summary
  console.log('');
  if (hooksConfigured) {
    console.log(Colors.success('PM Agent enforcement is now ACTIVE for this project.'));
    console.log(Colors.info('Restart your Claude Code session for hook changes to take effect.'));
  }

  if (!allClients) {
    console.log('');
    console.log(Colors.muted('To configure additional clients (Cursor, Continue, VS Code), run:'));
    console.log(Colors.info('  pm enforce setup --all'));
  }
}

/**
 * pm enforce status — Show enforcement status.
 */
export async function enforceStatusCommand(): Promise<void> {
  const root = process.cwd();
  const settingsPath = getSettingsPath();

  console.log(Colors.highlight('\nPM Agent Enforcement Status'));
  console.log(Colors.muted('  Project: ') + Colors.info(root));
  console.log('');

  // Check Claude Code hooks
  let preToolUseActive = false;
  let sessionStartActive = false;

  if (fs.existsSync(settingsPath)) {
    try {
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const hooks = settings.hooks || {};
      const preToolUseGroups = hooks.PreToolUse as HookMatcherGroup[] | undefined;
      const sessionStartGroups = hooks.SessionStart as HookMatcherGroup[] | undefined;
      preToolUseActive = hasPmAgentHook(preToolUseGroups);
      sessionStartActive = hasPmAgentHook(sessionStartGroups);
    } catch {
      // Corrupt
    }
  }

  console.log(Colors.muted('  Claude Code Hooks:'));
  console.log(Colors.muted('    PreToolUse:  ') + (preToolUseActive ? Colors.success('ACTIVE') : Colors.warning('INACTIVE')));
  console.log(Colors.muted('    SessionStart: ') + (sessionStartActive ? Colors.success('ACTIVE') : Colors.warning('INACTIVE')));

  // Check client configs
  console.log('');
  console.log(Colors.muted('  MCP Proxy Configurations:'));

  const clients = detectClients(root);
  if (clients.length === 0) {
    console.log(Colors.muted('    No supported clients detected.'));
  } else {
    for (const client of clients) {
      let configured = false;
      let configPath = '';

      switch (client) {
        case 'Cursor': {
          const p = path.join(root, '.cursor', 'mcp.json');
          configPath = p;
          if (fs.existsSync(p)) {
            try {
              const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
              const server = (c.mcpServers as Record<string, unknown>)?.['pm-agent'] as Record<string, unknown> | undefined;
              configured = server?.command === 'npx' && Array.isArray(server?.args) && server.args.includes('@gida-concept/pm-agent-proxy');
            } catch { /* ignore */ }
          }
          break;
        }
        case 'Continue': {
          const p = path.join(root, '.continue', 'config.json');
          configPath = p;
          if (fs.existsSync(p)) {
            try {
              const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
              const server = (c.mcpServers as Record<string, unknown>)?.['pm-agent'] as Record<string, unknown> | undefined;
              configured = server?.command === 'npx' && Array.isArray(server?.args) && server.args.includes('@gida-concept/pm-agent-proxy');
            } catch { /* ignore */ }
          }
          break;
        }
        case 'VS Code': {
          const p = path.join(root, '.vscode', 'settings.json');
          configPath = p;
          if (fs.existsSync(p)) {
            try {
              const s = JSON.parse(fs.readFileSync(p, 'utf-8'));
              const server = (s['github.copilot.chat.mcpServers'] as Record<string, unknown>)?.['pm-agent'] as Record<string, unknown> | undefined;
              configured = server?.command === 'npx' && Array.isArray(server?.args) && server.args.includes('@gida-concept/pm-agent-proxy');
            } catch { /* ignore */ }
          }
          break;
        }
        case 'Claude Code': {
          const p = path.join(root, '.mcp.json');
          configPath = p;
          if (fs.existsSync(p)) {
            try {
              const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
              const server = (c.mcpServers as Record<string, unknown>)?.['pm-agent'] as Record<string, unknown> | undefined;
              configured = server?.command === 'npx' && Array.isArray(server?.args) && server.args.includes('@gida-concept/pm-agent-proxy');
            } catch { /* ignore */ }
          }
          break;
        }
      }

      const status = configured ? Colors.success('PROXY') : Colors.warning('DIRECT');
      console.log(`    ${Colors.muted(client + ':')} ${status}`);
      if (configPath) {
        console.log(Colors.muted(`      Config: ${configPath}`));
      }
    }
  }

  // Rules
  console.log('');
  console.log(Colors.muted('  Rules:'));
  const pmAgentConfig = process.env.PM_AGENT_CONFIG || '';
  if (pmAgentConfig) {
    console.log(Colors.muted(`    Config: ${Colors.info(pmAgentConfig)}`));
    console.log(Colors.muted('    Status: ') + Colors.success('ENABLED'));
  } else {
    const home = process.env.HOME || process.env.USERPROFILE || '~';
    const defaultConfigDir = path.resolve(home.replace(/^~/, home), '.config', 'pm-agent');
    if (fs.existsSync(defaultConfigDir)) {
      console.log(Colors.muted(`    Config dir: ${Colors.info(defaultConfigDir)}`));
      console.log(Colors.muted('    Status: ') + Colors.success('FOUND'));
    } else {
      console.log(Colors.muted('    Status: ') + Colors.warning('NOT CONFIGURED'));
      console.log(Colors.muted('    Run `pm init` to set up PM Agent configuration.'));
    }
  }

  console.log('');
}

/**
 * pm enforce remove — Remove all PM Agent enforcement config.
 */
export async function enforceRemoveCommand(projectPath?: string): Promise<void> {
  const root = projectPath || process.cwd();

  // Remove Claude Code hooks
  const settingsPath = getSettingsPath(root);
  let hooksRemoved = false;

  if (fs.existsSync(settingsPath)) {
    try {
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const hooks = settings.hooks || {};
      const preToolUseGroups = hooks.PreToolUse as HookMatcherGroup[] | undefined;
      const sessionStartGroups = hooks.SessionStart as HookMatcherGroup[] | undefined;
      const hadPreToolUse = hasPmAgentHook(preToolUseGroups);
      const hadSessionStart = hasPmAgentHook(sessionStartGroups);

      if (hadPreToolUse) delete hooks.PreToolUse;
      if (hadSessionStart) delete hooks.SessionStart;

      if (Object.keys(hooks).length === 0) {
        delete settings.hooks;
      } else {
        settings.hooks = hooks;
      }

      if (hadPreToolUse || hadSessionStart) {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
        hooksRemoved = true;
      }
    } catch {
      // Corrupt
    }
  }

  // Restore direct PM Agent server in .mcp.json (remove proxy)
  const mcpPath = path.join(root, '.mcp.json');
  let claudeCodeRestored = false;
  if (fs.existsSync(mcpPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      const mcpServers = (config.mcpServers as Record<string, unknown>) || {};
      const pmAgentServer = mcpServers['pm-agent'] as Record<string, unknown> | undefined;

      if (pmAgentServer && pmAgentServer.command === 'npx' && Array.isArray(pmAgentServer.args) && pmAgentServer.args.includes('@gida-concept/pm-agent-proxy')) {
        // Restore direct server config
        mcpServers['pm-agent'] = {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@gida-concept/pm-agent-mcp-server'],
        };
        config.mcpServers = mcpServers;
        fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
        claudeCodeRestored = true;
      }
    } catch {
      // Corrupt
    }
  }

  // Remove Cursor proxy entry
  const cursorMcpPath = path.join(root, '.cursor', 'mcp.json');
  let cursorRestored = false;
  if (fs.existsSync(cursorMcpPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(cursorMcpPath, 'utf-8'));
      const mcpServers = (config.mcpServers as Record<string, unknown>) || {};
      const pmAgentServer = mcpServers['pm-agent'] as Record<string, unknown> | undefined;

      if (pmAgentServer && pmAgentServer.command === 'npx' && Array.isArray(pmAgentServer.args) && pmAgentServer.args.includes('@gida-concept/pm-agent-proxy')) {
        // Restore direct server config
        mcpServers['pm-agent'] = {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@gida-concept/pm-agent-mcp-server'],
        };
        config.mcpServers = mcpServers;
        fs.writeFileSync(cursorMcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
        cursorRestored = true;
      }
    } catch {
      // Corrupt
    }
  }

  // Output
  if (hooksRemoved) {
    console.log(Colors.success('\nPM Agent hooks removed from Claude Code configuration.'));
  }

  if (claudeCodeRestored) {
    console.log(Colors.success('PM Agent MCP server restored to direct mode for Claude Code.'));
  }

  if (cursorRestored) {
    console.log(Colors.success('PM Agent MCP server restored to direct mode for Cursor.'));
  }

  if (!hooksRemoved && !claudeCodeRestored && !cursorRestored) {
    console.log(Colors.warning('\nNo PM Agent enforcement configuration found. Nothing to remove.'));
    return;
  }

  console.log('');
  console.log(Colors.info('PM Agent enforcement removed.'));
  console.log(Colors.info('Restart your client sessions for changes to take effect.'));
}

// ---------------------------------------------------------------------------
// CLI handler dispatcher
// ---------------------------------------------------------------------------

export async function enforceCommand(action: string, opts: Record<string, any>): Promise<void> {
  switch (action) {
    case 'setup':
      await enforceSetupCommand(opts.projectPath || opts.project_path, opts.all);
      break;
    case 'status':
      await enforceStatusCommand();
      break;
    case 'remove':
      await enforceRemoveCommand(opts.projectPath || opts.project_path);
      break;
    default:
      console.log(Colors.error(`Unknown enforce action: ${action}`));
      console.log(Colors.info('Available: setup, status, remove'));
  }
}
