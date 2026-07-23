#!/usr/bin/env node

/**
 * PM Agent PreToolUse Hook — TOTAL GATEKEEPER
 *
 * Runs before EVERY Claude Code tool call.
 *
 * ENFORCEMENT MODEL:
 * ┌─────────────────────────────────────────────────────────┐
 * │ ALL tool calls are BLOCKED until pm_get_context is      │
 * │ called in this session.                                 │
 * │                                                         │
 * │ The only exceptions:                                    │
 * │   • Bash commands running `pm` CLI (count as check)    │
 * │   • AskUserQuestion (needed for user interaction)       │
 * │                                                         │
 * │ The AI learns: "I CANNOT do anything until I call       │
 * │ pm_get_context first."                                  │
 * └─────────────────────────────────────────────────────────┘
 *
 * Claude Code hook contract:
 *   export async function preToolUse({ tool, input }) -> { autoApproval?, reason? }
 *
 * Never crashes Claude Code — all errors are caught and return {}.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Session state tracking
// ---------------------------------------------------------------------------

const SESSION_FILE = '.claude/pm-agent-session.json';

function getSessionPath() {
  return path.join(process.cwd(), SESSION_FILE);
}

function readSession() {
  try {
    const p = getSessionPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch {
    // Corrupt or missing — start fresh
  }
  return {
    session_id: crypto.randomUUID(),
    context_loaded: false,
    loaded_at: null,
    pm_commands_seen: 0,
  };
}

function writeSession(state) {
  try {
    const p = getSessionPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Best-effort — never crash the hook
  }
}

function markContextLoaded() {
  const state = readSession();
  state.context_loaded = true;
  state.loaded_at = new Date().toISOString();
  state.pm_commands_seen = (state.pm_commands_seen || 0) + 1;
  writeSession(state);
}

/**
 * Check if a Bash command is a PM Agent CLI invocation.
 */
function isPmCliCommand(command) {
  return /\bpm\b/.test(command);
}

/**
 * Returns true if the session has already loaded PM Agent context.
 */
function isSessionReady() {
  return readSession().context_loaded;
}

// ---------------------------------------------------------------------------
// Tools that bypass the gatekeeper (must be minimal)
// ---------------------------------------------------------------------------

/**
 * Tools that pass through unconditionally.
 * AskUserQuestion is needed so the AI can ask the user clarifying questions
 * before it has context — that's fine, it's non-destructive.
 */
const BYPASS_TOOLS = new Set([
  'AskUserQuestion',
]);

/**
 * MCP tool names that indicate PM Agent is being consulted.
 * When the AI calls one of these, we mark context as loaded.
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
║ context first. ALL tool calls are gated until the project   ║
║ context is loaded.                                          ║
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
║ Without it, you are working without project context.         ║
║ The gatekeeper will block EVERY tool until you call it.     ║
╚══════════════════════════════════════════════════════════════╝

Required first step:  pm_get_context
Or use CLI:           ! pm context

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

    // Step 2: Detect PM Agent calls — count as context check
    if (tool === 'Bash' && input?.command) {
      const command = String(input.command);
      if (isPmCliCommand(command)) {
        markContextLoaded();
        return {};
      }
    }

    // Step 3: Detect MCP tool calls that are PM Agent tools
    // In Claude Code, MCP tools are called through the Bash tool with
    // a specific command pattern. But they can also be called natively.
    // We check the tool name directly for pm_ prefix.
    if (tool.startsWith('pm_') || tool.startsWith('pm-')) {
      // This is a PM Agent tool call — allow it and mark context loaded
      markContextLoaded();
      return {};
    }

    // Step 4: Check MCP server tool calls via their input pattern
    if (input && typeof input === 'object') {
      const inputStr = JSON.stringify(input).toLowerCase();
      for (const pmTool of PM_AGENT_TOOLS) {
        if (inputStr.includes(pmTool.toLowerCase())) {
          markContextLoaded();
          return {};
        }
      }
    }

    // Step 5: GATEKEEPER — is session ready?
    if (!isSessionReady()) {
      return {
        autoApproval: false,
        reason: GATEKEEPER_MESSAGE,
      };
    }

    // Step 6: Session is ready — evaluate PM Agent rules
    try {
      const utils = await import('./hook-utils.mjs');

      // Only enforce rules on write/destructive tools
      const WRITE_TOOLS = new Set([
        'Bash', 'Write', 'Edit', 'Rename', 'Move', 'Delete',
        'NotebookEdit', 'TaskStop', 'ExitWorktree',
      ]);

      if (WRITE_TOOLS.has(tool)) {
        const result = utils.evaluateRules(tool, input || {});
        return utils.wrapResult(result.blocked, result.actions || []);
      }

      // Read tools pass through after context is loaded
      return {};
    } catch {
      // Fallback if hook-utils unavailable — allow through
      return {};
    }
  } catch (e) {
    // Never crash Claude Code from a hook
    console.error('[PM Agent] GATEKEEPER hook error:', e.message);
    return {};
  }
}
