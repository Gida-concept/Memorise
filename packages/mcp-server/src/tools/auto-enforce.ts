import { loadConfig, loadRules, enforce } from '@gida-concept/pm-agent-core';

/**
 * Infer the operation type from a tool name.
 * e.g., pm_get_context → "read", pm_log_decision → "log"
 */
function inferOperation(toolName: string): string {
  const base = toolName.replace(/^pm_/, '');
  const op = base.split('_')[0];
  const opMap: Record<string, string> = {
    get: 'read',
    log: 'log',
    add: 'add',
    scan: 'scan',
    check: 'check',
    prep: 'prepare',
    search: 'search',
    enforce: 'enforce',
    analyze: 'analyze',
  };
  return opMap[op] || 'unknown';
}

/**
 * Infer the entity from a tool name.
 * e.g., pm_get_context → "context", pm_log_decision → "decision"
 */
function inferEntity(toolName: string): string {
  const parts = toolName.replace(/^pm_/, '').split('_');
  return parts[parts.length - 1] || 'unknown';
}

/**
 * Auto-enforce PM Agent rules before every tool call.
 *
 * Builds a context object from the tool name, inferred operation/entity,
 * and tool arguments, then evaluates all enabled rules against it.
 *
 * If a hard rule blocks the call, returns `{ blocked: true, result }` with
 * the enforcement details. Otherwise returns `{ blocked: false }`.
 *
 * On errors (no config, parse failures, etc.) the tool is allowed through
 * so auto-enforcement never breaks the MCP server.
 */
export function autoEnforce(
  toolName: string,
  args: Record<string, unknown>,
): { blocked: false } | { blocked: true; result: Record<string, unknown> } {
  try {
    const config = loadConfig();
    if (config.rules?.enabled === false) return { blocked: false };

    const rulesPath = config.rules?.config_path;
    if (!rulesPath) return { blocked: false };

    const rules = loadRules(rulesPath);
    if (rules.length === 0) return { blocked: false };

    // Build rich context for rule evaluation.
    // Includes tool metadata and all tool arguments for direct property access.
    const context: Record<string, unknown> = {
      tool_name: toolName,
      action: `calling ${toolName}`,
      operation: inferOperation(toolName),
      entity: inferEntity(toolName),
      tool_args: args,
      // Spread args so rules can reference argument properties directly:
      // e.g. trigger = "title && title.contains('deploy')" works on pm_log_decision({ title: "deploy v2" })
      ...args,
    };

    const result = enforce(rules, context);

    if (result.blocked) {
      const blockedRule = result.results.find(
        (r: { action: string; passed: boolean }) => r.action === 'block' && !r.passed,
      );
      return {
        blocked: true,
        result: {
          status: 'rejected',
          error: blockedRule?.message || 'Blocked by rule enforcement',
          blocked_by: blockedRule?.rule || 'unknown',
          rules_evaluation: {
            status: result.status,
            results: result.results,
            rules_evaluated: result.rules_evaluated,
            rules_triggered: result.rules_triggered,
            rules_blocked: result.rules_blocked,
            blocked: result.blocked,
            confirmation_required: result.confirmation_required,
          },
        },
      };
    }

    return { blocked: false };
  } catch (err) {
    // Don't crash on enforcement errors — log and allow through
    console.error(`[pm-agent] Auto-enforcement error for ${toolName}:`, err);
    return { blocked: false };
  }
}
