import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs';
import lockfile from 'proper-lockfile';

const LOCK_RETRY = { retries: 20, minTimeout: 50, maxTimeout: 2000, stale: 10000 };
const LOCK_DIR_SUFFIX = '.lock';

// ---- Config ----

export interface DbConfig {
  path: string;
  memory?: boolean;
  readonly?: boolean;
}

// ---- Result types ----

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

// ---- Data shape for the JSON store ----

interface DbData {
  _migrations: { id: number; name: string; applied_at: string }[];
  decisions: Record<string, unknown>[];
  blockers: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  scope_snapshots: Record<string, unknown>[];
  file_registry: Record<string, unknown>[];
  dependency_edges: Record<string, unknown>[];
  architecture_map: Record<string, unknown>[];
  doc_index: Record<string, unknown>[];
  doc_fts: Record<string, unknown>[];
  file_summaries: Record<string, unknown>[];
}

function createEmptyData(): DbData {
  return {
    _migrations: [],
    decisions: [],
    blockers: [],
    notes: [],
    tasks: [],
    scope_snapshots: [],
    file_registry: [],
    dependency_edges: [],
    architecture_map: [],
    doc_index: [],
    doc_fts: [],
    file_summaries: [],
  };
}

// ---- Mini SQL parser / JSON query engine ----
// Maps the subset of SQL patterns used across the codebase to JS array operations.

// Auto-increment counter for scope_snapshots
let _autoIncrementCounter = 0;

function resetAutoIncrement(data: DbData): void {
  let max = 0;
  for (const row of data.scope_snapshots) {
    const id = Number((row as any).id ?? 0);
    if (id > max) max = id;
  }
  _autoIncrementCounter = max;
}

function nextAutoIncrementId(): number {
  _autoIncrementCounter++;
  return _autoIncrementCounter;
}

/**
 * Parse a simple SQL statement and execute it against the JSON data store.
 * Returns the same shape as sql.js would: for exec() nothing, for prepared statements
 * the appropriate row(s) or RunResult.
 */
function executeSql(
  data: DbData,
  sql: string,
  params: unknown[],
  mode: 'exec' | 'run' | 'get' | 'all',
): any {
  const trimmed = sql.trim();

  // ---- DDL / no-ops ----
  if (
    /^CREATE\s/i.test(trimmed) ||
    /^DROP\s/i.test(trimmed) ||
    /^BEGIN\b/i.test(trimmed) ||
    /^COMMIT\b/i.test(trimmed) ||
    /^ROLLBACK\b/i.test(trimmed) ||
    /^PRAGMA\b/i.test(trimmed)
  ) {
    if (mode === 'run') return { changes: 0, lastInsertRowid: 0 };
    return;
  }

  // ---- last_insert_rowid() ----
  if (/^SELECT\s+last_insert_rowid\s*\(/i.test(trimmed)) {
    return [{ id: _autoIncrementCounter }];
  }

  // ---- INSERT OR REPLACE INTO <table> ... ----
  const replaceMatch = trimmed.match(
    /^INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
  );
  if (replaceMatch) {
    return handleInsert(data, replaceMatch, params, mode, true);
  }

  // ---- INSERT INTO <table> ... ----
  const insertMatch = trimmed.match(
    /^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
  );
  if (insertMatch) {
    return handleInsert(data, insertMatch, params, mode, false);
  }

  // ---- INSERT INTO <table> SELECT ... FROM <table2> ... ----
  const insertSelectMatch = trimmed.match(
    /^INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]*)\))?\s*SELECT\s+(.+?)\s+FROM\s+(\w+)(.*)/i,
  );
  if (insertSelectMatch) {
    return handleInsertSelect(data, insertSelectMatch, params, mode);
  }

  // ---- SELECT ... ----
  const selectMatch = trimmed.match(
    /^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(.+?))?\s*$/i,
  );
  if (selectMatch) {
    return handleSelect(data, selectMatch, params, mode);
  }

  // ---- UPDATE <table> SET ... WHERE ... ----
  const updateMatch = trimmed.match(
    /^UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+?))?\s*$/i,
  );
  if (updateMatch) {
    return handleUpdate(data, updateMatch, params, mode);
  }

  // ---- DELETE FROM <table> WHERE ... ----
  const deleteMatch = trimmed.match(
    /^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?\s*$/i,
  );
  if (deleteMatch) {
    return handleDelete(data, deleteMatch, params, mode);
  }

  // ---- Unknown SQL ----
  if (mode === 'run') return { changes: 0, lastInsertRowid: 0 };
  return;
}

