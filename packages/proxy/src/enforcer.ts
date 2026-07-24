import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Rule {
  name: string;
  scope?: string;
  trigger: string;
  condition?: string;
  action: string;
  severity: string;
  description?: string;
  enabled: boolean;
}

interface ActionResult {
  rule: string;
  severity: string;
  action: string;
  message: string;
  triggered: boolean;
  passed: boolean;
}

interface EnforceResult {
  blocked: boolean;
  reason?: string;
  actions: ActionResult[];
  warnings: string[];
}

interface Config {
  rules?: {
    enabled?: boolean;
    config_path?: string;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

function resolveConfig(): Config | null {
  try {
    if (process.env.PM_AGENT_CONFIG) {
      const cfgPath = process.env.PM_AGENT_CONFIG;
      if (fs.existsSync(cfgPath)) {
        return parseTomlFile(cfgPath);
      }
    }

    // Check project-local .pm-agent/config.toml first
    const cwd = process.cwd();
    const localConfigPath = path.join(cwd, '.pm-agent', 'config.toml');
    if (fs.existsSync(localConfigPath)) {
      return parseTomlFile(localConfigPath);
    }

    // Fallback to global config (user-created ~/.config/pm-agent/)
    const home = process.env.HOME || process.env.USERPROFILE || '~';
    const configDir = path.resolve(home.replace(/^~/, home), '.config', 'pm-agent');

    if (fs.existsSync(configDir)) {
      const files = fs.readdirSync(configDir)
        .filter(f => /^config\..*\.toml$/.test(f))
        .sort();

      for (const file of files) {
        const fullPath = path.join(configDir, file);
        const parsed = parseTomlFile(fullPath);
        if (parsed) return parsed;
      }

      const defaultPath = path.join(configDir, 'config.toml');
      if (fs.existsSync(defaultPath)) {
        return parseTomlFile(defaultPath);
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Minimal TOML parser
// ---------------------------------------------------------------------------

interface TomlObject {
  [key: string]: unknown;
}

function parseTomlFile(filePath: string): Config | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return null;
    return minimalTomlParse(raw) as Config;
  } catch {
    return null;
  }
}

function minimalTomlParse(raw: string): TomlObject {
  const result: TomlObject = {};
  let currentSection: TomlObject = result;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array of tables: [[rule]]
    const arrayMatch = trimmed.match(/^\[\[([^\]]+)\]\]$/);
    if (arrayMatch) {
      const name = arrayMatch[1]!;
      if (!Array.isArray(result[name])) result[name] = [];
      const entry: TomlObject = {};
      (result[name] as TomlObject[]).push(entry);
      currentSection = entry;
      continue;
    }

    // Section header: [section] or [section.subsection]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const parts = sectionMatch[1]!.split('.');
      let obj: TomlObject = result;
      for (const part of parts) {
        if (typeof obj[part] !== 'object' || obj[part] === null) {
          obj[part] = {};
        }
        obj = obj[part] as TomlObject;
      }
      currentSection = obj;
      continue;
    }

    // Key = "value"
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]*)"$/);
    if (kvMatch) {
      currentSection[kvMatch[1]!] = kvMatch[2];
      continue;
    }

