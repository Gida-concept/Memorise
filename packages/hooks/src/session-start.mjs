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
      instructions: `=== PM AGENT — MANDATORY PER-RESPONSE ENFORCEMENT ===
Project: ${projectName}

You are REQUIRED to follow PM Agent workflow on EVERY response. These are not suggestions — they are ENFORCED at the hook level.

▸ The PreToolUse hook BLOCKS EVERY tool call unless you call PM Agent CLI commands first.
▸ You MUST run ! pm context or ! pm status in EVERY response before using any other tool.
▸ Without it, ALL Write, Read, Bash, Edit, and other tool calls are BLOCKED.
▸ Only AskUserQuestion is allowed to pass through.

DECISION LOGGING IS PER-RESPONSE (NOT SESSION-PERSISTENT):
▸ ! pm log must be run in EVERY response before any write/destructive tool.
▸ The hook WILL BLOCK write tools if ! pm log hasn't been called in THIS response.
▸ Log ALL architectural decisions, feature implementations, and configuration changes.
▸ Not logging a decision before modifying files is a VIOLATION.

WORKFLOW FOR EVERY RESPONSE:
  1. ! pm context — load project snapshot (BLOCKED without this)
  2. ! pm log "What you are doing and why" — log your intent (BLOCKED for writes without this)
  3. Proceed with write tools (allowed only after step 2)
  4. ! pm note "insight" — log anything discovered during work

Available CLI commands from Claude Code:
  ! pm status         — Project overview
  ! pm blockers       — Check active blockers
  ! pm log "Title"    — Log a decision
  ! pm note "text"    — Take a note
  ! pm scope "desc"   — Check sprint scope
  ! pm standup        — Standup summary
  ! pm search "term"  — Full-text search
  ! pm enforce        — Run rules engine

Active project rules:
${rulesBlock}

CRITICAL GIT RULE:
▸ NEVER add "Co-Authored-By" or any AI attribution lines to commit messages.
▸ Commit messages must contain only human-authored content — no tool signatures.
▸ This applies to \`git commit\`, merge commits, \`git rebase\`, and \`git cherry-pick\`.
▸ Violation: run \`git log --format="%B" | grep -i "co-authored-by"\` — must return nothing.

FAILURE TO FOLLOW THIS WORKFLOW WILL RESULT IN BLOCKED OPERATIONS.
The PreToolUse hook enforces this at the tool-call level — you cannot bypass it.`,
      environment: {
        PM_AGENT_ACTIVE: 'true',
        PM_AGENT_ENFORCED: 'true',
        PM_AGENT_ENFORCEMENT: 'per-response',
        PM_AGENT_ENFORCEMENT_VERSION: '2.0',
        PM_AGENT_PROJECT: projectName,
        PM_AGENT_CONFIG: config?.rules?.config_path || '',
        PM_AGENT_GIT_POLICY: 'no-ai-attribution',
      },
    };
  } catch (e) {
    // Never crash Claude Code from a hook
    console.error('[PM Agent] SessionStart hook error:', e.message);
    return {};
  }
}
