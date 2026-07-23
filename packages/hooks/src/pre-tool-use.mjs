#!/usr/bin/env node

/**
 * PM Agent PreToolUse Hook
 *
 * Runs before every Claude Code tool call. Checks write/destructive
 * operations against PM Agent rules and blocks them if a hard rule
 * is violated.
 *
 * Claude Code hook contract:
 *   export async function preToolUse({ tool, input }) -> { autoApproval?, reason? }
 *
 * Never crashes Claude Code — all errors are caught and return {}.
 */

export async function preToolUse({ tool, input } = {}) {
  try {
    const { shouldEnforce, evaluateRules, wrapResult } = await import('./hook-utils.mjs');

    // Only enforce write/destructive tools
    if (!shouldEnforce(tool)) {
      return {};
    }

    // Evaluate PM Agent rules against this tool call
    const result = evaluateRules(tool, input || {});

    // Return enforcement result
    return wrapResult(result.blocked, result.actions || []);
  } catch (e) {
    // Never crash Claude Code from a hook
    console.error('[PM Agent] PreToolUse hook error:', e.message);
    return {};
  }
}