    // Key = true/false
    const boolMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(true|false)$/);
    if (boolMatch) {
      currentSection[boolMatch[1]!] = boolMatch[2] === 'true';
      continue;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Expression evaluator — tokenizer
// ---------------------------------------------------------------------------

const MAX_RECURSION_DEPTH = 50;

type TokenType =
  | 'STRING' | 'NUMBER' | 'DURATION' | 'IDENTIFIER'
  | 'DOT' | 'LPAREN' | 'RPAREN'
  | 'EQ' | 'NEQ' | 'GT' | 'LT' | 'GTE' | 'LTE'
  | 'AND' | 'OR'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    const ch = input[pos];

    if (ch !== undefined && /^\s$/.test(ch)) {
      pos++;
      continue;
    }

    if (ch === undefined) break;

    if (ch === '.') {
      tokens.push({ type: 'DOT', value: '.', position: pos });
      pos++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: pos });
      pos++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: pos });
      pos++;
      continue;
    }

    if (ch === '=' && input[pos + 1] === '=') {
      tokens.push({ type: 'EQ', value: '==', position: pos });
      pos += 2;
      continue;
    }

    if (ch === '!' && input[pos + 1] === '=') {
      tokens.push({ type: 'NEQ', value: '!=', position: pos });
      pos += 2;
      continue;
    }

    if (ch === '>' && input[pos + 1] === '=') {
      tokens.push({ type: 'GTE', value: '>=', position: pos });
      pos += 2;
      continue;
    }

    if (ch === '<' && input[pos + 1] === '=') {
      tokens.push({ type: 'LTE', value: '<=', position: pos });
      pos += 2;
      continue;
    }

    if (ch === '>') {
      tokens.push({ type: 'GT', value: '>', position: pos });
      pos++;
      continue;
    }

    if (ch === '<') {
      tokens.push({ type: 'LT', value: '<', position: pos });
      pos++;
      continue;
    }

    if (ch === '&' && input[pos + 1] === '&') {
      tokens.push({ type: 'AND', value: '&&', position: pos });
      pos += 2;
      continue;
    }

    if (ch === '|' && input[pos + 1] === '|') {
      tokens.push({ type: 'OR', value: '||', position: pos });
      pos += 2;
      continue;
    }

    // String literal (single-quoted)
    if (ch === "'") {
      const start = pos;
      pos++;
      let value = '';
      while (pos < input.length) {
        const sc = input[pos];
        if (sc === "'") break;
        value += sc;
        pos++;
      }
      if (pos >= input.length) {
        throw new Error(`Unterminated string literal at position ${start}`);
      }
      pos++;
      tokens.push({ type: 'STRING', value, position: start });
      continue;
    }

    // Number or duration literal
    if (ch !== undefined && /^[0-9]$/.test(ch)) {
      const start = pos;
      let numStr = '';
      while (pos < input.length && input[pos] !== undefined && /^[0-9]$/.test(input[pos]!)) {
        numStr += input[pos];
        pos++;
      }
      if (
        pos < input.length &&
        input[pos] === '.' &&
        pos + 1 < input.length &&
        input[pos + 1] !== undefined &&
        /^[0-9]$/.test(input[pos + 1]!)
      ) {
        numStr += '.';
        pos++;
        while (pos < input.length && input[pos] !== undefined && /^[0-9]$/.test(input[pos]!)) {
          numStr += input[pos];
          pos++;
        }
      }

      const nextCh = input[pos];
      if (nextCh !== undefined && /^[hdm]$/.test(nextCh)) {
        const afterUnit = input[pos + 1];
        if (afterUnit === undefined || !/^[a-zA-Z]$/.test(afterUnit)) {
          tokens.push({ type: 'DURATION', value: numStr + nextCh, position: start });
          pos++;
          continue;
        }
      }

      tokens.push({ type: 'NUMBER', value: numStr, position: start });
      continue;
    }

    // Identifier
    if (ch !== undefined && /^[a-zA-Z_]$/.test(ch)) {
      const start = pos;
      let value = '';
      while (pos < input.length && input[pos] !== undefined && /^[a-zA-Z0-9_]$/.test(input[pos]!)) {
        value += input[pos]!;
        pos++;
      }
      tokens.push({ type: 'IDENTIFIER', value, position: start });
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${pos}`);
  }

  tokens.push({ type: 'EOF', value: '', position: pos });
  return tokens;
}

// ---------------------------------------------------------------------------
// Expression evaluator — AST types and parser
// ---------------------------------------------------------------------------

interface StringLiteralNode {
  type: 'StringLiteral';
  value: string;
}

interface NumberLiteralNode {
  type: 'NumberLiteral';
  value: number;
}

interface DurationLiteralNode {
  type: 'DurationLiteral';
  value: number;
  unit: string;
  normalizedHours: number;
}

interface PropertyAccessNode {
  type: 'PropertyAccess';
  path: string[];
}

interface FunctionCallNode {
  type: 'FunctionCall';
  object: string[];
  function: string;
  args: AstNode[];
}

interface BinaryOpNode {
  type: 'BinaryOp';
  operator: string;
  left: AstNode;
  right: AstNode;
}

type AstNode =
  | StringLiteralNode
  | NumberLiteralNode
  | DurationLiteralNode
  | PropertyAccessNode
  | FunctionCallNode
  | BinaryOpNode;

interface ParseResult {
  node: AstNode;
  pos: number;
}

const OP_PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
};

function parse(tokens: Token[]): AstNode {
  const result = parseExpression(tokens, 0, 0, 0);
  return result.node;
}

function parseExpression(tokens: Token[], pos: number, minPrecedence: number, depth: number): ParseResult {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error('Maximum recursion depth exceeded in expression parser');
  }

  let current = parseComparison(tokens, pos, depth + 1);

  while (current.pos < tokens.length) {
    const token = tokens[current.pos];
    if (!token) break;
    if (token.type !== 'AND' && token.type !== 'OR') break;

    const prec = OP_PRECEDENCE[token.value];
    if (prec === undefined || prec < minPrecedence) break;

    current.pos++;
    const right = parseExpression(tokens, current.pos, prec + 1, depth + 1);
    current = {
      node: { type: 'BinaryOp', operator: token.value, left: current.node, right: right.node },
      pos: right.pos,
    };
  }

  return current;
}

function parseComparison(tokens: Token[], pos: number, depth: number): ParseResult {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error('Maximum recursion depth exceeded in expression parser');
  }

  let current = parseUnary(tokens, pos, depth + 1);

  while (current.pos < tokens.length) {
    const token = tokens[current.pos];
    if (!token) break;
    if (
      token.type !== 'EQ' &&
      token.type !== 'NEQ' &&
      token.type !== 'GT' &&
      token.type !== 'LT' &&
      token.type !== 'GTE' &&
      token.type !== 'LTE'
    ) {
      break;
    }

    current.pos++;
    const right = parseUnary(tokens, current.pos, depth + 1);
    current = {
      node: { type: 'BinaryOp', operator: token.value, left: current.node, right: right.node },
      pos: right.pos,
    };
  }

  return current;
}

function parseUnary(tokens: Token[], pos: number, depth: number): ParseResult {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error('Maximum recursion depth exceeded in expression parser');
  }

  const token = tokens[pos];
  if (!token) {
    throw new Error(`Unexpected end of input at position ${pos}`);
  }

  if (token.type === 'LPAREN') {
    const inner = parseExpression(tokens, pos + 1, 0, depth + 1);
    const rparen = tokens[inner.pos];
    if (!rparen || rparen.type !== 'RPAREN') {
      throw new Error(`Expected ')' at position ${inner.pos}`);
    }
    return { node: inner.node, pos: inner.pos + 1 };
  }

  if (token.type === 'STRING') {
    return { node: { type: 'StringLiteral', value: token.value }, pos: pos + 1 };
  }

  if (token.type === 'NUMBER') {
    return { node: { type: 'NumberLiteral', value: parseFloat(token.value) }, pos: pos + 1 };
  }

  if (token.type === 'DURATION') {
    const raw = token.value;
    const unit = raw[raw.length - 1]!;
    const numVal = parseFloat(raw.slice(0, -1));
    let normalizedHours: number;
    switch (unit) {
      case 'h': normalizedHours = numVal; break;
      case 'd': normalizedHours = numVal * 24; break;
      case 'm': normalizedHours = numVal / 60; break;
      default: normalizedHours = numVal; break;
    }
    return {
      node: { type: 'DurationLiteral', value: numVal, unit, normalizedHours },
      pos: pos + 1,
    };
  }

  if (token.type === 'IDENTIFIER') {
    return parsePropertyOrCall(tokens, pos, depth + 1);
  }

  throw new Error(`Unexpected token '${token.value}' at position ${token.position}`);
}

function parsePropertyOrCall(tokens: Token[], pos: number, depth: number): ParseResult {
  const firstToken = tokens[pos];
  if (!firstToken) {
    throw new Error(`Unexpected end of input at position ${pos}`);
  }

  const path: string[] = [firstToken.value];
  let currentPos = pos + 1;

  while (currentPos < tokens.length) {
    const dot = tokens[currentPos];
    if (!dot || dot.type !== 'DOT') break;

    currentPos++;

    const ident = tokens[currentPos];
    if (!ident || ident.type !== 'IDENTIFIER') {
      throw new Error(`Expected identifier after '.' at position ${currentPos}`);
    }
    currentPos++;

    // Check if this is a function call: .identifier(
    if (currentPos < tokens.length) {
      const lparen = tokens[currentPos];
      if (lparen && lparen.type === 'LPAREN') {
        currentPos++;
        const args: AstNode[] = [];
        if (currentPos < tokens.length) {
          const rp = tokens[currentPos];
          if (!rp || rp.type !== 'RPAREN') {
            const arg = parseExpression(tokens, currentPos, 0, depth + 1);
            args.push(arg.node);
            currentPos = arg.pos;
          }
        }
        const rparen = tokens[currentPos];
        if (!rparen || rparen.type !== 'RPAREN') {
          throw new Error(`Expected ')' at position ${currentPos}`);
        }
        currentPos++;
        return {
          node: {
            type: 'FunctionCall',
            object: path,
            function: ident.value,
            args,
          },
          pos: currentPos,
        };
      }
    }

    path.push(ident.value);
  }

  return { node: { type: 'PropertyAccess', path }, pos: currentPos };
}

// ---------------------------------------------------------------------------
// Expression evaluator — AST evaluation
// ---------------------------------------------------------------------------

function evaluateAst(ast: AstNode, context: Record<string, unknown>): unknown {
  switch (ast.type) {
    case 'StringLiteral':
      return ast.value;
    case 'NumberLiteral':
      return ast.value;
    case 'DurationLiteral':
      return ast;
    case 'PropertyAccess':
      return evalPropertyAccess(ast.path, context);
    case 'FunctionCall':
      return evalFunctionCall(ast.object, ast.function, ast.args, context);
    case 'BinaryOp':
      return evalBinaryOp(ast.operator, ast.left, ast.right, context);
  }
}

function evalPropertyAccess(path: string[], context: Record<string, unknown>): unknown {
  // Special handling for .count suffix
  if (path.length > 1) {
    const lastSegment = path[path.length - 1];
    if (lastSegment === 'count') {
      let value: unknown = context;
      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        if (!segment) break;
        if (value === null || value === undefined || typeof value !== 'object') {
          return 0;
        }
        value = (value as Record<string, unknown>)[segment];
      }
      if (Array.isArray(value)) {
        return value.length;
      }
      return 0;
    }
  }

  let value: unknown = context;
  for (const segment of path) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return null;
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value ?? null;
}

function evalFunctionCall(
  objectPath: string[],
  func: string,
  args: AstNode[],
  context: Record<string, unknown>,
): unknown {
  let value: unknown = context;
  for (const segment of objectPath) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return func === 'contains' ? false : null;
    }
    value = (value as Record<string, unknown>)[segment];
  }

  if (func === 'contains') {
    if (value === null || value === undefined) return false;
    const argNode = args[0];
    const argValue = argNode !== undefined ? evaluateAst(argNode, context) : undefined;
    if (typeof value === 'string') {
      return value.includes(String(argValue));
    }
    if (Array.isArray(value)) {
      return value.includes(argValue);
    }
    return false;
  }

  return null;
}

function evalBinaryOp(
  operator: string,
  left: AstNode,
  right: AstNode,
  context: Record<string, unknown>,
): unknown {
  const leftVal = evaluateAst(left, context);
  const rightVal = evaluateAst(right, context);

  if (leftVal === null || leftVal === undefined) return false;
  if (rightVal === null || rightVal === undefined) return false;

  switch (operator) {
    case '&&': return Boolean(leftVal) && Boolean(rightVal);
    case '||': return Boolean(leftVal) || Boolean(rightVal);
    case '==': return compareEqual(leftVal, rightVal);
    case '!=': return !compareEqual(leftVal, rightVal);
    case '>': return compareOrdered(leftVal, rightVal) > 0;
    case '<': return compareOrdered(leftVal, rightVal) < 0;
    case '>=': return compareOrdered(leftVal, rightVal) >= 0;
    case '<=': return compareOrdered(leftVal, rightVal) <= 0;
    default: return false;
  }
}

function compareEqual(left: unknown, right: unknown): boolean {
  if (isDurationNode(left) && isDurationNode(right)) {
    return left.normalizedHours === right.normalizedHours;
  }
  if (isDurationNode(left) && typeof right === 'number') {
    return left.normalizedHours === right;
  }
  if (isDurationNode(right) && typeof left === 'number') {
    return left === right.normalizedHours;
  }

  if (typeof left === 'string' && typeof right === 'string' && hasGlobChars(right)) {
    return simpleGlobMatch(left, right);
  }

  return left === right;
}

function compareOrdered(left: unknown, right: unknown): number {
  if (isDurationNode(left) && isDurationNode(right)) {
    return left.normalizedHours - right.normalizedHours;
  }
  if (isDurationNode(left) && typeof right === 'number') {
    return left.normalizedHours - right;
  }
  if (isDurationNode(right) && typeof left === 'number') {
    return left - right.normalizedHours;
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

function isDurationNode(val: unknown): val is DurationLiteralNode {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as DurationLiteralNode).type === 'DurationLiteral'
  );
}

function hasGlobChars(s: string): boolean {
  return s.includes('*') || s.includes('?') || s.includes('[');
}

function simpleGlobMatch(str: string, pattern: string): boolean {
  if (!pattern.includes('*') && !pattern.includes('?') && !pattern.includes('[')) {
    return str === pattern;
  }
  let regex = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '*') {
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        regex += '.*';
        i++;
      } else {
        regex += '[^/]*';
      }
    } else if (ch === '?') {
      regex += '[^/]';
    } else if ('.^${}()|\\+'.includes(ch)) {
      regex += '\\' + ch;
    } else {
      regex += ch;
    }
  }
  try {
    return new RegExp('^' + regex + '$').test(str);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Template interpolator
// ---------------------------------------------------------------------------

function interpolate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (match, pathStr: string) => {
    const parts = pathStr.trim().split('.');
    let value: unknown = context;
    for (const part of parts) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return match;
      }
      value = (value as Record<string, unknown>)[part];
    }
    if (value !== undefined && value !== null) {
      return String(value);
    }
    return match;
  });
}

// ---------------------------------------------------------------------------
// Rule engine
// ---------------------------------------------------------------------------

function parseAction(actionStr: string): { type: string; message: string } {
  const colonIdx = actionStr.indexOf(':');
  if (colonIdx === -1) {
    return { type: 'notify', message: actionStr.trim() };
  }

  const typeStr = actionStr.slice(0, colonIdx).trim();
  const type = ['block', 'confirm', 'notify', 'suggest'].includes(typeStr)
    ? typeStr
    : 'notify';

  let message = actionStr.slice(colonIdx + 1).trim();
  if (
    (message.startsWith("'") && message.endsWith("'")) ||
    (message.startsWith('"') && message.endsWith('"'))
  ) {
    message = message.slice(1, -1);
  }

  return { type, message };
}

function evaluateSingleRule(rule: Rule, context: Record<string, unknown>): ActionResult {
  // Evaluate trigger
  try {
    const triggerTokens = tokenize(rule.trigger);
    const triggerAst = parse(triggerTokens);
    const triggerResult = evaluateAst(triggerAst, context);

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
    console.warn(`[pm-agent-proxy] Failed to evaluate trigger for rule '${rule.name}': ${e}`);
    return {
      rule: rule.name,
      severity: rule.severity,
      action: 'notify',
      message: '',
      triggered: false,
      passed: true,
    };
  }

  // Evaluate condition if present
  if (rule.condition) {
    try {
      const condTokens = tokenize(rule.condition);
      const condAst = parse(condTokens);
      const condResult = evaluateAst(condAst, context);

      if (!condResult) {
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
      console.warn(`[pm-agent-proxy] Failed to evaluate condition for rule '${rule.name}': ${e}`);
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

  // Rule fired
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

function pureEvaluateRules(
  rules: Rule[],
  context: Record<string, unknown>,
): {
  blocked: boolean;
  results: ActionResult[];
  rules_evaluated: number;
  rules_triggered: number;
  rules_blocked: number;
  status: string;
  confirmation_required: boolean;
} {
  const results: ActionResult[] = [];
  let blocked = false;

  const severityOrder: Record<string, number> = { hard: 0, soft: 1, info: 2 };
  const sorted = [...rules].sort(
    (a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99),
  );

  for (const rule of sorted) {
    if (rule.enabled === false) continue;
    const result = evaluateSingleRule(rule, context);
    results.push(result);

    if (!result.triggered) continue;

    if (result.action === 'block' && !result.passed) {
      blocked = true;
      break;
    }
  }

  const triggeredCount = results.filter(r => r.triggered).length;
  const blockedCount = results.filter(r => r.action === 'block' && !r.passed).length;

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

function loadRules(configPath: string): Rule[] {
  if (!fs.existsSync(configPath)) {
    console.warn(`[pm-agent-proxy] Rules file not found: ${configPath}`);
    return [];
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  if (!raw.trim()) return [];

  const parsed = minimalTomlParse(raw);
  const ruleEntries = parsed.rule;
  if (!ruleEntries || !Array.isArray(ruleEntries)) return [];

  return ruleEntries.map((r: Record<string, unknown>) => ({
    name: String(r.name ?? ''),
    scope: String(r.scope ?? 'all'),
    trigger: String(r.trigger ?? ''),
    condition: r.condition ? String(r.condition) : undefined,
    action: String(r.action ?? ''),
    severity: String(r.severity ?? 'info'),
    description: r.description ? String(r.description) : undefined,
    enabled: r.enabled !== false,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate PM Agent rules against a tool invocation.
 *
 * Fully self-contained — no dependencies on any other PM Agent packages.
 * If rules cannot be loaded, returns a benign result (allows through).
 *
 * @param toolName - The MCP tool name being called
 * @param toolArgs - The arguments passed to the tool
 * @returns Enforcement result
 */
export function evaluateRules(
  toolName: string,
  toolArgs: Record<string, unknown>,
): EnforceResult {
  try {
    const config = resolveConfig();
    if (!config || config.rules?.enabled === false) {
      return { blocked: false, reason: 'PM Agent rules disabled', actions: [], warnings: [] };
    }

    const rulesPath = config.rules?.config_path;
    if (!rulesPath || typeof rulesPath !== 'string') {
      return { blocked: false, reason: 'No PM Agent rules path configured', actions: [], warnings: [] };
    }

    const rules = loadRules(rulesPath);
    if (!rules || rules.length === 0) {
      return { blocked: false, reason: 'No PM Agent rules loaded', actions: [], warnings: [] };
    }

    const context: Record<string, unknown> = {
      tool_name: toolName,
      action: `calling ${toolName}`,
      tool_args: toolArgs,
      ...toolArgs,
    };

    const result = pureEvaluateRules(rules, context);

    const blocked = result.blocked === true;
    const warnings = (result.results || [])
      .filter(r => r.triggered && (r.action === 'notify' || r.action === 'suggest'))
      .map(r => r.message)
      .filter(Boolean);

    return {
      blocked,
      actions: result.results || [],
      warnings,
      reason: blocked
        ? (result.results || []).find(r => r.action === 'block' && !r.passed)?.message || 'Blocked by PM Agent rule'
        : undefined,
    };
  } catch (e) {
    // Graceful degradation — on any error, allow through
    console.error('[pm-agent-proxy] evaluateRules error:', e);
    return { blocked: false, reason: 'PM Agent evaluation error', actions: [], warnings: [] };
  }
}
