import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import type { SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';

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

// ---- Statement wrapper ----
// Mimics the better-sqlite3 Statement API so existing code works unchanged.

export class Statement {
  private db: SqlJsDatabase;
  private sql: string;

  constructor(db: SqlJsDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  run(...params: unknown[]): RunResult {
    const bindParams = params.length > 0 ? params : undefined;
    this.db.run(this.sql, bindParams as any);
    const changes = this.db.getRowsModified();
    const isInsert = /^\s*INSERT\s/i.test(this.sql);
    let lastInsertRowid = 0;
    if (isInsert) {
      try {
        const result = this.db.exec('SELECT last_insert_rowid() as id');
        if (result.length > 0 && result[0]!.values.length > 0) {
          lastInsertRowid = Number(result[0]!.values[0]![0]);
        }
      } catch {
        // last_insert_rowid not available
      }
    }
    return { changes, lastInsertRowid };
  }

  get(...params: unknown[]): any | undefined {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(params as any);
    const row = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return row;
  }

  all(...params: unknown[]): any[] {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(params as any);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }
}

// ---- Database wrapper ----
// Wraps a sql.js Database and exposes a better-sqlite3-compatible API.

export class DbWrapper {
  private db: SqlJsDatabase;
  private filePath: string | null;

  constructor(db: SqlJsDatabase, filePath: string | null = null) {
    this.db = db;
    this.filePath = filePath;
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): Statement {
    return new Statement(this.db, sql);
  }

  close(): void {
    // Persist to disk before closing if we have a file path
    if (this.filePath) {
      try {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.filePath, buffer);
      } catch {
        // Best-effort save on close
      }
    }
    this.db.close();
  }

  /**
   * Save the database to disk immediately.
   */
  save(): void {
    if (this.filePath) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.filePath, buffer);
    }
  }

  /**
   * Run a callback inside a SQL transaction (BEGIN/COMMIT).
   * Mimics the better-sqlite3 transaction API so existing scanner code works unchanged.
   */
  transaction<T>(fn: () => T): () => T {
    return () => {
      this.db.exec('BEGIN');
      try {
        const result = fn();
        this.db.exec('COMMIT');
        return result;
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    };
  }
}

/** Type alias for backward compatibility. Use DbWrapper for new code. */
export type Database = DbWrapper;

// ---- Migrations ----

interface Migration {
  name: string;
  up: (db: DbWrapper) => void;
}

const migrations: Migration[] = [
  {
    name: '001_initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS decisions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          author TEXT,
          made_at TEXT NOT NULL,
          linked_entities TEXT DEFAULT '[]',
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_decisions_made_at ON decisions(made_at);
        CREATE INDEX IF NOT EXISTS idx_decisions_author ON decisions(author);

        CREATE TABLE IF NOT EXISTS blockers (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          age_hours INTEGER DEFAULT 0,
          blocked_by TEXT DEFAULT '',
          status TEXT DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
          linked_entities TEXT DEFAULT '[]',
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_blockers_status ON blockers(status);
        CREATE INDEX IF NOT EXISTS idx_blockers_age ON blockers(age_hours);

        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          tags TEXT DEFAULT '[]',
          linked_entities TEXT DEFAULT '[]',
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes(tags);

        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'blocked', 'done')),
          owner TEXT DEFAULT '',
          linked_entities TEXT DEFAULT '[]',
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner);

        CREATE TABLE IF NOT EXISTS scope_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sprint_name TEXT,
          committed_days REAL DEFAULT 0,
          remaining_days REAL DEFAULT 0,
          risk TEXT DEFAULT 'LOW' CHECK(risk IN ('LOW', 'MEDIUM', 'HIGH')),
          captured_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_scope_sprint ON scope_snapshots(sprint_name);
      `);
    },
  },
  {
    name: '003_semantic_index',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS file_summaries (
          path TEXT PRIMARY KEY,
          summary TEXT,
          purpose TEXT,
          exports TEXT DEFAULT '[]',
          imports TEXT DEFAULT '[]',
          key_types TEXT DEFAULT '[]',
          generated_at TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    name: '002_codebase_intelligence',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS file_registry (
          path TEXT PRIMARY KEY,
          hash TEXT NOT NULL,
          size INTEGER NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('source', 'test', 'doc', 'config', 'asset', 'unknown')),
          last_indexed_at TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_file_type ON file_registry(type);

        CREATE TABLE IF NOT EXISTS dependency_edges (
          source_path TEXT NOT NULL,
          target_path TEXT NOT NULL,
          import_type TEXT DEFAULT 'static' CHECK(import_type IN ('static', 'dynamic', 'type_only')),
          PRIMARY KEY (source_path, target_path)
        );
        CREATE INDEX IF NOT EXISTS idx_deps_target ON dependency_edges(target_path);

        CREATE TABLE IF NOT EXISTS architecture_map (
          path TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('entrypoint','middleware','model','route','controller','service','util','component','hook','test','config')),
          framework TEXT,
          metadata TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_arch_role ON architecture_map(role);

        CREATE TABLE IF NOT EXISTS doc_index (
          path TEXT PRIMARY KEY,
          title TEXT,
          content TEXT NOT NULL,
          tokens TEXT,
          last_indexed_at TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
          path, title, content, content=doc_index, content_rowid=rowid
        );

        CREATE TRIGGER IF NOT EXISTS doc_index_ai AFTER INSERT ON doc_index BEGIN
          INSERT INTO doc_fts(rowid, path, title, content)
          VALUES (new.rowid, new.path, new.title, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS doc_index_ad AFTER DELETE ON doc_index BEGIN
          INSERT INTO doc_fts(doc_fts, rowid, path, title, content)
          VALUES ('delete', old.rowid, old.path, old.title, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS doc_index_au AFTER UPDATE ON doc_index BEGIN
          INSERT INTO doc_fts(doc_fts, rowid, path, title, content)
          VALUES ('delete', old.rowid, old.path, old.title, old.content);
          INSERT INTO doc_fts(rowid, path, title, content)
          VALUES (new.rowid, new.path, new.title, new.content);
        END;
      `);
    },
  },
];

