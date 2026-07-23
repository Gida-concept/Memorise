import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

/**
 * pm_hooks_setup — Configure PM Agent hooks for a project.
 *
 * Reads/writes .claude/settings.local.json at the project root to register
 * PreToolUse and SessionStart hooks that enforce PM Agent rules at the
 * Claude Code client level.
 *
 * Hooks are copied into .claude/hooks/ and referenced with relative paths
 * so they survive project relocation.
 *
 * This tool NEVER touches ~/.claude/settings.json — only the project-level
 * local settings file.
 */

interface HookMatcherGroup {
  matcher?: string | boolean;
  command?: string;
  hooks?: Array<{
    type: string;
    command: string;
    args?: string[];
    [key: string]: unknown;
  }>;
}

interface Settings {
  hooks?: Record<string, HookMatcherGroup[]>;
  [key: string]: unknown;
}

/**
 * Resolve the path to the hooks source directory by looking up
 * @gida-concept/pm-agent-hooks via createRequire, then walking
 * to the src/ directory containing the .mjs files.
 */
function resolveHooksSrcPath(startFrom: string): string | null {
  const searchDirs = [
    startFrom,
    path.resolve(startFrom, '..'),           // node_modules peer
    path.resolve(startFrom, '..', '..'),     // workspace root
    process.cwd(),
  ];

  for (const dir of searchDirs) {
    try {
      const require = createRequire(path.join(dir, 'noop.mjs'));
      const resolved = require.resolve('@gida-concept/pm-agent-hooks');
      if (resolved) {
        // resolved points to exports entry; walk up to package root
        let pkgDir = path.dirname(resolved);
        while (pkgDir !== path.dirname(pkgDir)) {
          if (fs.existsSync(path.join(pkgDir, 'package.json'))) {
            const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
            if (pkg.name === '@gida-concept/pm-agent-hooks') {
              const srcDir = path.join(pkgDir, 'src');
              if (fs.existsSync(path.join(srcDir, 'hook-utils.mjs'))) {
                return srcDir;
              }
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
 * Copy hook .mjs files into .claude/hooks/ and write settings.local.json
 * with relative paths.
 */
function copyHooksAndWriteConfig(projectPath: string, hooksSrcDir: string): Settings {
  const claudeDir = path.join(projectPath, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');

  // Create .claude/hooks/ directory
  fs.mkdirSync(hooksDir, { recursive: true });

  // Copy .mjs files
  const filesToCopy = ['hook-utils.mjs', 'pre-tool-use.mjs', 'session-start.mjs'];
  for (const file of filesToCopy) {
    const srcPath = path.join(hooksSrcDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(hooksDir, file));
    }
  }

  // Read or create settings.local.json
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  let settings: Settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      // Corrupt file — start fresh
      console.error(`[pm-agent] Corrupt settings file at ${settingsPath}, recreating.`);
    }
  }

  const hooks: Record<string, HookMatcherGroup[]> = settings.hooks || {};

  // Set PM Agent hooks with relative paths
  hooks.PreToolUse = [
    {
      matcher: true,
      command: 'node .claude/hooks/pre-tool-use.mjs',
    },
  ];
  hooks.SessionStart = [
    {
      matcher: true,
      command: 'node .claude/hooks/session-start.mjs',
    },
  ];

  settings.hooks = hooks;

  // Write back
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  return settings;
}

export async function handleHooksSetup(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const projectPath = args.project_path ? String(args.project_path) : undefined;
  if (!projectPath) {
    return {
      success: false,
      error: 'Missing required parameter: project_path',
    };
  }

  // Verify project path exists
  if (!fs.existsSync(projectPath)) {
    return {
      success: false,
      error: `Project path does not exist: ${projectPath}`,
    };
  }

  // Resolve hooks src directory from MCP server location
  const mcpDir = path.dirname(new URL(import.meta.url).pathname);
  const hooksSrcDir = resolveHooksSrcPath(mcpDir);

  if (!hooksSrcDir) {
    return {
      success: false,
      error: `Could not resolve @gida-concept/pm-agent-hooks. Make sure it is installed.

To install:
  npm install @gida-concept/pm-agent-hooks

Or if using the monorepo:
  npm install -w packages/hooks`,
    };
  }

  // Verify hook scripts exist in source
  const preToolUsePath = path.join(hooksSrcDir, 'pre-tool-use.mjs');
  const sessionStartPath = path.join(hooksSrcDir, 'session-start.mjs');

  if (!fs.existsSync(preToolUsePath) || !fs.existsSync(sessionStartPath)) {
    return {
      success: false,
      error: `Hook scripts not found in package at ${hooksSrcDir}. Expected:
  - pre-tool-use.mjs (exists: ${fs.existsSync(preToolUsePath)})
  - session-start.mjs (exists: ${fs.existsSync(sessionStartPath)})`,
    };
  }

  try {
    const settings = copyHooksAndWriteConfig(projectPath, hooksSrcDir);

    return {
      success: true,
      path: path.join(projectPath, '.claude', 'settings.local.json'),
      hooks: {
        PreToolUse: settings.hooks?.PreToolUse,
        SessionStart: settings.hooks?.SessionStart,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to write hooks config: ${(err as Error).message}`,
    };
  }
}
