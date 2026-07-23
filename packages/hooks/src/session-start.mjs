#!/usr/bin/env node

/**
 * PM Agent SessionStart Hook
 *
 * Runs once when a Claude Code session starts. Loads PM Agent context,
 * displays active rules, and sets environment variables.
 *
 * Claude Code hook contract:
 *   export async function sessionStart() -> { instructions?, environment? }
 *
 * Never crashes Claude Code — all errors are caught and return {}.
 */

export async function sessionStart() {
  try {
    const { resolveConfig, loadRules } = await import('./hook-utils.mjs');

    const config = resolveConfig();

    // Load active rules using the inline TOML parser
    let rulesList = '(no rules loaded)';

    try {
      if (config?.rules?.config_path) {
        const rules = loadRules(config.rules.config_path);
        const activeRules = rules.filter(r => r.enabled !== false);
        if (activeRules.length > 0) {
          rulesList = activeRules
            .map(r => `  [${r.severity}] ${r.name}: ${r.description || r.trigger}`)
            .join('\n');
        } else {
          rulesList = '  (no active rules)';
        }
      }
    } catch {
      // Rule loading failed silently
    }

    return {
      instructions: `[PM Agent - ACTIVE]
PM Agent rules are enforced for this session. The PreToolUse hook checks every destructive operation.

Active rules:
${rulesList}

You MUST:
1. BEFORE changing anything — call \`pm_get_context\` to understand current project state
2. BEFORE finalizing — call \`pm_enforce_rules\` to verify no violations
3. AFTER decisions — call \`pm_log_decision\` to record them
4. REVIEW notes — call \`pm_get_notes\` before starting new work`,
      environment: {
        PM_AGENT_ACTIVE: 'true',
        PM_AGENT_CONFIG: config?.rules?.config_path || '',
      },
    };
  } catch (e) {
    // Never crash Claude Code from a hook
    console.error('[PM Agent] SessionStart hook error:', e.message);
    return {};
  }
}
