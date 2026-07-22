import fs from 'fs';
import path from 'path';
import toml from 'toml';

export interface PmAgentConfig {
  project: {
    name: string;
    root: string;
    description?: string;
  };
  integrations?: {
    github?: { repo?: string; token?: string; host?: string; };
    linear?: { workspace?: string; api_key?: string; };
    slack?: { workspace?: string; token?: string; channels?: string[]; };
  };
  ai?: {
    provider?: 'anthropic' | 'openai' | 'google' | 'local';
    api_key?: string;
    model?: string;
    base_url?: string;
  };
  rules?: {
    config_path?: string;
    enabled?: boolean;
  };
  memory?: {
    storage?: string;
    path?: string;
    retention_days?: number;
  };
  scan?: {
    exclude_patterns?: string[];
    max_file_size_mb?: number;
    follow_symlinks?: boolean;
    watch_enabled?: boolean;
  };
}

function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => {
    return process.env[name] ?? '';
  });
}

function walkAndInterpolate(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return interpolateEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(walkAndInterpolate);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = walkAndInterpolate(value);
    }
    return result;
  }
  return obj;
}

function resolveConfigPath(): string {
  return (
    process.env.PM_AGENT_CONFIG ||
    path.join(
      process.env.HOME || process.env.USERPROFILE || '~',
      '.config',
      'pm-agent',
      'config.toml',
    )
  );
}

export function loadConfig(overridePath?: string): PmAgentConfig {
  const configPath = overridePath || resolveConfigPath();
  const resolvedPath = configPath.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '');

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Configuration file not found at ${resolvedPath}. Run \`pm init\` to create it.`,
    );
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = toml.parse(raw);

  return walkAndInterpolate(parsed) as PmAgentConfig;
}

export function getDefaultConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '~';
  return path.join(home, '.config', 'pm-agent', 'config.toml');
}

export function getDefaultDataDir(projectName: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '~';
  return path.join(home, '.local', 'share', 'pm-agent', `${projectName}.db`);
}
