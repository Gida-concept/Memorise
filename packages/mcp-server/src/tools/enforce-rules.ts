import { loadRules, enforce, loadConfig } from '@gida-concept/pm-agent-core';
import { throwInputError, throwConfigError } from './db-utils.js';

export async function handleEnforceRules(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!args.context) {
    throwInputError('Required parameter "context" missing');
  }

  try {
    const config = loadConfig();
    const rulesPath = config.rules?.config_path;
    if (!rulesPath) {
      throwConfigError('Rules path not configured. Run `pm init` first.');
    }

    const scopeStr = args.scope !== undefined ? String(args.scope) : undefined;
    // 'all' means no scope filter; pass undefined to load all rules
    const loadScope = scopeStr === 'all' ? undefined : scopeStr as 'pm' | 'code' | undefined;
    const rules = loadRules(rulesPath, loadScope);
    const enforcement = enforce(rules, args.context as Record<string, unknown>);

    let status: string;
    if (enforcement.status === 'rejected') {
      status = 'rejected';
    } else if (enforcement.status === 'pending_confirmation') {
      status = 'pending_confirmation';
    } else {
      status = 'completed';
    }

    return {
      status,
      rules_evaluation: enforcement,
    };
  } catch (err) {
    throwConfigError(`Rules enforcement failed: ${(err as Error).message}`);
  }
}
