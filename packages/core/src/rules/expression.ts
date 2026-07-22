import { minimatch } from 'minimatch';

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

export type TokenType =
  | 'IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'DURATION'
  | 'DOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'EQ'     // ==
  | 'NEQ'    // !=
  | 'GT'     // >
  | 'LT'     // <
  | 'GTE'    // >=
  | 'LTE'    // <=
  | 'AND'    // &&
  | 'OR'     // ||
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// ---------------------------------------------------------------------------
// AST node types
// ---------------------------------------------------------------------------

export type ASTNode =
  | { type: 'PropertyAccess'; path: string[] }
  | { type: 'StringLiteral'; value: string }
  | { type: 'NumberLiteral'; value: number }
  | { type: 'DurationLiteral'; value: number; unit: 'h' | 'd' | 'm'; normalizedHours: number }
  | { type: 'FunctionCall'; object: string[]; function: string; args: ASTNode[] }
  | { type: 'BinaryOp'; operator: string; left: ASTNode; right: ASTNode };

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    const ch = input[pos];

    // Skip whitespace
    if (ch !== undefined && /^\s$/.test(ch)) {
      pos++;
      continue;
    }

    if (ch === undefined) break;

    // Single-character tokens
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

    // Multi-character operators
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
        if (sc === "'") {
          break;
        }
        value += sc;
        pos++;
      }
      if (pos >= input.length) {
        throw new Error(`Unterminated string literal at position ${start}`);
      }
      pos++; // skip closing quote
      tokens.push({ type: 'STRING', value, position: start });
      continue;
    }

    // Number or duration literal
    if (/^[0-9]$/.test(ch)) {
      const start = pos;
      let numStr = '';
      while (pos < input.length && /^[0-9]$/.test(input[pos] ?? '')) {
        numStr += input[pos];
        pos++;
      }
      // Decimal part
      if (
        pos < input.length &&
        input[pos] === '.' &&
        pos + 1 < input.length &&
        /^[0-9]$/.test(input[pos + 1] ?? '')
      ) {
        numStr += '.';
        pos++;
        while (pos < input.length && /^[0-9]$/.test(input[pos] ?? '')) {
          numStr += input[pos];
          pos++;
        }
      }

      // Check for duration unit (h, d, or m)
      const nextCh = input[pos];
      if (nextCh !== undefined && /^[hdm]$/.test(nextCh)) {
        // Ensure it's NOT followed by more alpha characters
        const afterUnit = input[pos + 1];
        if (afterUnit === undefined || !/^[a-zA-Z]$/.test(afterUnit)) {
          const unit = nextCh as 'h' | 'd' | 'm';
          const value = parseFloat(numStr);
          let normalizedHours: number;
          switch (unit) {
            case 'h':
              normalizedHours = value;
              break;
            case 'd':
              normalizedHours = value * 24;
              break;
            case 'm':
              normalizedHours = value / 60;
              break;
          }
          tokens.push({ type: 'DURATION', value: numStr + unit, position: start });
          pos++;
          continue;
        }
      }

      tokens.push({ type: 'NUMBER', value: numStr, position: start });
      continue;
    }

    // Identifier
    if (/^[a-zA-Z_]$/.test(ch)) {
      const start = pos;
      let value = '';
      while (pos < input.length && /^[a-zA-Z0-9_]$/.test(input[pos] ?? '')) {
        value += input[pos];
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
// Parser (recursive descent with precedence climbing)
// ---------------------------------------------------------------------------

const MAX_RECURSION_DEPTH = 50;

const OP_PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
};

export function parse(tokens: Token[]): ASTNode {
  const result = parseExpression(tokens, 0, 0, 0);
  return result.node;
}

function parseExpression(
  tokens: Token[],
  pos: number,
  minPrecedence: number,
  depth: number,
): { node: ASTNode; pos: number } {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error('Maximum recursion depth exceeded in expression parser');
  }

  let current = parseComparison(tokens, pos, depth + 1);

  while (current.pos < tokens.length) {
    const token = tokens[current.pos];
    if (token === undefined) break;
    if (token.type !== 'AND' && token.type !== 'OR') break;

    const prec = OP_PRECEDENCE[token.value];
    if (prec === undefined || prec < minPrecedence) break;

    // Consume operator
    current.pos++;

    const right = parseExpression(tokens, current.pos, prec + 1, depth + 1);
    current = {
      node: { type: 'BinaryOp', operator: token.value, left: current.node, right: right.node },
      pos: right.pos,
    };
  }

  return current;
}

