import { loadConfig, addRule } from '@gida-concept/pm-agent-core';
import { throwInputError, throwConfigError } from './db-utils.js';

export async function handleAddRule(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!args.name || !args.trigger || !args.action || !args.severity || !args.scope) {
    throwInputError('Required parameters: name, scope, trigger, action, severity');
  }

  try {
    const config = loadConfig();
    const rulesPath = config.rules?.config_path;
    if (!rulesPath) {
      throwConfigError('Rules path not configured. Run `pm init` first.');
    }

    addRule(rulesPath, {
      name: String(args.name),
      scope: String(args.scope) as 'pm' | 'code' | 'all',
      trigger: String(args.trigger),
      condition: args.condition !== undefined ? String(args.condition) : undefined,
      action: String(args.action),
      severity: String(args.severity) as 'hard' | 'soft' | 'info',
      description: args.description !== undefined ? String(args.description) : undefined,
      enabled: true,
    });

    return { status: 'completed', message: `Rule '${String(args.name)}' added`, rule: args };
  } catch (err) {
    throwConfigError(`Failed to add rule: ${(err as Error).message}`);
  }
}
