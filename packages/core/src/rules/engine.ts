import fs from 'fs';
import toml from 'toml';
import type { Rule, RuleResult, EnforcementResult, ParsedAction, ActionType, Severity } from './types.js';
import { parse, tokenize, evaluate, interpolate } from './expression.js';

/**
 * Load rules from a TOML file, optionally filtered by scope.
 * If the file doesn't exist, log a warning and return [].
 *
 * The TOML format is:
 * [[rule]]
 * name = "no-direct-api-calls"
 * scope = "code"
 * trigger = "file.path == 'src/**\/'.ts'"
 * condition = "file.contains('api.')"
 * action = "block: 'Direct API calls not allowed in {file.path}'"
 * severity = "hard"
 */
export function loadRules(configPath: string, scope?: 'pm' | 'code'): Rule[] {
  if (!fs.existsSync(configPath)) {
    console.warn(`[pm-agent] Rules file not found: ${configPath}. No rules loaded.`);
    return [];
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  if (!raw.trim()) return [];

  const parsed = toml.parse(raw);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ruleEntries = (parsed as any).rule as any[] | undefined;
  if (!ruleEntries || !Array.isArray(ruleEntries)) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRules: Rule[] = ruleEntries.map((r: any) => ({
    name: r.name,
    scope: r.scope ?? 'all',
    trigger: r.trigger,
    condition: r.condition,
    action: r.action,
    severity: r.severity ?? 'info',
    description: r.description,
    enabled: r.enabled !== false,
  }));

  if (scope) {
    return allRules.filter((r) => r.scope === scope || r.scope === 'all');
  }

  return allRules.filter((r) => r.enabled !== false);
}

/**
 * Parse an action string into its type and message template.
 * "block: 'Cannot close {ticket.id}'" -> { type: 'block', message: 'Cannot close {ticket.id}' }
 */
export function parseAction(actionStr: string): ParsedAction {
  const colonIdx = actionStr.indexOf(':');
  if (colonIdx === -1) {
    // default to notify if no colon separator
    return { type: 'notify', message: actionStr.trim() };
  }

  const typeStr = actionStr.slice(0, colonIdx).trim() as ActionType;
  const type: ActionType = (['block', 'confirm', 'notify', 'suggest'] as ActionType[]).includes(typeStr)
    ? typeStr
    : 'notify';

  let message = actionStr.slice(colonIdx + 1).trim();
  // Strip surrounding quotes if present
  if (
    (message.startsWith("'") && message.endsWith("'")) ||
    (message.startsWith('"') && message.endsWith('"'))
  ) {
    message = message.slice(1, -1);
  }

  return { type, message };
}

/**
 * Evaluate a single rule against context.
 */
export function evaluateRule(rule: Rule, context: Record<string, unknown>): RuleResult {
  // Parse and evaluate trigger
  try {
    const triggerTokens = tokenize(rule.trigger);
    const triggerAst = parse(triggerTokens);
    const triggerResult = evaluate(triggerAst, context);

    // If trigger is false-y, rule doesn't fire
    if (!triggerResult) {
      return {
        rule: rule.name,
        severity: rule.severity,
        action: 'notify',
        message: '',
        triggered: false,
        passed: true,
      };
    }
  } catch (e) {
    // If trigger parsing/evaluation fails, rule doesn't fire (graceful degradation)
    console.warn(`[pm-agent] Failed to evaluate trigger for rule '${rule.name}': ${e}`);
    return {
      rule: rule.name,
      severity: rule.severity,
      action: 'notify',
      message: '',
      triggered: false,
      passed: true,
    };
  }

  // Trigger matched — check condition if present
  if (rule.condition) {
    try {
      const condTokens = tokenize(rule.condition);
      const condAst = parse(condTokens);
      const condResult = evaluate(condAst, context);

      if (!condResult) {
        // Condition not met — rule doesn't fire
        return {
          rule: rule.name,
          severity: rule.severity,
          action: 'notify',
          message: '',
          triggered: false,
          passed: true,
        };
      }
    } catch (e) {
      console.warn(`[pm-agent] Failed to evaluate condition for rule '${rule.name}': ${e}`);
      return {
        rule: rule.name,
        severity: rule.severity,
        action: 'notify',
        message: '',
        triggered: false,
        passed: true,
      };
    }
  }

  // Rule fired — parse action
  const parsed = parseAction(rule.action);
  const message = interpolate(parsed.message, context);

  const isHardBlock = parsed.type === 'block';

  return {
    rule: rule.name,
    severity: rule.severity,
    action: parsed.type,
    message,
    triggered: true,
    passed: !isHardBlock,
  };
}

/**
 * Evaluate rules against a context object without loading config from disk.
 * Used by: MCP server auto-enforcement AND Claude Code PreToolUse hook.
 * This is a pure function that takes pre-loaded rules and a context object.
 *
 * Returns a lightweight result with blocked flag and warnings list.
 * Unlike enforce(), this does NOT handle confirmation callbacks — it's
 * designed for mechanical enforcement where only hard-block matters.
 */
export function evaluateRules(rules: Rule[], context: Record<string, unknown>): EnforcementResult {
  const results: RuleResult[] = [];
  let blocked = false;

  // Sort by severity: hard first, then soft, then info
  const severityOrder: Record<Severity, number> = { hard: 0, soft: 1, info: 2 };
  const sorted = [...rules].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  for (const rule of sorted) {
    if (rule.enabled === false) continue;
    const result = evaluateRule(rule, context);
    results.push(result);

    if (!result.triggered) continue;

    if (result.action === 'block' && !result.passed) {
      blocked = true;
      break;
    }
  }

  const triggeredCount = results.filter((r) => r.triggered).length;
  const blockedCount = results.filter((r) => r.action === 'block' && !r.passed).length;

  return {
    status: blocked ? 'rejected' : 'completed',
    results,
    rules_evaluated: results.length,
    rules_triggered: triggeredCount,
    rules_blocked: blockedCount,
    blocked,
    confirmation_required: false,
  };
}

/**
 * Enforce all matching rules against the given context.
 * Evaluates hard rules first, then soft, then info.
 */
export function enforce(
  rules: Rule[],
  context: Record<string, unknown>,
  opts?: { onConfirm?: (result: RuleResult) => boolean },
): EnforcementResult {
  // Sort by severity: hard first, then soft, then info
  const severityOrder: Record<Severity, number> = { hard: 0, soft: 1, info: 2 };
  const sorted = [...rules].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const results: RuleResult[] = [];
  let blocked = false;
  let confirmationRequired = false;
  const triggered: string[] = [];

  for (const rule of sorted) {
    const result = evaluateRule(rule, context);
    results.push(result);

    if (!result.triggered) continue;
    triggered.push(rule.name);

    if (result.action === 'block' && !result.passed) {
      blocked = true;
      // Hard block stops further evaluation
      break;
    }

    if (result.action === 'confirm') {
      confirmationRequired = true;
      if (opts?.onConfirm) {
        const confirmed = opts.onConfirm(result);
        if (!confirmed) {
          blocked = true;
          break;
        }
      } else {
        // No onConfirm handler — pause for confirmation
        break;
      }
    }

    // notify and suggest continue evaluating
  }

  const triggeredCount = triggered.length;
  const blockedCount = results.filter((r) => r.action === 'block' && !r.passed).length;

  let status: EnforcementResult['status'] = 'completed';
  if (blocked) {
    status = 'rejected';
  } else if (confirmationRequired && !opts?.onConfirm) {
    status = 'pending_confirmation';
  }

  return {
    status,
    results,
    rules_evaluated: results.length,
    rules_triggered: triggeredCount,
    rules_blocked: blockedCount,
    blocked,
    confirmation_required: confirmationRequired && status !== 'rejected',
  };
}

/**
 * Add a new rule to the rules file.
 */
export function addRule(configPath: string, rule: Rule): void {
  let raw = '';

  if (fs.existsSync(configPath)) {
    raw = fs.readFileSync(configPath, 'utf-8');
  }

  // Append new [[rule]] entry
  const lines: string[] = raw ? raw.trimEnd().split('\n') : [];

  // Ensure newline before new entry
  if (lines.length > 0 && lines[lines.length - 1] !== '') {
    lines.push('');
  }

  lines.push('[[rule]]');
  lines.push(`name = "${rule.name}"`);
  lines.push(`scope = "${rule.scope}"`);
  lines.push(`trigger = "${rule.trigger}"`);
  if (rule.condition) {
    lines.push(`condition = "${rule.condition}"`);
  }
  lines.push(`action = "${rule.action}"`);
  lines.push(`severity = "${rule.severity}"`);
  if (rule.description) {
    lines.push(`description = "${rule.description}"`);
  }
  if (rule.enabled === false) {
    lines.push(`enabled = false`);
  }
  lines.push('');

  fs.writeFileSync(configPath, lines.join('\n'), 'utf-8');
}

/**
 * Remove a rule by name from the rules file.
 * Reads the TOML, filters out the matching entry, writes back.
 */
export function removeRule(configPath: string, ruleName: string): void {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Rules file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = toml.parse(raw) as any;
  const entries = (parsed.rule as any[]) ?? [];

  const filtered = entries.filter((r) => r.name !== ruleName);
  if (filtered.length === entries.length) {
    throw new Error(`Rule '${ruleName}' not found in ${configPath}`);
  }

  // Write back the filtered rules in TOML format
  const lines: string[] = [];
  for (const r of filtered) {
    lines.push('[[rule]]');
    for (const [key, value] of Object.entries(r)) {
      if (typeof value === 'string') {
        lines.push(`${key} = "${value}"`);
      } else if (typeof value === 'boolean') {
        lines.push(`${key} = ${value}`);
      }
    }
    lines.push('');
  }

  fs.writeFileSync(configPath, lines.join('\n'), 'utf-8');
}

/**
 * Toggle a rule's enabled state.
 */
export function toggleRule(configPath: string, ruleName: string, enabled?: boolean): void {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Rules file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = toml.parse(raw) as any;
  const entries = (parsed.rule as any[]) ?? [];

  const rule = entries.find((r) => r.name === ruleName);
  if (!rule) {
    throw new Error(`Rule '${ruleName}' not found in ${configPath}`);
  }

  const newEnabled = enabled !== undefined ? enabled : !(rule.enabled !== false);
  rule.enabled = newEnabled;

  // Write back all rules
  const lines: string[] = [];
  for (const r of entries) {
    lines.push('[[rule]]');
    for (const [key, value] of Object.entries(r)) {
      if (typeof value === 'string') {
        lines.push(`${key} = "${value}"`);
      } else if (typeof value === 'boolean') {
        lines.push(`${key} = ${value}`);
      }
    }
    lines.push('');
  }

  fs.writeFileSync(configPath, lines.join('\n'), 'utf-8');
}