function parseComparison(
  tokens: Token[],
  pos: number,
  depth: number,
): { node: ASTNode; pos: number } {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error('Maximum recursion depth exceeded in expression parser');
  }

  let current = parseUnary(tokens, pos, depth + 1);

  while (current.pos < tokens.length) {
    const token = tokens[current.pos];
    if (token === undefined) break;
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

function parseUnary(
  tokens: Token[],
  pos: number,
  depth: number,
): { node: ASTNode; pos: number } {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error('Maximum recursion depth exceeded in expression parser');
  }

  const token = tokens[pos];
  if (token === undefined) {
    throw new Error(`Unexpected end of input at position ${pos}`);
  }

  // Parenthesized expression
  if (token.type === 'LPAREN') {
    const inner = parseExpression(tokens, pos + 1, 0, depth + 1);
    const rparen = tokens[inner.pos];
    if (rparen === undefined || rparen.type !== 'RPAREN') {
      throw new Error(`Expected ')' at position ${inner.pos}`);
    }
    return { node: inner.node, pos: inner.pos + 1 };
  }

  // String literal
  if (token.type === 'STRING') {
    return { node: { type: 'StringLiteral', value: token.value }, pos: pos + 1 };
  }

  // Number literal
  if (token.type === 'NUMBER') {
    return { node: { type: 'NumberLiteral', value: parseFloat(token.value) }, pos: pos + 1 };
  }

  // Duration literal
  if (token.type === 'DURATION') {
    const raw = token.value;
    const unit = raw[raw.length - 1] as 'h' | 'd' | 'm';
    const numVal = parseFloat(raw.slice(0, -1));
    let normalizedHours: number;
    switch (unit) {
      case 'h':
        normalizedHours = numVal;
        break;
      case 'd':
        normalizedHours = numVal * 24;
        break;
      case 'm':
        normalizedHours = numVal / 60;
        break;
    }
    return {
      node: { type: 'DurationLiteral', value: numVal, unit, normalizedHours },
      pos: pos + 1,
    };
  }

  // Identifier — property access or function call
  if (token.type === 'IDENTIFIER') {
    return parsePropertyOrCall(tokens, pos, depth + 1);
  }

  throw new Error(`Unexpected token '${token.value}' at position ${token.position}`);
}

