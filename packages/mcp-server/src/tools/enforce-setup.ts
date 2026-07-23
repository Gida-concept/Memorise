import fs from 'fs';
import path from 'path';

/**
 * Resolve the MCP server entry for a given package — prefers local install
 * over npx so the server survives offline and doesn't hit native module issues.
 */
function resolveServerEntry(projectPath: string, packageName: string): { command: string; args: string[] } {
  const localPath = path.join(projectPath, 'node_modules', ...packageName.split('/'), 'dist', 'index.js');
  if (fs.existsSync(localPath)) {
    return { command: 'node', args: [localPath] };
  }
  return { command: 'npx', args: ['-y', packageName] };
}
import { createRequire } from 'module';

/**
 * pm_enforce_setup — Configure PM Agent enforcement for a project.
 *
 * Installs Claude Code hooks (via .claude/settings.local.json) and optionally
 * writes MCP proxy configuration for other supported clients.
 *
 * This tool NEVER touches ~/.claude/settings.json — only project-level files.
 */

interface HookMatcherGroup {
  matcher?: string;
  hooks: Array<{
    type: string;
    command: string;
    args?: string[];
  }>;
}

interface Settings {
  hooks?: Record<string, HookMatcherGroup[]>;
  [key: string]: unknown;
}

/**
 * Resolve the path to the hooks source directory.
 */
function resolveHooksSrcPath(startFrom: string): string | null {
  // 1. Resolve via package.json
  try {
    const require = createRequire(path.join(startFrom, 'noop.mjs'));
    const pkgJsonPath = require.resolve('@gida-concept/pm-agent-hooks/package.json');
    const pkgDir = path.dirname(pkgJsonPath);
    const srcDir = path.join(pkgDir, 'src');
    if (fs.existsSync(path.join(srcDir, 'hook-utils.mjs'))) {
      return srcDir;
    }
  } catch {
    // Fallback below
  }

  // 2. Try direct node_modules path from cwd
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
 * Copy hook .mjs files into .claude/hooks/ and write settings.local.json.
 */
function copyHooksAndWriteConfig(projectPath: string, hooksSrcDir: string): Settings {
  const claudeDir = path.join(projectPath, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');

  fs.mkdirSync(hooksDir, { recursive: true });

  const filesToCopy = ['hook-utils.mjs', 'pre-tool-use.mjs', 'session-start.mjs'];
  for (const file of filesToCopy) {
    const srcPath = path.join(hooksSrcDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(hooksDir, file));
    }
  }

  const settingsPath = path.join(claudeDir, 'settings.local.json');
  let settings: Settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      console.error(`[pm-agent] Corrupt settings file at ${settingsPath}, recreating.`);
    }
  }

  const hooks: Record<string, HookMatcherGroup[]> = settings.hooks || {};
  hooks.PreToolUse = [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: 'node',
          args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/pre-tool-use.mjs'],
        },
      ],
    },
  ];
  hooks.SessionStart = [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: 'node',
          args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/session-start.mjs'],
        },
      ],
    },
  ];
  settings.hooks = hooks;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  return settings;
}

/**
 * Write proxy entry to .cursor/mcp.json.
 */
function setupCursorProxy(projectPath: string): boolean {
  const cursorDir = path.join(projectPath, '.cursor');
  const mcpPath = path.join(cursorDir, 'mcp.json');

  if (!fs.existsSync(cursorDir)) return false;

  let config: Record<string, unknown> = {};
  if (fs.existsSync(mcpPath)) {
    try {
      config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    } catch { /* corrupt */ }
  }

  const mcpServers = (config.mcpServers as Record<string, unknown>) || {};
  mcpServers['pm-agent'] = {
    type: 'stdio',
    ...resolveServerEntry(projectPath, '@gida-concept/pm-agent-proxy'),
  };
  config.mcpServers = mcpServers;

  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return true;
}

/**
 * Write proxy entry to .continue/config.json.
 */
