#!/usr/bin/env node

/**
 * PM Agent PreToolUse Hook — ZERO-STATE GATEKEEPER
 *
 * Runs before EVERY Claude Code tool call.
 *
 * ENFORCEMENT MODEL:
 * ┌───────────────────────────────────────────────────────────────┐
 * │ EVERY tool call is evaluated INDEPENDENTLY — zero session    │
 * │ state carries over between hook invocations.                 │
 * │                                                               │
 * │ The ONLY tools that pass through:                             │
 * │   • pm_get_context — this is what sets contextChecked         │
 * │   • All other pm_* MCP tools                                  │
 * │   • AskUserQuestion — needed for user interaction             │
 * │   • SessionStart hook (tool === undefined)                    │
 * │                                                               │
 * │ EVERY OTHER TOOL (Read, Write, Edit, Bash, Glob, Grep,       │
 * │ TaskCreate, WebSearch, MCP tools, etc.) is BLOCKED unless    │
 * │ contextChecked is true (set by pm_get_context earlier in     │
 * │ this same batch).                                             │
 * │                                                               │
 * │ contextChecked is RESET TO FALSE AFTER every hook invocation EXCEPT   │
 * │ pm_get_context itself (which sets it true for the rest of the batch). │
 * │ This means:                                                           │
 * │   • pm_get_context → contextChecked = true, subsequent tools pass     │
 * │   • All other pm_* tools → contextChecked = false (clean slate)       │
 * │   • Non-PM-agent tools pass only if contextChecked is true            │
 * │   • Response boundaries CANNOT leak — ending with pm_log_note/reset   │
 * │     wipes contextChecked, so next response starts empty               │
 * │                                                               │
 * │ Write/destructive tools (Edit, Write, Bash, Delete)           │
 * │ additionally require pm_log_decision at least once.           │
 * └───────────────────────────────────────────────────────────────┘
 *
 * Claude Code hook contract:
 *   export async function preToolUse({ tool, input }) -> { autoApproval?, reason? }
 *
 * Never crashes Claude Code — all errors are caught and return {}.
 */

// ---------------------------------------------------------------------------
// Module-level state (persists within a single Node.js process)
// ---------------------------------------------------------------------------

/** Whether pm_get_context has been set in this batch. Reset to false at every hook return. */
let contextChecked = false;

/** Whether pm_log_decision has been called at least once this session. */
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
║ You attempted to use a tool WITHOUT calling pm_get_context  ║
║ first in this response.                                     ║
║                                                              ║
║ ALL NON-PM-AGENT TOOL CALLS ARE BLOCKED.                    ║
║                                                              ║
║ CALL THIS FIRST (EVERY RESPONSE):  pm_get_context             ║
║                                                              ║
║ This tool provides the full project snapshot:                ║
║   • Architecture decisions                                   ║
║   • Active blockers                                          ║
║   • Notes and context                                        ║
║   • Project rules                                            ║
║   • Codebase structure                                       ║
║                                                              ║
║ Without it, you CANNOT use ANY tool.                         ║
║ Call pm_get_context to proceed.                              ║
╚══════════════════════════════════════════════════════════════╝

Required:  pm_get_context
Or CLI:    ! pm context

This cannot be bypassed. Call pm_get_context as the FIRST tool call in every response.`;

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
║ Once the decision is logged, write tools are unblocked.      ║
╚══════════════════════════════════════════════════════════════╝

Required:  pm_log_decision
Or CLI:    ! pm log-decision "title" "body"`;

// ---------------------------------------------------------------------------
// Guards — no global initialization needed; contextChecked starts false
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export async function preToolUse({ tool, input } = {}) {
  try {
    // Step 1: SessionStart hook (no tool yet) — always pass through
    if (!tool) {
      return {};
    }

    // Step 2: Tools that always pass through unconditionally
    if (BYPASS_TOOLS.has(tool)) {
      return {};
    }

    // Step 3: PM Agent MCP tools — track decision logging
    if (tool.startsWith('pm_') || tool.startsWith('pm-')) {
      if (tool === 'pm_log_decision') {
        decisionLogged = true;
      }
      // pm_get_context sets contextChecked so subsequent tools in this batch pass
      if (tool === 'pm_get_context') {
        contextChecked = true;
      }
      // CRITICAL: pm_* tools that are NOT pm_get_context do NOT leave contextChecked
      // true. This prevents state bleed across response boundaries. If the AI ends
      // a response with pm_log_note, contextChecked stays whatever it was (false
      // or unchanged). So the next response starts fresh.
      if (tool !== 'pm_get_context') {
        contextChecked = false;
      }
      return {};
    }

    // Step 4: Check MCP server tool calls via their input pattern
    if (input && typeof input === 'object') {
      const inputStr = JSON.stringify(input).toLowerCase();
      for (const pmTool of PM_AGENT_TOOLS) {
        if (inputStr.includes(pmTool.toLowerCase())) {
          if (pmTool === 'pm_log_decision') {
            decisionLogged = true;
          }
          if (pmTool === 'pm_get_context') {
            contextChecked = true;
          }
          // Same principle: non-pm_get_context pm_* tools reset context
          // so next response starts clean
          if (pmTool !== 'pm_get_context') {
            contextChecked = false;
          }
          return {};
        }
      }
    }

    // Step 5: Context check — pm_get_context MUST have been called
    // earlier in this batch. contextChecked is always false at the
    // start of a new response, so the AI MUST call pm_get_context
    // before every single tool use.
    if (!contextChecked) {
      return {
        autoApproval: false,
        reason: GATEKEEPER_MESSAGE,
      };
    }

    // Step 6: Decision check — write tools need pm_log_decision
    if (WRITE_TOOLS.has(tool) && !decisionLogged) {
      return {
        autoApproval: false,
        reason: DECISION_MESSAGE,
      };
    }

    // Step 7: Allow through — reset contextChecked so the next response
    // starts clean. This non-PM-agent tool consumed the context; the AI
    // must call pm_get_context again in the next response.
    contextChecked = false;
    return {};
  } catch (e) {
    // Never crash Claude Code from a hook
    console.error('[PM Agent] GATEKEEPER hook error:', e.message);
    return {};
  }
}