function parsePropertyOrCall(
  tokens: Token[],
  pos: number,
  depth: number,
): { node: ASTNode; pos: number } {
  const firstToken = tokens[pos];
  if (firstToken === undefined) {
    throw new Error(`Unexpected end of input at position ${pos}`);
  }

  const path: string[] = [firstToken.value];
  let currentPos = pos + 1;

  while (currentPos < tokens.length) {
    const dot = tokens[currentPos];
    if (dot === undefined || dot.type !== 'DOT') break;

    currentPos++;

    const ident = tokens[currentPos];
    if (ident === undefined || ident.type !== 'IDENTIFIER') {
      throw new Error(`Expected identifier after '.' at position ${currentPos}`);
    }
    currentPos++;

    // Check if this is a function call: .identifier(
    if (currentPos < tokens.length) {
      const lparen = tokens[currentPos];
      if (lparen !== undefined && lparen.type === 'LPAREN') {
        currentPos++; // skip (
        let args: ASTNode[] = [];
        if (currentPos < tokens.length) {
          const rp = tokens[currentPos];
          if (rp === undefined || rp.type !== 'RPAREN') {
            const arg = parseExpression(tokens, currentPos, 0, depth + 1);
            args = [arg.node];
            currentPos = arg.pos;
          }
        }
        const rparen = tokens[currentPos];
        if (rparen === undefined || rparen.type !== 'RPAREN') {
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

    // Regular property access
    path.push(ident.value);
  }

  return { node: { type: 'PropertyAccess', path }, pos: currentPos };
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export function evaluate(ast: ASTNode, context: Record<string, unknown>): unknown {
  switch (ast.type) {
    case 'StringLiteral':
      return ast.value;

    case 'NumberLiteral':
      return ast.value;

    case 'DurationLiteral':
      // Return the node itself so comparisons can access normalizedHours
      return ast;

    case 'PropertyAccess':
      return evalPropertyAccess(ast.path, context);

    case 'FunctionCall':
      return evalFunctionCall(ast.object, ast.function, ast.args, context);

    case 'BinaryOp':
      return evalBinaryOp(ast.operator, ast.left, ast.right, context);
  }
}

function evalPropertyAccess(
  path: string[],
  context: Record<string, unknown>,
): unknown {
  // Special handling for .count suffix (e.g., files.count)
  if (path.length > 1) {
    const lastSegment = path[path.length - 1];
    if (lastSegment === 'count') {
      let value: unknown = context;
      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        if (segment === undefined) break;
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

  // Normal property traversal
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
  args: ASTNode[],
  context: Record<string, unknown>,
): unknown {
  // Resolve the object value by traversing the path
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
    const argValue = argNode !== undefined ? evaluate(argNode, context) : undefined;
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
  left: ASTNode,
  right: ASTNode,
  context: Record<string, unknown>,
): unknown {
  const leftVal = evaluate(left, context);
  const rightVal = evaluate(right, context);

  // null/undefined comparisons return false
  if (leftVal === null || leftVal === undefined) return false;
  if (rightVal === null || rightVal === undefined) return false;

  switch (operator) {
    case '&&':
      return Boolean(leftVal) && Boolean(rightVal);
    case '||':
      return Boolean(leftVal) || Boolean(rightVal);
    case '==':
      return compareEqual(leftVal, rightVal);
    case '!=':
      return !compareEqual(leftVal, rightVal);
    case '>':
      return compareOrdered(leftVal, rightVal) > 0;
    case '<':
      return compareOrdered(leftVal, rightVal) < 0;
    case '>=':
      return compareOrdered(leftVal, rightVal) >= 0;
    case '<=':
      return compareOrdered(leftVal, rightVal) <= 0;
    default:
      return false;
  }
}

function compareEqual(left: unknown, right: unknown): boolean {
  // Duration comparisons — normalize to hours
  if (isDurationNode(left) && isDurationNode(right)) {
    return left.normalizedHours === right.normalizedHours;
  }
  if (isDurationNode(left) && typeof right === 'number') {
    return left.normalizedHours === right;
  }
  if (isDurationNode(right) && typeof left === 'number') {
    return left === right.normalizedHours;
  }

  // Glob matching for string comparisons against patterns
  if (typeof left === 'string' && typeof right === 'string' && hasGlobChars(right)) {
    return minimatch(left, right);
  }

  return left === right;
}

function compareOrdered(left: unknown, right: unknown): number {
  // Duration comparisons — normalize to hours
  if (isDurationNode(left) && isDurationNode(right)) {
    return left.normalizedHours - right.normalizedHours;
  }
  if (isDurationNode(left) && typeof right === 'number') {
    return left.normalizedHours - right;
  }
  if (isDurationNode(right) && typeof left === 'number') {
    return left - right.normalizedHours;
  }

  // Number comparison
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  // String comparison
  return String(left).localeCompare(String(right));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DurationNode {
  type: 'DurationLiteral';
  value: number;
  unit: string;
  normalizedHours: number;
}

function isDurationNode(val: unknown): val is DurationNode {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as Record<string, unknown>).type === 'DurationLiteral'
  );
}

function hasGlobChars(s: string): boolean {
  return s.includes('*') || s.includes('?') || s.includes('[');
}

// ---------------------------------------------------------------------------
// Template interpolator
// ---------------------------------------------------------------------------

export function interpolate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (match: string, pathStr: string) => {
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