function setupContinueProxy(projectPath: string): boolean {
  const continueDir = path.join(projectPath, '.continue');
  const configPath = path.join(continueDir, 'config.json');

  if (!fs.existsSync(continueDir)) return false;

  let config: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch { /* corrupt */ }
  }

  const mcpServers = (config.mcpServers as Record<string, unknown>) || {};
  mcpServers['pm-agent'] = {
    type: 'stdio',
    ...resolveServerEntry(projectPath, '@gida-concept/pm-agent-proxy'),
  };
  config.mcpServers = mcpServers;

  fs.mkdirSync(continueDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return true;
}

/**
 * Write proxy entry to .vscode/settings.json.
 */
function setupVSCodeProxy(projectPath: string): boolean {
  const vscodeDir = path.join(projectPath, '.vscode');
  const settingsPath = path.join(vscodeDir, 'settings.json');

  if (!fs.existsSync(vscodeDir)) return false;

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch { /* corrupt */ }
  }

  const mcp = (settings['github.copilot.chat.mcpServers'] as Record<string, unknown>) || {};
  mcp['pm-agent'] = {
    type: 'stdio',
    ...resolveServerEntry(projectPath, '@gida-concept/pm-agent-proxy'),
  };
  settings['github.copilot.chat.mcpServers'] = mcp;

  fs.mkdirSync(vscodeDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  return true;
}

/**
 * Write proxy entry to .mcp.json (Claude Code).
 */
function setupClaudeCodeProxy(projectPath: string): boolean {
  const mcpPath = path.join(projectPath, '.mcp.json');

  if (!fs.existsSync(mcpPath)) return false;

  try {
    const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    const mcpServers = (config.mcpServers as Record<string, unknown>) || {};
    mcpServers['pm-agent'] = resolveServerEntry(projectPath, '@gida-concept/pm-agent-proxy');
    config.mcpServers = mcpServers;
    fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export async function handleEnforceSetup(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const projectPath = args.project_path ? String(args.project_path) : undefined;
  if (!projectPath) {
    return { success: false, error: 'Missing required parameter: project_path' };
  }

  if (!fs.existsSync(projectPath)) {
    return { success: false, error: `Project path does not exist: ${projectPath}` };
  }

  const allClients = args.all_clients === true;

  // Step 1: Install Claude Code hooks
  const mcpDir = path.dirname(new URL(import.meta.url).pathname);
  const hooksSrcDir = resolveHooksSrcPath(mcpDir);

  let hooksConfigured = false;
  let hooksError: string | undefined;

  if (!hooksSrcDir) {
    hooksError = 'Could not resolve @gida-concept/pm-agent-hooks package. Make sure it is installed.';
  } else {
    const preToolUsePath = path.join(hooksSrcDir, 'pre-tool-use.mjs');
    const sessionStartPath = path.join(hooksSrcDir, 'session-start.mjs');

    if (!fs.existsSync(preToolUsePath) || !fs.existsSync(sessionStartPath)) {
      hooksError = `Hook scripts not found in package at ${hooksSrcDir}.`;
    } else {
      try {
        const settings = copyHooksAndWriteConfig(projectPath, hooksSrcDir);
        hooksConfigured = true;

        const result: Record<string, unknown> = {
          success: true,
          hooks: {
            status: 'configured',
            path: path.join(projectPath, '.claude', 'settings.local.json'),
            PreToolUse: settings.hooks?.PreToolUse,
            SessionStart: settings.hooks?.SessionStart,
          },
        };

        // Step 2: Optionally configure other clients
        if (allClients) {
          const clients: Record<string, string> = {};

          const clientsToTry: [string, (p: string) => boolean][] = [
            ['Cursor', setupCursorProxy],
            ['Continue', setupContinueProxy],
            ['VS Code', setupVSCodeProxy],
            ['Claude Code', setupClaudeCodeProxy],
          ];

          for (const [name, setupFn] of clientsToTry) {
            if (setupFn(projectPath)) {
              clients[name] = 'configured';
            }
          }

          result.clients = clients;
        }

        return result;
      } catch (err) {
        hooksError = `Failed to write hooks config: ${(err as Error).message}`;
      }
    }
  }

  return {
    success: false,
    hooks_configured: hooksConfigured,
    error: hooksError || 'Unknown error setting up enforcement',
  };
}