// ---- Parse helpers ----

function parseWhereClause(
  whereSql: string,
  params: unknown[],
): (row: Record<string, unknown>) => boolean {
  const conditions = splitConditions(whereSql);

  if (conditions.length === 0) {
    return () => true;
  }

  return (row: Record<string, unknown>) => {
    const localParams = [...params];
    return conditions.every((cond) => evaluateCondition(cond, row, localParams));
  };
}

function splitConditions(whereSql: string): string[] {
  const conditions: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < whereSql.length; i++) {
    const c = whereSql[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === 'A' && depth === 0) {
      if (whereSql.slice(i, i + 5) === ' AND ') {
        conditions.push(current.trim());
        current = '';
        i += 4;
        continue;
      }
    }
    current += c;
  }
  if (current.trim()) conditions.push(current.trim());
  return conditions;
}

function evaluateCondition(
  cond: string,
  row: Record<string, unknown>,
  params: unknown[],
): boolean {
  // col = ?
  const eqMatch = cond.match(/^(\w+)\s*=\s*\?$/);
  if (eqMatch) {
    const val = params.shift();
    const rowVal = row[eqMatch[1]!];
    if (typeof val === 'string' && typeof rowVal === 'string') {
      return rowVal === val;
    }
    return rowVal === val;
  }

  // col LIKE ?
  const likeMatch = cond.match(/^(\w+)\s+LIKE\s+\?$/);
  if (likeMatch) {
    const pattern = String(params.shift() ?? '');
    const colName = likeMatch[1]!;
    const rowVal = String(row[colName] ?? '');

    // Convert SQL LIKE pattern to JS match
    if (pattern.startsWith('%') && pattern.endsWith('%')) {
      const inner = pattern.slice(1, -1);
      return rowVal.includes(inner);
    }
    if (pattern.startsWith('%')) {
      return rowVal.endsWith(pattern.slice(1));
    }
    if (pattern.endsWith('%')) {
      return rowVal.startsWith(pattern.slice(0, -1));
    }
    return rowVal === pattern;
  }

  // col IN (?, ?, ?)
  const inMatch = cond.match(/^(\w+)\s+IN\s+\(([^)]+)\)$/i);
  if (inMatch) {
    const colName = inMatch[1]!;
    const placeholders = inMatch[2]!.split(',').map((p) => p.trim());
    const values = placeholders.map(() => params.shift());
    return values.includes(row[colName]);
  }

  // col != ? / col <> ?
  const neqMatch = cond.match(/^(\w+)\s*(?:!=|<>)\s*\??$/);
  if (neqMatch) {
    const val = params.shift();
    return row[neqMatch[1]!] !== val;
  }

  // col > ? / col < ? / col >= ? / col <= ?
  const cmpMatch = cond.match(/^(\w+)\s*(>=|<=|>|<)\s*\??$/);
  if (cmpMatch) {
    const val = params.shift();
    const rowVal = row[cmpMatch[1]!];
    if (val == null || rowVal == null) return false;
    switch (cmpMatch[2]) {
      case '>': return Number(rowVal) > Number(val);
      case '<': return Number(rowVal) < Number(val);
      case '>=': return Number(rowVal) >= Number(val);
      case '<=': return Number(rowVal) <= Number(val);
    }
  }

  // status = 'open' (literal quoted value, no ?)
  const quotedEqMatch = cond.match(/^(\w+)\s*=\s*'([^']+)'$/);
  if (quotedEqMatch) {
    const rowVal = String(row[quotedEqMatch[1]!] ?? '');
    return rowVal === quotedEqMatch[2]!;
  }

  // status IN ('open', 'resolved') (literal quoted values)
  const quotedInMatch = cond.match(/^(\w+)\s+IN\s+\(([^)]+)\)$/i);
  if (quotedInMatch) {
    const colName = quotedInMatch[1]!;
    const values = quotedInMatch[2]!.split(',').map(
      (p) => p.trim().replace(/^'|'$/g, ''),
    );
    return values.includes(String(row[colName] ?? ''));
  }

  // 1=1 always-true pattern
  if (/^\s*1\s*=\s*1\s*$/.test(cond)) {
    return true;
  }

  // Fallback: assume true
  return true;
}

