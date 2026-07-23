#!/usr/bin/env node

/**
 * PM Agent PreToolUse Hook — PER-RESPONSE GATEKEEPER
 *
 * Runs before EVERY Claude Code tool call.
 *
 * ENFORCEMENT MODEL:
 * ┌─────────────────────────────────────────────────────────┐
 * │ The ONLY tools that pass through are:                   │
 * │   • PM Agent MCP tools (pm_get_context, pm_*)          │
 * │   • AskUserQuestion (needed for user interaction)       │
 * │                                                         │
 * │ EVERY other tool call is BLOCKED unconditionally.       │
 * │                                                         │
 * │ The AI MUST call pm_get_context before it can do        │
 * │ anything else — in EVERY response.                      │
 * └─────────────────────────────────────────────────────────┘
 *
 * Claude Code hook contract:
 *   export async function preToolUse({ tool, input }) -> { autoApproval?, reason? }
 *
 * Never crashes Claude Code — all errors are caught and return {}.
 */

// ---------------------------------------------------------------------------
// Tools that bypass the gatekeeper (must be minimal)
// ---------------------------------------------------------------------------

/**
 * Only AskUserQuestion passes through unconditionally — the AI needs it
 * to ask questions before it has any context.
 */
const BYPASS_TOOLS = new Set([
  'AskUserQuestion',
]);

/**
 * PM Agent MCP tools — these are the ONLY tools the AI can use freely.
 * Every call to one of these updates the timestamp so we know PM Agent
 * was contacted recently.
 */
const PM_AGENT_TOOLS = [
  'pm_get_context',
  'pm_get_blockers',
  'pm_get_decisions',
  'pm_get_notes',
  'pm_get_scope',
  'pm_get_standup',
  'pm_prep_meeting',
  'pm_log_decision',
  'pm_log_note',
  'pm_check_scope',
  'pm_add_rule',
  'pm_enforce_rules',
  'pm_scan_codebase',
  'pm_get_dependency_graph',
  'pm_analyze_impact',
  'pm_search_codebase',
  'pm_get_architecture',
  'pm_get_file_context',
  'pm_hooks_setup',
  'pm_enforce_setup',
  'pm_understand_codebase',
];

// ---------------------------------------------------------------------------
// Educational block message
// ---------------------------------------------------------------------------

const GATEKEEPER_MESSAGE = `[PM Agent — GATEKEEPER] Action blocked.

╔══════════════════════════════════════════════════════════════╗
║ You attempted to use a tool WITHOUT checking PM Agent       ║
║ context first.                                              ║
║                                                              ║
║ ALL NON-PM-AGENT TOOL CALLS ARE BLOCKED.                    ║
║                                                              ║
║ CALL THIS FIRST:   pm_get_context                            ║
║                                                              ║
║ This tool provides the full project snapshot:                ║
║   • Architecture decisions                                   ║
║   • Active blockers                                          ║
║   • Notes and context                                        ║
║   • Project rules                                            ║
║   • Codebase structure                                       ║
║                                                              ║
║ Without it, you cannot use ANY tool.                         ║
║ Call pm_get_context to proceed.                              ║
╚══════════════════════════════════════════════════════════════╝

Required:  pm_get_context
Or CLI:    ! pm context

This cannot be bypassed. Call pm_get_context to proceed.`;

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export async function preToolUse({ tool, input } = {}) {
  try {
    // Step 1: Tools that always pass through
    if (BYPASS_TOOLS.has(tool)) {
      return {};
    }

    // Step 2: PM Agent MCP tools pass through
    if (tool.startsWith('pm_') || tool.startsWith('pm-')) {
      return {};
    }

    // Step 3: Check MCP server tool calls via their input pattern
    // (Some MCP tools come through with different naming)
    if (input && typeof input === 'object') {
      const inputStr = JSON.stringify(input).toLowerCase();
      for (const pmTool of PM_AGENT_TOOLS) {
        if (inputStr.includes(pmTool.toLowerCase())) {
          return {};
        }
      }
    }

    // Step 4: BLOCK EVERYTHING ELSE
    return {
      autoApproval: false,
      reason: GATEKEEPER_MESSAGE,
    };
  } catch (e) {
    // Never crash Claude Code from a hook
    console.error('[PM Agent] GATEKEEPER hook error:', e.message);
    return {};
  }
}