// ---- Open / Migrate / Close ----

let sqlJsInitPromise: Promise<SqlJsStatic> | null = null;

async function ensureSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsInitPromise) {
    sqlJsInitPromise = initSqlJs();
  }
  return sqlJsInitPromise;
}

export async function openDb(config: DbConfig): Promise<DbWrapper> {
  if (!config.memory) {
    const dir = path.dirname(config.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const SQL = await ensureSqlJs();
  let db: SqlJsDatabase;

  try {
    if (config.memory) {
      db = new SQL.Database();
    } else if (fs.existsSync(config.path)) {
      const buffer = fs.readFileSync(config.path);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
  } catch (err) {
    const msg = String(err);
    if (
      msg.includes('cannot find module') ||
      msg.includes('sql.js') ||
      msg.includes('wasm') ||
      msg.includes('WebAssembly')
    ) {
      throw new Error(
        `Failed to initialize sql.js database.\n` +
        `Fix: Make sure sql.js is installed:\n\n` +
        `  npm install @gida-concept/pm-agent-core\n`
      );
    }
    throw err;
  }

  // Apply PRAGMAs
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA busy_timeout = 5000');
  db.run('PRAGMA foreign_keys = ON');

  const wrapper = new DbWrapper(db, config.memory ? null : config.path);
  migrate(wrapper);

  return wrapper;
}

export function migrate(db: DbWrapper): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  );

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      db.exec('BEGIN');
      try {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  }
}

export function closeDb(db: DbWrapper): void {
  db.close();
}

type IdPrefix = 'ADR' | 'BLK' | 'NOTE' | 'TASK';

export function generateId(db: DbWrapper, prefix: IdPrefix): string {
  const tableMap: Record<IdPrefix, string> = {
    ADR: 'decisions',
    BLK: 'blockers',
    NOTE: 'notes',
    TASK: 'tasks',
  };

  const table = tableMap[prefix];
  let lastId = 0;

  const row = db
    .prepare(`SELECT id FROM ${table} WHERE id LIKE '${prefix}-%' ORDER BY id DESC LIMIT 1`)
    .get() as { id: string } | undefined;

  if (row) {
    const numericPart = parseInt(row.id.split('-')[1]!, 10);
    if (!isNaN(numericPart)) {
      lastId = numericPart;
    }
  }

  const nextId = lastId + 1;
  return `${prefix}-${String(nextId).padStart(3, '0')}`;
}