function parseColumns(colSql: string): string[] {
  return colSql
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

function parseOrderBy(orderBySql: string): {
  column: string;
  direction: 'asc' | 'desc';
}[] {
  const orderStr = orderBySql.trim();
  const orders: { column: string; direction: 'asc' | 'desc' }[] = [];

  const parts = orderStr.split(',').map((p) => p.trim());
  for (const part of parts) {
    const match = part.match(/^(\w+)\s+(DESC|ASC)\s*$/i);
    if (match) {
      orders.push({
        column: match[1]!,
        direction: match[2]!.toLowerCase() as 'asc' | 'desc',
      });
    } else {
      orders.push({ column: part, direction: 'asc' });
    }
  }

  return orders;
}

function projectRow(
  row: Record<string, unknown>,
  selectCols: string,
): Record<string, unknown> {
  const cols = selectCols.trim();
  if (cols === '*') return row;

  const colList = parseColumns(cols);
  const result: Record<string, unknown> = {};
  for (const col of colList) {
    const asMatch = col.match(/^(\w+)\s+as\s+(\w+)$/i);
    if (asMatch) {
      result[asMatch[2]!] = row[asMatch[1]!];
    } else {
      result[col] = row[col];
    }
  }
  return result;
}

// ---- SQL operation handlers ----

function handleInsert(
  data: DbData,
  match: RegExpMatchArray,
  params: unknown[],
  mode: string,
  replace: boolean,
): any {
  const tableName = match[1]!;
  const cols = parseColumns(match[2]!);
  const values = [...params];

  const table = data[tableName as keyof DbData] as unknown as Record<string, unknown>[];

  // Build the row
  const row: Record<string, unknown> = {};
  for (let i = 0; i < cols.length && i < values.length; i++) {
    let val = values[i];
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null)) {
          val = parsed;
        }
      } catch {
        // Not JSON, keep as string
      }
    }
    row[cols[i]!] = val;
  }

  // Handle auto-increment for scope_snapshots
  if (tableName === 'scope_snapshots') {
    row.id = nextAutoIncrementId();
  }

  if (replace) {
    const pkCol = cols[0]!;
    const existingIndex = table.findIndex((r) => r[pkCol] === row[pkCol]);
    if (existingIndex >= 0) {
      table[existingIndex] = row;
      if (mode === 'run') return { changes: 1, lastInsertRowid: 0 };
      return;
    }
  }

  table.push(row);

  if (mode === 'run') {
    const lastId = tableName === 'scope_snapshots' ? Number(row.id) : 0;
    return { changes: 1, lastInsertRowid: lastId };
  }
}

