import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface DbConfig {
  path: string;
  memory?: boolean;
  readonly?: boolean;
}

interface Migration {
  name: string;
  up: (db: Database.Database) => void;
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

export function openDb(config: DbConfig): Database.Database {
  if (!config.memory) {
    const dir = path.dirname(config.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(config.memory ? ':memory:' : config.path, {
    readonly: config.readonly ?? false,
  });

  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  migrate(db);

  return db;
}

export function migrate(db: Database.Database): void {
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
      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
      })();
    }
  }
}

export function closeDb(db: Database.Database): void {
  db.close();
}

type IdPrefix = 'ADR' | 'BLK' | 'NOTE' | 'TASK';

export function generateId(db: Database.Database, prefix: IdPrefix): string {
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
