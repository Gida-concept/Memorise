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
 * │                                                         │
 * │ Write/destructive tools (Edit, Write, Bash, etc.)       │
 * │ additionally require pm_log_decision to have been       │
 * │ called at least once before they are allowed.           │
 * └─────────────────────────────────────────────────────────┘
 *
 * Claude Code hook contract:
 *   export async function preToolUse({ tool, input }) -> { autoApproval?, reason? }
 *
 * Never crashes Claude Code — all errors are caught and return {}.
 */

// ---------------------------------------------------------------------------
// Session state (persists across hook calls within a Claude Code session)
// ---------------------------------------------------------------------------

/** Whether pm_log_decision has been called at least once this session */
let decisionLogged = false;

/**
 * Whether pm_get_context has been called since the last non-PM-agent
 * tool was allowed through. Reset on every blocked/granted write tool.
 */
let contextChecked = false;

// ---------------------------------------------------------------------------
// Tool classification
// ---------------------------------------------------------------------------

/**
 * Only AskUserQuestion passes through unconditionally — the AI needs it
 * to ask questions before it has any context.
 */
const BYPASS_TOOLS = new Set([
  'AskUserQuestion',
]);

/**
 * Write/destructive tools. These require pm_log_decision to have been
 * called at least once in the session before they are allowed.
 */
const WRITE_TOOLS = new Set([
  'Write', 'Edit', 'Bash', 'Delete', 'Rename', 'Move', 'NotebookEdit',
]);

/**
 * PM Agent MCP tools — freely usable.
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
// Block messages
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

const DECISION_MESSAGE = `[PM Agent — GATEKEEPER] Write action blocked.

╔══════════════════════════════════════════════════════════════╗
║ You attempted to modify project files WITHOUT logging       ║
║ a decision first.                                           ║
║                                                              ║
║ CALL THIS FIRST:   pm_log_decision                           ║
║                                                              ║
║ Log what you are about to do and why:                        ║
║                                                              ║
║   pm_log_decision({                                          ║
║     title: "Implement user auth flow",                       ║
║     body: "Adding JWT middleware per ADR-003"                ║
║   })                                                         ║
║                                                              ║
║ Once the decision is logged, the write tool is unblocked.    ║
╚══════════════════════════════════════════════════════════════╝

Required:  pm_log_decision
Or CLI:    ! pm log-decision "title" "body"`;

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export async function preToolUse({ tool, input } = {}) {
  try {
    // Step 1: Tools that always pass through unconditionally
    if (BYPASS_TOOLS.has(tool)) {
      return {};
    }

    // Step 2: PM Agent MCP tools — track decision logging
    if (tool.startsWith('pm_') || tool.startsWith('pm-')) {
      // Track pm_log_decision calls
      if (tool === 'pm_log_decision') {
        decisionLogged = true;
      }
      // Track pm_get_context calls
      if (tool === 'pm_get_context') {
        contextChecked = true;
      }
      return {};
    }

    // Step 3: Check MCP server tool calls via their input pattern
    if (input && typeof input === 'object') {
      const inputStr = JSON.stringify(input).toLowerCase();
      for (const pmTool of PM_AGENT_TOOLS) {
        if (inputStr.includes(pmTool.toLowerCase())) {
          // Track pm_log_decision if detected in input
          if (pmTool === 'pm_log_decision') {
            decisionLogged = true;
          }
          if (pmTool === 'pm_get_context') {
            contextChecked = true;
          }
          return {};
        }
      }
    }

    // Step 4: Context check — pm_get_context must be called in EVERY response
    // before any non-PM-agent tool. The flag is reset below whenever a
    // non-PM-agent tool passes through, forcing fresh context before the
    // next tool call.
    if (!contextChecked) {
      return {
        autoApproval: false,
        reason: GATEKEEPER_MESSAGE,
      };
    }

    // Step 5: Decision check — write tools need pm_log_decision
    if (WRITE_TOOLS.has(tool) && !decisionLogged) {
      return {
        autoApproval: false,
        reason: DECISION_MESSAGE,
      };
    }

    // Step 6: Allow through (context was checked)
    // Reset contextChecked so the AI must call pm_get_context again
    // before EVERY tool. AskUserQuestion and pm_* tools are excluded
    // (they returned earlier). Enforces per-response awareness:
    // every non-PM-agent, non-bypass tool needs fresh context.
    contextChecked = false;
    return {};
  } catch (e) {
    // Never crash Claude Code from a hook
    console.error('[PM Agent] GATEKEEPER hook error:', e.message);
    return {};
  }
}