function handleInsertSelect(
  data: DbData,
  match: RegExpMatchArray,
  params: unknown[],
  mode: string,
): any {
  const targetTable = match[1]!;
  const sourceTable = match[4]!;
  const rest = match[5]?.trim() ?? '';

  const source = data[sourceTable as keyof DbData] as unknown as Record<string, unknown>[];
  const target = data[targetTable as keyof DbData] as unknown as Record<string, unknown>[];

  let rows: Record<string, unknown>[] = source;
  if (rest) {
    const whereMatch = rest.match(/^WHERE\s+(.+)/i);
    if (whereMatch) {
      const whereParams = [...params];
      const filter = parseWhereClause(whereMatch[1]!, whereParams);
      rows = source.filter(filter);
    }
  }

  // Copy all rows to target
  for (const srcRow of rows) {
    const newRow: Record<string, unknown> = { ...srcRow };
    target.push(newRow);
  }

  if (mode === 'run') return { changes: rows.length, lastInsertRowid: 0 };
  return rows;
}

function handleSelect(
  data: DbData,
  match: RegExpMatchArray,
  params: unknown[],
  mode: string,
): any {
  const selectCols = match[1]!.trim();
  const tableName = match[2]!;
  const whereSql = match[3];
  const orderBySql = match[4];
  const limitSql = match[5];

  const table = data[tableName as keyof DbData] as unknown as Record<string, unknown>[];
  if (!table) {
    if (mode === 'get') return undefined;
    return [];
  }

  // Filter
  let rows = table;
  if (whereSql) {
    const filter = parseWhereClause(whereSql, params);
    rows = table.filter(filter);
  }

  // ORDER BY
  if (orderBySql) {
    const orders = parseOrderBy(orderBySql);
    rows = [...rows].sort((a, b) => {
      for (const order of orders) {
        const aVal = a[order.column];
        const bVal = b[order.column];
        let cmp = 0;
        if (aVal == null && bVal == null) cmp = 0;
        else if (aVal == null) cmp = -1;
        else if (bVal == null) cmp = 1;
        else if (typeof aVal === 'number' && typeof bVal === 'number') {
          cmp = aVal - bVal;
        } else if (typeof aVal === 'string' && typeof bVal === 'string') {
          cmp = aVal.localeCompare(bVal);
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }
        if (cmp !== 0) {
          return order.direction === 'desc' ? -cmp : cmp;
        }
      }
      return 0;
    });
  }

  // LIMIT
  if (limitSql) {
    const limitVal = parseInt(limitSql.trim(), 10);
    if (!isNaN(limitVal) && limitVal >= 0) {
      rows = rows.slice(0, limitVal);
    }
  }

  // Check for COUNT(*) aggregate
  const isCount = /^COUNT\s*\(\s*\*\s*\)/i.test(selectCols);
  if (isCount) {
    const alias = selectCols.replace(/^COUNT\s*\(\s*\*\s*\)(?:\s+as\s+(\w+))?/i, '$1') || 'count';
    const result: Record<string, unknown> = {};
    result[alias] = rows.length;
    if (mode === 'get') return result;
    if (mode === 'all') return [result];
    return result;
  }

  // Project columns if not *
  if (selectCols !== '*' && !/^COUNT\s*\(/i.test(selectCols)) {
    rows = rows.map((r) => projectRow(r, selectCols));
  }

  if (mode === 'get') return rows.length > 0 ? rows[0] : undefined;
  return rows;
}

function handleUpdate(
  data: DbData,
  match: RegExpMatchArray,
  params: unknown[],
  mode: string,
): any {
  const tableName = match[1]!;
  const setSql = match[2]!.trim();
  const whereSql = match[3];

  const table = data[tableName as keyof DbData] as unknown as Record<string, unknown>[];

  // Parse SET clauses: col = ?, col = ?
  const setClauses: { col: string }[] = [];
  const setParts = setSql.split(',').map((p) => p.trim());
  for (const part of setParts) {
    const setMatch = part.match(/^(\w+)\s*=\s*\??$/);
    if (setMatch) {
      setClauses.push({ col: setMatch[1]! });
    }
  }

  // The values for SET are the first N params, remaining are for WHERE
  const setValues = params.slice(0, setClauses.length);
  const whereParams = params.slice(setClauses.length);

  // Filter rows to update
  let targetRows = table;
  if (whereSql) {
    const filter = parseWhereClause(whereSql, whereParams);
    targetRows = table.filter(filter);
  }

  let changes = 0;
  for (const row of targetRows) {
    changes++;
    for (let i = 0; i < setClauses.length; i++) {
      let val = setValues[i];
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null)) {
            val = parsed;
          }
        } catch {
          // Not JSON, keep as string
        }
      }
      row[setClauses[i]!.col] = val;
    }
  }

  if (mode === 'run') return { changes, lastInsertRowid: 0 };
  return;
}

