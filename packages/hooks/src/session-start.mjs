#!/usr/bin/env node

/**
 * PM Agent SessionStart Hook
 *
 * Runs once when a Claude Code session starts. Injects ironclad instructions
 * into the system prompt — the AI reads these BEFORE EVERY RESPONSE because
 * they're part of its core system prompt.
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

    // Load active rules
    let rulesBlock = '(no rules loaded)';
    let projectName = 'this project';

    try {
      if (config?.rules?.config_path) {
        const rules = loadRules(config.rules.config_path);
        const activeRules = rules.filter(r => r.enabled !== false);
        if (activeRules.length > 0) {
          rulesBlock = activeRules
            .map(r => `  [${r.severity}] ${r.name}: ${r.description || r.trigger}`)
            .join('\n');
        } else {
          rulesBlock = '  (no active rules)';
        }
      }
      if (config?.project?.name) {
        projectName = config.project.name;
      }
    } catch {
      // Best-effort
    }

    return {
      instructions: `=== PM AGENT — MANDATORY PROJECT ENFORCEMENT ===
Project: ${projectName}

You are REQUIRED to follow PM Agent workflow on EVERY interaction. These are not suggestions — they are enforced rules.

▸ BEFORE every response, you MUST check PM Agent context.
▸ BEFORE writing any file or running any command, call \`pm_get_context\` or run \`pm context\` to understand current state.
▸ If you attempt a write operation without checking context first, the PreToolUse hook WILL BLOCK IT.
▸ Log ALL decisions with \`pm_log_decision\` — not logging a decision is a violation.
▸ Check active blockers with \`pm_get_blockers\` before starting new work.

Active project rules:
${rulesBlock}

FAILURE TO FOLLOW THIS WORKFLOW WILL RESULT IN BLOCKED OPERATIONS.
The PreToolUse hook enforces this at the tool-call level — you cannot bypass it.`,
      environment: {
        PM_AGENT_ACTIVE: 'true',
        PM_AGENT_ENFORCED: 'true',
        PM_AGENT_PROJECT: projectName,
        PM_AGENT_CONFIG: config?.rules?.config_path || '',
      },
    };
  } catch (e) {
    // Never crash Claude Code from a hook
    console.error('[PM Agent] SessionStart hook error:', e.message);
    return {};
  }
}
