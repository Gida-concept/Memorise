#!/usr/bin/env node

/**
 * PM Agent PreToolUse Hook — GATEKEEPER + RULES ENFORCEMENT
 *
 * Runs before EVERY Claude Code tool call.
 *
 * ENFORCEMENT MODEL:
 * ┌───────────────────────────────────────────────────────────────┐
 * │ EVERY tool call is evaluated INDEPENDENTLY — zero session    │
 * │ state carries over between hook invocations.                 │
 * │                                                               │
 * │ The ONLY tools that pass through without context:             │
 * │   • SessionStart hook (tool === undefined)                    │
 * │   • AskUserQuestion — needed for user interaction             │
 * │   • Bash with `! pm context` or `! pm status`                 │
 * │                                                               │
 * │ EVERY OTHER TOOL is BLOCKED unless contextChecked is true.    │
 * │                                                               │
 * │ BOTH flags are RESET after every hook invocation              │
 * │ EXCEPT the command that sets them. This means:                │
 * │   • `! pm context` → contextChecked = true, rest of batch OK  │
 * │   • `! pm log` → decisionLogged = true, rest of batch OK      │
 * │   • Non-PM-agent tools pass only if BOTH flags are true       │
 * │     (write tools) or just contextChecked (read-only tools)    │
 * │   • Response boundaries CANNOT leak — every response starts   │
 * │     with both flags false, must call `! pm context` and        │
 * │     `! pm log` fresh every time.                              │
 * │                                                               │
 * │ Write/destructive tools additionally require `! pm log`       │
 * │ in the SAME response — it's not persistent across responses.  │
 * │                                                               │
 * │ RULES ENGINE: All tools are evaluated against rules.toml      │
 * │ on every single call. If a hard rule fires, the tool is       │
 * │ blocked. If a soft/info rule fires, the user sees the         │
 * │ notification/suggestion.                                      │
 * └───────────────────────────────────────────────────────────────┘
 *
 * Claude Code hook contract:
 *   export async function preToolUse({ tool, input }) -> { autoApproval?, reason? }
 *
 * Never crashes Claude Code — all errors are caught and return {}.
 */

import { evaluateRules, wrapResult } from './hook-utils.mjs';

// ---------------------------------------------------------------------------
// Module-level state (persists within a single Node.js process)
// ---------------------------------------------------------------------------

/** Whether context has been loaded via CLI in this batch. Reset on every hook return. */
let contextChecked = false;

/** Whether a decision has been logged via CLI in this batch. Reset on every hook return. */
let decisionLogged = false;

// ---------------------------------------------------------------------------
// Tool classification
// ---------------------------------------------------------------------------

const BYPASS_TOOLS = new Set([
  'AskUserQuestion',
]);

const WRITE_TOOLS = new Set([
  'Write', 'Edit', 'Bash', 'Delete', 'Rename', 'Move', 'NotebookEdit',
]);

// ---------------------------------------------------------------------------
// CLI command detection via input scanning
// ---------------------------------------------------------------------------

/**
 * Detect `! pm context` or `! pm status` in a Bash command — sets contextChecked.
 */
function detectsContextCommand(tool, input) {
  if (tool === 'Bash' && input?.command) {
    return /\bpm\s+(context|status)\b/i.test(input.command);
  }
  return false;
}

/**
 * Detect `! pm log` in a Bash command — sets decisionLogged.
 */
function detectsDecisionCommand(tool, input) {
  if (tool === 'Bash' && input?.command) {
    return /\bpm\s+log\b/i.test(input.command);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Block messages
// ---------------------------------------------------------------------------

const GATEKEEPER_MESSAGE = `[PM Agent — GATEKEEPER] Action blocked.

╔══════════════════════════════════════════════════════════════╗
║ You attempted to use a tool WITHOUT loading PM Agent        ║
║ context first in this response.                             ║
║                                                              ║
║ ALL NON-PM-AGENT TOOL CALLS ARE BLOCKED.                    ║
║                                                              ║
║ CALL THIS FIRST (EVERY RESPONSE):                           ║
║   ! pm context                                              ║
║                                                              ║
║ This loads the full project snapshot:                        ║
║   • Architecture decisions                                   ║
║   • Active blockers                                          ║
║   • Notes and context                                        ║
║   • Project rules                                            ║
║   • Codebase structure                                       ║
║                                                              ║
║ Without it, you CANNOT use ANY tool.                         ║
║ Run ! pm context to proceed.                                ║
╚══════════════════════════════════════════════════════════════╝`;

const DECISION_MESSAGE = `[PM Agent — GATEKEEPER] Write action blocked.

╔══════════════════════════════════════════════════════════════╗
║ You attempted to modify project files WITHOUT logging       ║
║ a decision first.                                           ║
║                                                              ║
║ CALL THIS FIRST:                                             ║
║   ! pm log "What you are doing and why"                    ║
║                                                              ║
║ Once the decision is logged, write tools are unblocked      ║
║ for this response.                                           ║
╚══════════════════════════════════════════════════════════════╝`;

// ---------------------------------------------------------------------------
// Helper: evaluate rules and block if hard rule fires
// ---------------------------------------------------------------------------

/**
 * Evaluate PM Agent rules for the current tool call.
 * Returns { blocked: true, reason } if a hard rule blocks, or
 * { blocked: false } if no rules fire or rules are disabled.
 */
function checkRules(toolName, toolInput) {
  try {
    const ruleResult = evaluateRules(toolName, toolInput || {});
    const wrapped = wrapResult(ruleResult.blocked, ruleResult.actions);
    if (wrapped.autoApproval === false) {
      return { blocked: true, reason: wrapped.reason };
    }
    return { blocked: false };
  } catch (e) {
    console.error('[PM Agent] Rule evaluation error:', e.message);
    return { blocked: false };
  }
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export async function preToolUse({ tool, input } = {}) {
  try {
    // Step 1: SessionStart hook (no tool yet) — always pass through
    if (!tool) return {};

    // Step 2: Tools that always pass through unconditionally
    if (BYPASS_TOOLS.has(tool)) return {};

    // Step 3: Track CLI commands that set state
    if (detectsContextCommand(tool, input)) {
      contextChecked = true;
      return { autoApproval: true, reason: '[PM Agent ✓] Context loaded — tools unblocked.' };
    }

    if (detectsDecisionCommand(tool, input)) {
      decisionLogged = true;
      return { autoApproval: true, reason: '[PM Agent ✓] Decision logged — writes unblocked.' };
    }

    // Step 4: Context check — ! pm context or ! pm status MUST have been called
    // earlier in this batch. contextChecked is always false at the
    // start of a new response, so Claude MUST call ! pm context
    // before every single tool use.
    if (!contextChecked) {
      return { autoApproval: false, reason: GATEKEEPER_MESSAGE };
    }

    // Step 5: Evaluate rules for this tool call
    const ruled = checkRules(tool, input);
    if (ruled.blocked) {
      return { autoApproval: false, reason: ruled.reason };
    }

    // Step 6: Decision check — write tools need ! pm log
    if (WRITE_TOOLS.has(tool) && !decisionLogged) {
      return { autoApproval: false, reason: DECISION_MESSAGE };
    }

    // Step 7: Allow through — reset both flags so the next response
    // starts clean. Claude must call ! pm context and ! pm log again
    // in the next response.
    contextChecked = false;
    decisionLogged = false;
    return { autoApproval: true, reason: '[PM Agent ✓] Allowed.' };
  } catch (e) {
    // Never crash Claude Code from a hook
    console.error('[PM Agent] PreToolUse hook error:', e.message);
    return {};
  }
}