function handleDelete(
  data: DbData,
  match: RegExpMatchArray,
  params: unknown[],
  mode: string,
): any {
  const tableName = match[1]!;
  const whereSql = match[2];

  const table = data[tableName as keyof DbData] as unknown as Record<string, unknown>[];

  if (!whereSql) {
    // DELETE FROM table -- clear all
    const count = table.length;
    (data[tableName as keyof DbData] as unknown as Record<string, unknown>[]) = [];
    if (mode === 'run') return { changes: count, lastInsertRowid: 0 };
    return;
  }

  const filter = parseWhereClause(whereSql, params);
  let i = table.length;
  let changes = 0;
  while (i--) {
    if (filter(table[i]!)) {
      table.splice(i, 1);
      changes++;
    }
  }

  if (mode === 'run') return { changes, lastInsertRowid: 0 };
  return;
}

// ---- Statement wrapper ----
// Mimics the better-sqlite3 Statement API so existing code works unchanged.

export class Statement {
  private wrapper: DbWrapper;
  private sql: string;

  constructor(wrapper: DbWrapper, sql: string) {
    this.wrapper = wrapper;
    this.sql = sql;
  }

  run(...params: unknown[]): RunResult {
    this.wrapper._scheduleSave();
    try {
      const result = executeSql(this.wrapper.data, this.sql, [...params], 'run');
      if (result && typeof result.changes === 'number') {
        return result as RunResult;
      }
      return { changes: 0, lastInsertRowid: 0 };
    } catch (err) {
      throw err;
    }
  }

  get(...params: unknown[]): any | undefined {
    return executeSql(this.wrapper.data, this.sql, [...params], 'get');
  }

  all(...params: unknown[]): any[] {
    const result = executeSql(this.wrapper.data, this.sql, [...params], 'all');
    return Array.isArray(result) ? result : [];
  }
}

// ---- Database wrapper ----
// Wraps a lowdb instance and exposes a better-sqlite3-compatible API.

export class DbWrapper {
  private low: Low<DbData>;
  private _filePath: string | null;
  private _saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _inTransaction = false;
  /** Snapshot of data for transaction rollback */
  private _txSnapshot: string | null = null;

  constructor(low: Low<DbData>, filePath: string | null = null) {
    this.low = low;
    this._filePath = filePath;
  }

  /** Expose low.data for the mini query engine */
  get data(): DbData {
    return this.low.data;
  }

