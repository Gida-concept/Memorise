import { loadRules, enforce, type EnforcementResult, type Rule } from '@pm-agent/core';
import type { PmAgentConfig } from '@pm-agent/core';

export function handleRules(config: PmAgentConfig, scope: 'pm' | 'code', context: Record<string, unknown>): EnforcementResult | null {
  const rulesPath = config.rules?.config_path;
  if (config.rules?.enabled === false || !rulesPath) return null;

  const rules: Rule[] = loadRules(rulesPath, scope);
  if (rules.length === 0) return null;

  return enforce(rules, context);
}

/**
 * Wraps a response with the enforcement result handling.
 * For MCP: can't do interactive prompts, so we return structured results.
 */
export function wrapEnforcementResult(result: Record<string, unknown>, enforcement: EnforcementResult | null): Record<string, unknown> {
  if (!enforcement) return result;

  return {
    ...result,
    rules_evaluation: {
      status: enforcement.status,
      results: enforcement.results,
      rules_evaluated: enforcement.rules_evaluated,
      rules_triggered: enforcement.rules_triggered,
      rules_blocked: enforcement.rules_blocked,
      blocked: enforcement.blocked,
      confirmation_required: enforcement.confirmation_required,
    },
  };
}