  _scheduleSave(): void {
    if (this._inTransaction) return; // Don't save mid-transaction

    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
    }
    this._saveDebounceTimer = setTimeout(() => {
      this.save();
      this._saveDebounceTimer = null;
    }, 500);
  }

  exec(sql: string): void {
    if (/^CREATE\s/i.test(sql.trim()) || /^DROP\s/i.test(sql.trim()) || /^PRAGMA/i.test(sql.trim())) {
      return; // DDL no-op
    }
    if (/^BEGIN\b/i.test(sql.trim())) {
      this._inTransaction = true;
      this._txSnapshot = JSON.stringify(this.low.data);
      return;
    }
    if (/^COMMIT\b/i.test(sql.trim())) {
      this._inTransaction = false;
      this._txSnapshot = null;
      this._scheduleSave();
      return;
    }
    if (/^ROLLBACK\b/i.test(sql.trim())) {
      this._inTransaction = false;
      if (this._txSnapshot) {
        this.low.data = JSON.parse(this._txSnapshot);
        this._txSnapshot = null;
      }
      return;
    }
    // DELETE FROM table, INSERT INTO ... SELECT, etc.
    executeSql(this.low.data, sql, [], 'exec');
  }

  prepare(sql: string): Statement {
    return new Statement(this, sql);
  }

  async close(): Promise<void> {
    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
      this._saveDebounceTimer = null;
    }
    await this.save();
  }

  /**
   * Release the exclusive file lock acquired by openDb.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  async releaseLock(): Promise<void> {
    if (this._filePath) {
      try {
        await lockfile.unlock(this._filePath, { lockfilePath: lockPath(this._filePath) });
      } catch {
        // Lock may already be released on crash recovery — best-effort
      }
    }
  }

  async save(): Promise<void> {
    if (this._filePath && this.low.data) {
      try {
        await this.low.write();
      } catch (err) {
        // Best-effort save
      }
    }
  }

  /**
   * Simple transaction support via snapshot/restore.
   * Since lowdb is not transactional, we snapshot data before running
   * the function and restore on error.
   */
  transaction<T>(fn: () => T): () => T {
    return () => {
      const snapshot = JSON.stringify(this.low.data);
      try {
        const result = fn();
        return result;
      } catch (err) {
        // Restore data on error and re-throw
        this.low.data = JSON.parse(snapshot);
        throw err;
      }
    };
  }
}

/** Type alias for backward compatibility. Use DbWrapper for new code. */
export type Database = DbWrapper;

// ---- Data presets for migrations ----

interface Migration {
  name: string;
  up: (data: DbData) => void;
}

const migrations: Migration[] = [
  {
    name: '001_initial_schema',
    up: (data: DbData) => {
      if (!Array.isArray(data._migrations)) data._migrations = [];
      if (!Array.isArray(data.decisions)) data.decisions = [];
      if (!Array.isArray(data.blockers)) data.blockers = [];
      if (!Array.isArray(data.notes)) data.notes = [];
      if (!Array.isArray(data.tasks)) data.tasks = [];
      if (!Array.isArray(data.scope_snapshots)) data.scope_snapshots = [];
    },
  },
  {
    name: '002_codebase_intelligence',
    up: (data: DbData) => {
      if (!Array.isArray(data.file_registry)) data.file_registry = [];
      if (!Array.isArray(data.dependency_edges)) data.dependency_edges = [];
      if (!Array.isArray(data.architecture_map)) data.architecture_map = [];
      if (!Array.isArray(data.doc_index)) data.doc_index = [];
      if (!Array.isArray(data.doc_fts)) data.doc_fts = [];
    },
  },
  {
    name: '003_semantic_index',
    up: (data: DbData) => {
      if (!Array.isArray(data.file_summaries)) data.file_summaries = [];
    },
  },
  {
    name: '004_fix_fts4',
    up: (data: DbData) => {
      if (!Array.isArray(data.doc_fts)) data.doc_fts = [];
      if (data.doc_fts.length === 0 && data.doc_index.length > 0) {
        data.doc_fts = data.doc_index.map((doc) => ({
          path: (doc as any).path,
          title: (doc as any).title,
          content: (doc as any).content,
        }));
      }
    },
  },
];

// ---- Open / Migrate / Close ----

function lockPath(dbPath: string): string {
  return dbPath + LOCK_DIR_SUFFIX;
}

export async function openDb(config: DbConfig): Promise<DbWrapper> {
  let low: Low<DbData>;

  if (config.memory) {
    low = new Low(new MemoryAdapter(), createEmptyData());
  } else {
    const dir = path.dirname(config.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Acquire exclusive file lock (retries with backoff for up to ~15s)
    if (!config.memory) {
      const lock = lockPath(config.path);
      try {
        await lockfile.lock(config.path, { ...LOCK_RETRY, lockfilePath: lock });
      } catch {
        throw new Error(
          `Could not acquire database lock for ${config.path}. Another PM Agent process may be active.`
        );
      }
    }

    // Wrap initialisation in try/catch so the lock is always released on failure
    try {
      // Detect old sql.js SQLite binary files (start with "SQLite format 3\0")
      // and remove them so LowDB can create a fresh JSON database.
      if (fs.existsSync(config.path)) {
        const header = fs.readFileSync(config.path, { encoding: 'utf-8', flag: 'r' }).slice(0, 20);
        if (header.startsWith('SQLite format 3')) {
          const bakPath = config.path + '.bak';
          console.warn(`Removing existing SQLite database at ${config.path} to migrate to JSON storage.`);
          fs.renameSync(config.path, bakPath);
        }
      }

      const adapter = new JSONFile<DbData>(config.path);
      low = new Low(adapter, createEmptyData());

      // Read existing data
      try {
        await low.read();
      } catch {
        // If JSON parse fails (e.g. corrupt file), reset to empty
        low.data = createEmptyData();
      }
      if (!low.data || Object.keys(low.data).length === 0) {
        low.data = createEmptyData();
      }
    } catch (err) {
      // Lock was acquired but initialisation failed — release the lock before rethrowing
      try {
        await lockfile.unlock(config.path, { lockfilePath: lockPath(config.path) });
      } catch {
        // Best-effort unlock
      }
      throw err;
    }
  }

  // Initialize any missing tables
  const defaultData = createEmptyData();
  for (const key of Object.keys(defaultData) as (keyof DbData)[]) {
    if (!Array.isArray((low.data as any)[key])) {
      (low.data as any)[key] = [];
    }
  }

  const wrapper = new DbWrapper(low, config.memory ? null : config.path);

  // Reset auto-increment counter
  resetAutoIncrement(low.data);

  // Run migrations
  migrate(wrapper);

  return wrapper;
}

export function migrate(db: DbWrapper): void {
  const data = db.data;

  if (!Array.isArray(data._migrations)) {
    data._migrations = [];
  }

  const applied = new Set(data._migrations.map((m) => m.name));

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      const snapshot = JSON.stringify(data);
      try {
        migration.up(data);
        data._migrations.push({
          id: data._migrations.length + 1,
          name: migration.name,
          applied_at: new Date().toISOString(),
        });
      } catch (err) {
        Object.assign(data, JSON.parse(snapshot));
        throw err;
      }
    }
  }
}

export async function closeDb(db: DbWrapper): Promise<void> {
  await db.close();
  await db.releaseLock();
}

type IdPrefix = 'ADR' | 'BLK' | 'NOTE' | 'TASK';

export function generateId(db: DbWrapper, prefix: IdPrefix): string {
  const tableMap: Record<IdPrefix, string> = {
    ADR: 'decisions',
    BLK: 'blockers',
    NOTE: 'notes',
    TASK: 'tasks',
  };

  if (!(prefix in tableMap)) {
    throw new Error(`Invalid ID prefix: ${prefix}. Must be one of: ${Object.keys(tableMap).join(', ')}`);
  }

  const table = tableMap[prefix];
  const rows = db.prepare(`SELECT id FROM ${table} WHERE id LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}-%`) as { id: string } | undefined;

  let lastId = 0;
  if (rows) {
    const numericPart = parseInt((rows as any).id.split('-')[1]!, 10);
    if (!isNaN(numericPart)) {
      lastId = numericPart;
    }
  }

  const nextId = lastId + 1;
  return `${prefix}-${String(nextId).padStart(3, '0')}`;
}

// ---- In-memory adapter for memory mode ----

class MemoryAdapter {
  data: DbData = createEmptyData();
  async read(): Promise<DbData | null> {
    return this.data;
  }
  async write(data: DbData): Promise<void> {
    this.data = data;
  }
}
