# PM Agent — Database

> The SQLite-backed temporal project graph: schema, migrations, queries, and data access patterns.

---

## Table of Contents

- [Overview](#overview)
- [Database Location](#database-location)
- [Schema](#schema)
- [Migrations](#migrations)
- [Entity Linking (The Graph)](#entity-linking-the-graph)
- [Query Patterns](#query-patterns)
- [Data Access Layer](#data-access-layer)
- [Testing with In-Memory DB](#testing-with-in-memory-db)
- [Performance Considerations](#performance-considerations)

---

## Overview

PM Agent uses [SQLite](https://www.sqlite.org/) via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) for all persistent storage. Each project gets its own database file. The database serves as a **temporal project graph** — it doesn't just store data, it stores **relationships** between entities so AI agents can answer questions like "what's related to AUTH-91?" with full context.

### Why SQLite?

| Requirement     | How SQLite satisfies it                                                  |
| --------------- | ------------------------------------------------------------------------ |
| **Local-first** | Single file per project, no server, no cloud dependency                  |
| **Zero config** | Created automatically on `pm init`, no migrations to run manually        |
| **Portable**    | One `.db` file you can copy, backup, or check into version control       |
| **Relational**  | Entities link to each other — SQL joins handle graph queries naturally   |
| **Performant**  | Sub-millisecond reads, no network overhead, built for single-user access |
| **Durable**     | ACID compliant — crashes don't corrupt the graph                         |

---

## Database Location

```
~/.local/share/pm-agent/<project-name>.db
```

Created automatically on first `pm init`. The path is configurable in `~/.config/pm-agent/config.toml`:

```toml
[memory]
storage = "sqlite"
path = "~/.local/share/pm-agent/auth-service.db"
retention_days = 365
```

### Per-Project Isolation

Each project gets its own database file. This keeps data isolated and portable — you can archive or share a project's context by copying its `.db` file.

---

## Schema

Five tables model the PM domain. Four more tables model the codebase intelligence layer (file registry, dependency graph, architecture map, documentation index). Every table uses `TEXT` for IDs (human-readable like `ADR-004`, `BLK-003`) and `linked_entities` as a JSON array for cross-table relationships.

### decisions

Stores Architectural Decision Records (ADRs) — documented choices with rationale.

```sql
CREATE TABLE decisions (
    id TEXT PRIMARY KEY,           -- ADR-001, ADR-002, ...
    title TEXT NOT NULL,           -- Short summary ("Drop OAuth, use magic links")
    body TEXT NOT NULL,            -- Full rationale, alternatives considered
    author TEXT,                   -- Who made the decision (@username)
    made_at TEXT NOT NULL,         -- ISO 8601 timestamp
    linked_entities TEXT,          -- JSON array: ["PR-442", "AUTH-91", "NOTE-012"]
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_decisions_made_at ON decisions(made_at);
CREATE INDEX idx_decisions_author ON decisions(author);
```

**Example row:**

| id      | title                       | body                                                                                                                 | author | made_at              | linked_entities                 |
| ------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ | -------------------- | ------------------------------- |
| ADR-004 | Drop OAuth, use magic links | We're switching to passwordless magic links because OAuth adds 3 weeks to the timeline. Auth0 cost is also a factor. | @alice | 2026-07-15T10:30:00Z | ["PR-442", "AUTH-91", "RFC-18"] |

### blockers

Tracks things that are blocking progress — unreviewed PRs, unanswered RFCs, external dependencies.

```sql
CREATE TABLE blockers (
    id TEXT PRIMARY KEY,           -- BLK-001, BLK-002, ...
    title TEXT NOT NULL,           -- "PR #442 unreviewed"
    description TEXT,              -- Optional details
    age_hours INTEGER,            -- How long this has been blocking
    blocked_by TEXT,               -- Person, team, or external dependency
    status TEXT DEFAULT 'open'     -- open | resolved
        CHECK(status IN ('open', 'resolved')),
    linked_entities TEXT,          -- JSON array
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_blockers_status ON blockers(status);
CREATE INDEX idx_blockers_age ON blockers(age_hours);
```

**Example row:**

| id      | title                | description                                              | age_hours | blocked_by    | status | linked_entities        |
| ------- | -------------------- | -------------------------------------------------------- | --------- | ------------- | ------ | ---------------------- |
| BLK-003 | PR #442 needs review | OAuth backend PR has been open for 2 days with no review | 48        | @backend-lead | open   | ["ADR-004", "AUTH-91"] |

### notes

Freeform text capture — meeting notes, Slack summaries, random thoughts. Auto-tagged and linked.

```sql
CREATE TABLE notes (
    id TEXT PRIMARY KEY,           -- NOTE-001, NOTE-002, ...
    content TEXT NOT NULL,         -- Freeform text
    tags TEXT,                     -- JSON array: ["stakeholder", "sprint-14"]
    linked_entities TEXT,          -- JSON array
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_notes_tags ON notes(tags);
```

**Example row:**

| id       | content                                                                                                     | tags                                 | linked_entities        | created_at           |
| -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------- | -------------------- |
| NOTE-012 | Stakeholder call: delay on auth is acceptable if we ship by Aug 1. @product-lead agreed to defer dark mode. | ["stakeholder", "sprint-14", "auth"] | ["AUTH-91", "ADR-004"] | 2026-07-16T14:00:00Z |

### tasks

Tracks work items and their state. Links to decisions, blockers, and notes for full context.

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,           -- TASK-001, TASK-002, ...
    title TEXT NOT NULL,           -- "Implement magic link flow"
    status TEXT DEFAULT 'todo'     -- todo | in_progress | blocked | done
        CHECK(status IN ('todo', 'in_progress', 'blocked', 'done')),
    owner TEXT,                    -- Assigned to (@username)
    linked_entities TEXT,          -- JSON array
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_owner ON tasks(owner);
```

**Example row:**

| id       | title                     | status  | owner | linked_entities                   | created_at           |
| -------- | ------------------------- | ------- | ----- | --------------------------------- | -------------------- |
| TASK-007 | Implement magic link flow | blocked | @bob  | ["ADR-004", "BLK-003", "AUTH-91"] | 2026-07-15T11:00:00Z |

### scope_snapshots

Periodic captures of sprint capacity. Not point-in-time — each snapshot is a row, so you can track scope changes over time.

```sql
CREATE TABLE scope_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sprint_name TEXT,              -- "Sprint 14"
    committed_days REAL,          -- Total committed work in days
    remaining_days REAL,          -- Days remaining in sprint
    risk TEXT,                    -- LOW | MEDIUM | HIGH
        CHECK(risk IN ('LOW', 'MEDIUM', 'HIGH')),
    captured_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_scope_sprint ON scope_snapshots(sprint_name);
```

**Example row:**

| id  | sprint_name | committed_days | remaining_days | risk | captured_at          |
| --- | ----------- | -------------- | -------------- | ---- | -------------------- |
| 1   | Sprint 14   | 8              | 4              | HIGH | 2026-07-15T09:00:00Z |

### file_registry

Every file in the project — indexed so nothing is missed. Used for cold-start scanning, incremental updates, and verify mode.

```sql
CREATE TABLE file_registry (
    path TEXT PRIMARY KEY,                    -- Relative to project root (e.g. "src/auth/service.ts")
    hash TEXT NOT NULL,                        -- SHA-256 of file content
    size INTEGER NOT NULL,
    type TEXT NOT NULL                         -- source | test | doc | config | asset | unknown
        CHECK(type IN ('source', 'test', 'doc', 'config', 'asset', 'unknown')),
    last_indexed_at TEXT NOT NULL,             -- ISO 8601
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_file_type ON file_registry(type);
```

**Example rows:**

| path                     | hash        | size | type   | last_indexed_at      |
| ------------------------ | ----------- | ---- | ------ | -------------------- |
| src/auth/service.ts      | a1b2c3d4... | 2048 | source | 2026-07-21T10:00:00Z |
| src/auth/service.test.ts | e5f6g7h8... | 1024 | test   | 2026-07-21T10:00:00Z |
| README.md                | i9j0k1l2... | 5120 | doc    | 2026-07-21T10:00:00Z |

### dependency_edges

Directional import relationships between files. Built by shelling to ripgrep (import matching) and madge (circular detection).

```sql
CREATE TABLE dependency_edges (
    source_path TEXT NOT NULL,                 -- importer: "src/auth/service.ts"
    target_path TEXT NOT NULL,                 -- imported: "src/user/model.ts"
    import_type TEXT DEFAULT 'static',         -- static | dynamic | type_only
    PRIMARY KEY (source_path, target_path)
);

CREATE INDEX idx_deps_target ON dependency_edges(target_path);
```

**Example rows:**

| source_path         | target_path         | import_type |
| ------------------- | ------------------- | ----------- |
| src/auth/service.ts | src/user/model.ts   | static      |
| src/auth/service.ts | src/db/client.ts    | static      |
| src/routes/login.ts | src/auth/service.ts | static      |

### architecture_map

Detected architecture patterns — entry points, frameworks, roles.

```sql
CREATE TABLE architecture_map (
    path TEXT NOT NULL,
    role TEXT NOT NULL,                        -- entrypoint | middleware | model | route | controller | service | util | component | hook | test | config
    framework TEXT,                            -- express | next | react | vue | nest | vitest | jest
    metadata TEXT,                             -- JSON blob: { "page": "/login", "method": "POST" }
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_arch_role ON architecture_map(role);
```

**Example rows:**

| path                | role       | framework | metadata                                 |
| ------------------- | ---------- | --------- | ---------------------------------------- |
| src/main.ts         | entrypoint | express   | {"port": 3000}                           |
| src/routes/login.ts | route      | express   | {"method": "POST", "path": "/api/login"} |
| src/user/model.ts   | model      | —         | {"table": "users"}                       |

### doc_index + doc_fts

Full-text search across all documentation files. Uses SQLite FTS5 for fast keyword search.

```sql
CREATE TABLE doc_index (
    path TEXT PRIMARY KEY,                     -- "README.md", "docs/architecture.md"
    title TEXT,                                -- Extracted heading
    content TEXT NOT NULL,                     -- Plain-text content
    tokens TEXT,                               -- JSON array of keywords
    last_indexed_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Full-text search virtual table (SQLite FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
    path, title, content, content=doc_index, content_rowid=rowid
);

-- Triggers to keep FTS in sync
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
```

**Example rows:**

| path                 | title        | content                                      | tokens                             |
| -------------------- | ------------ | -------------------------------------------- | ---------------------------------- |
| README.md            | PM Agent     | "PM Agent is a context-aware memory..."      | ["memory", "rules", "pm", "agent"] |
| docs/architecture.md | Architecture | "PM Agent follows a layered architecture..." | ["architecture", "layered", "mcp"] |

---

## Entity Linking (The Graph)

### How Linking Works

Every entity has a `linked_entities` column storing a JSON array of IDs from any other table:

```
NOTE-012 ──► ["AUTH-91", "ADR-004"]
              │          │
              ▼          ▼
           tasks     decisions
           AUTH-91   ADR-004
```

Linking happens **automatically** based on keyword matching when a note or decision is created:

```typescript
// When creating a decision titled "Drop OAuth, use magic links":
// 1. Scan all existing entities for keyword matches ("OAuth", "magic links")
// 2. Found: PR #442 (mentions OAuth), AUTH-91 (auth ticket)
// 3. Store: linked_entities = ["PR-442", "AUTH-91"]
```

Manual linking is also supported via the CLI:

```bash
pm log "Drop OAuth" --link PR-442 --link AUTH-91
```

### Graph Queries

The `graph.ts` module provides cross-entity traversal:

```typescript
// Get everything related to AUTH-91
const related = getRelatedEntities(db, 'AUTH-91');
// → {
//     decisions: [{ id: "ADR-004", title: "Drop OAuth, use magic links", ... }],
//     blockers:  [{ id: "BLK-003", title: "PR #442 needs review", ... }],
//     notes:     [{ id: "NOTE-012", content: "Stakeholder call: delay OK", ... }],
//     tasks:     [{ id: "TASK-007", title: "Implement magic link flow", ... }]
//   }

// Get the full context graph starting from a note
const context = await expandGraph(db, 'NOTE-012', { depth: 2 });
// → NOTE-012
//   ├── AUTH-91 (task)
//   │   ├── ADR-004 (decision)
//   │   │   └── PR-442 (blocker)
//   │   └── BLK-003 (blocker)
//   └── ADR-004 (decision)
```

### Linking Strategy

| Scenario                           | Strategy                                     |
| ---------------------------------- | -------------------------------------------- |
| Note mentions "AUTH-91"            | Auto-link to task AUTH-91                    |
| Decision body references "PR #442" | Auto-link to blocker PR-442                  |
| User passes `--link TASK-007`      | Explicit link                                |
| Standup query                      | Follow all linked entities from recent items |

---

## Migrations

Migrations run automatically on `pm init` (and every DB open). The migration is idempotent — it checks which migrations have been applied and only runs new ones.

### Migration Table

```sql
CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
);
```

### Migration Pattern

```typescript
// db.ts
const migrations = [
  {
    name: '001_initial_schema',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE decisions ( ... );
        CREATE TABLE blockers ( ... );
        CREATE TABLE notes ( ... );
        CREATE TABLE tasks ( ... );
        CREATE TABLE scope_snapshots ( ... );
        CREATE INDEX idx_decisions_made_at ON decisions(made_at);
        -- ... all other indexes
      `);
    },
  },
];

function migrate(db: Database): void {
  // Ensure migration tracking table exists
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);

  // Get applied migrations
  const applied = new Set(
    db
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row: any) => row.name),
  );

  // Run unapplied migrations in order
  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
      })();
    }
  }
}
```

### Adding a Migration

```typescript
// Add to the migrations array in db.ts:
{
  name: "002_add_priority_to_tasks",
  up: (db: Database) => {
    db.exec(`ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium'
      CHECK(priority IN ('low', 'medium', 'high', 'critical'));`);
  }
}
```

Migrations are **append-only** — never modify an existing migration. Order matters.

---

## Query Patterns

### Decisions

```typescript
// Create a decision
const insert = db.prepare(`
  INSERT INTO decisions (id, title, body, author, made_at, linked_entities)
  VALUES (?, ?, ?, ?, ?, ?)
`);
insert.run(id, title, body, author, now, JSON.stringify(links));

// Get recent decisions (last 7 days)
const recent = db
  .prepare(
    `
  SELECT * FROM decisions
  WHERE made_at >= datetime('now', '-7 days')
  ORDER BY made_at DESC
`,
  )
  .all();

// Find decisions linked to a specific entity
const linked = db
  .prepare(
    `
  SELECT * FROM decisions
  WHERE linked_entities LIKE ?
`,
  )
  .all(`%"${entityId}"%`);

// Decision count (used by rules engine condition: ticket.decisions.count == 0)
const count = db
  .prepare(
    `
  SELECT COUNT(*) as count FROM decisions
  WHERE linked_entities LIKE ?
`,
  )
  .get(`%"${ticketId}"%`);
```

### Blockers

```typescript
// Get active blockers sorted by age
const active = db
  .prepare(
    `
  SELECT * FROM blockers
  WHERE status = 'open'
  ORDER BY age_hours DESC
`,
  )
  .all();

// Resolve a blocker
db.prepare(`UPDATE blockers SET status = 'resolved' WHERE id = ?`).run(id);

// Blocker count (used by conditions: blockers.count > 0)
const count = db
  .prepare(
    `
  SELECT COUNT(*) as count FROM blockers WHERE status = 'open'
`,
  )
  .get();
```

### Notes

```typescript
// Create a note with tags
const insert = db.prepare(`
  INSERT INTO notes (id, content, tags, linked_entities)
  VALUES (?, ?, ?, ?)
`);
insert.run(id, content, JSON.stringify(tags), JSON.stringify(links));

// Search notes by content
const results = db
  .prepare(
    `
  SELECT * FROM notes WHERE content LIKE ?
  ORDER BY created_at DESC
`,
  )
  .all(`%${searchTerm}%`);

// Get notes by tag
const tagged = db
  .prepare(
    `
  SELECT * FROM notes WHERE tags LIKE ?
`,
  )
  .all(`%"${tag}"%`);

// Get today's notes (for standup)
const today = db
  .prepare(
    `
  SELECT * FROM notes
  WHERE created_at >= datetime('now', 'start of day')
  ORDER BY created_at DESC
`,
  )
  .all();
```

### Tasks

```typescript
// Get blocked tasks
const blocked = db
  .prepare(
    `
  SELECT * FROM tasks WHERE status = 'blocked'
`,
  )
  .all();

// Update task status
db.prepare(`UPDATE tasks SET status = ? WHERE id = ?`).run(newStatus, id);

// Get tasks assigned to someone
const myTasks = db
  .prepare(
    `
  SELECT * FROM tasks WHERE owner = ?
`,
  )
  .all(username);
```

### Scope

```typescript
// Capture a scope snapshot
db.prepare(
  `
  INSERT INTO scope_snapshots (sprint_name, committed_days, remaining_days, risk)
  VALUES (?, ?, ?, ?)
`,
).run(sprint, committed, remaining, risk);

// Get latest scope
const latest = db
  .prepare(
    `
  SELECT * FROM scope_snapshots
  ORDER BY captured_at DESC
  LIMIT 1
`,
  )
  .get();

// Scope history for a sprint
const history = db
  .prepare(
    `
  SELECT * FROM scope_snapshots
  WHERE sprint_name = ?
  ORDER BY captured_at ASC
`,
  )
  .all(sprintName);
```

### Codebase Intelligence

```typescript
// File Registry — verify all files are indexed, find missing
const indexedCount = db.prepare(`SELECT COUNT(*) as c FROM file_registry`).get();
const byType = db
  .prepare(
    `
  SELECT type, COUNT(*) as count FROM file_registry GROUP BY type
`,
  )
  .all();

// Find unindexed or changed files (verify mode)
const changedFiles = db
  .prepare(
    `
  SELECT f.path, f.hash, f.last_indexed_at
  FROM file_registry f
  WHERE f.last_indexed_at < ?
  ORDER BY f.last_indexed_at
`,
  )
  .all(yesterday);

// Dependency Graph — what does this file import?
const imports = db
  .prepare(
    `
  SELECT e.target_path, e.import_type
  FROM dependency_edges e
  WHERE e.source_path = ?
  ORDER BY e.target_path
`,
  )
  .all(filePath);

// Dependency Graph — what imports this file? (reverse deps)
const importedBy = db
  .prepare(
    `
  SELECT e.source_path, e.import_type
  FROM dependency_edges e
  WHERE e.target_path = ?
  ORDER BY e.source_path
`,
  )
  .all(filePath);

// Impact Analysis — full reverse-dependency tree
function getImpactChain(db: Database, path: string, depth = 2): string[] {
  if (depth === 0) return [];
  const direct = db
    .prepare(
      `
    SELECT source_path FROM dependency_edges WHERE target_path = ?
  `,
    )
    .all(path) as { source_path: string }[];
  const transitive = direct.flatMap((d) => getImpactChain(db, d.source_path, depth - 1));
  return [...new Set([...direct.map((d) => d.source_path), ...transitive])];
}

// Architecture — get all entry points
const entryPoints = db
  .prepare(
    `
  SELECT path, framework, metadata
  FROM architecture_map
  WHERE role = 'entrypoint'
`,
  )
  .all();

// Architecture — get all routes in a framework
const routes = db
  .prepare(
    `
  SELECT path, metadata
  FROM architecture_map
  WHERE role = 'route' AND framework = ?
`,
  )
  .all('express');

// Full-text search (SQLite FTS5)
const searchResults = db
  .prepare(
    `
  SELECT path, title, snippet(doc_fts, 1, '<b>', '</b>', '...', 20) as preview
  FROM doc_fts
  WHERE doc_fts MATCH ?
  ORDER BY rank
  LIMIT 20
`,
  )
  .all(searchTerm);

// Cross-file search via LIKE (when FTS is overkill)
const mentions = db
  .prepare(
    `
  SELECT path, type FROM file_registry
  WHERE path LIKE ?
`,
  )
  .all(`%${keyword}%`);

// Link PM context to a file path (graph query)
function getRelatedEntitiesByFile(db: Database, filePath: string) {
  const like = `%"${filePath}"%`;
  return {
    decisions: db
      .prepare(
        `
      SELECT id, title, body FROM decisions
      WHERE linked_entities LIKE ? ORDER BY made_at DESC
    `,
      )
      .all(like),
    blockers: db
      .prepare(
        `
      SELECT id, title, status FROM blockers
      WHERE linked_entities LIKE ? ORDER BY age_hours DESC
    `,
      )
      .all(like),
    tasks: db
      .prepare(
        `
      SELECT id, title, status FROM tasks
      WHERE linked_entities LIKE ?
    `,
      )
      .all(like),
    notes: db
      .prepare(
        `
      SELECT id, content, created_at FROM notes
      WHERE linked_entities LIKE ? ORDER BY created_at DESC
    `,
      )
      .all(like),
  };
}

// Scan verification — count files on disk vs DB
const onDisk = 1234; // from glob walk
const inDb = db.prepare(`SELECT COUNT(*) as c FROM file_registry`).get();
// → if onDisk !== inDb.c → report missing/new files
```

### Cross-Entity Traversal

```typescript
// Get all entities linked to a given ID
function getRelatedEntities(db: Database, entityId: string): RelatedEntities {
  const like = `%"${entityId}"%`;

  return {
    decisions: db
      .prepare(
        `SELECT id, title, body, author, made_at FROM decisions
       WHERE linked_entities LIKE ? ORDER BY made_at DESC`,
      )
      .all(like),
    blockers: db
      .prepare(
        `SELECT id, title, age_hours, blocked_by, status FROM blockers
       WHERE linked_entities LIKE ? ORDER BY age_hours DESC`,
      )
      .all(like),
    notes: db
      .prepare(
        `SELECT id, content, tags, created_at FROM notes
       WHERE linked_entities LIKE ? ORDER BY created_at DESC`,
      )
      .all(like),
    tasks: db
      .prepare(
        `SELECT id, title, status, owner FROM tasks
       WHERE linked_entities LIKE ?`,
      )
      .all(like),
  };
}
```

### Standup Summary

```typescript
function getStandupData(db: Database): StandupData {
  return {
    // What was done yesterday (last 24h)
    recentDecisions: db
      .prepare(
        `
      SELECT * FROM decisions
      WHERE made_at >= datetime('now', '-24 hours')
      ORDER BY made_at DESC
    `,
      )
      .all(),
    recentNotes: db
      .prepare(
        `
      SELECT * FROM notes
      WHERE created_at >= datetime('now', '-24 hours')
      ORDER BY created_at DESC
    `,
      )
      .all(),

    // What's blocking
    activeBlockers: db
      .prepare(
        `
      SELECT * FROM blockers
      WHERE status = 'open'
      ORDER BY age_hours DESC
    `,
      )
      .all(),

    // Current sprint context
    latestScope: db
      .prepare(
        `
      SELECT * FROM scope_snapshots
      ORDER BY captured_at DESC LIMIT 1
    `,
      )
      .get(),

    // What's in flight
    activeTasks: db
      .prepare(
        `
      SELECT * FROM tasks
      WHERE status IN ('in_progress', 'blocked')
    `,
      )
      .all(),
  };
}
```

---

## Data Access Layer

The data access layer lives in `packages/core/src/memory/`. Each entity type has its own module that wraps SQLite calls.

### Module Pattern

```typescript
// packages/core/src/memory/decisions.ts

import type { Database } from 'better-sqlite3';

export interface Decision {
  id: string;
  title: string;
  body: string;
  author: string | null;
  made_at: string;
  linked_entities: string[];
  created_at: string;
}

export function createDecision(
  db: Database,
  data: { title: string; body: string; author?: string; links?: string[] },
): Decision {
  const id = generateId('ADR');
  const now = new Date().toISOString();
  const links = data.links || [];

  db.prepare(
    `
    INSERT INTO decisions (id, title, body, author, made_at, linked_entities)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(id, data.title, data.body, data.author || null, now, JSON.stringify(links));

  return {
    id,
    title: data.title,
    body: data.body,
    author: data.author || null,
    made_at: now,
    linked_entities: links,
    created_at: now,
  };
}

export function listDecisions(
  db: Database,
  options?: { limit?: number; since?: string },
): Decision[] {
  let query = `SELECT * FROM decisions ORDER BY made_at DESC`;
  const params: any[] = [];

  if (options?.since) {
    query = `SELECT * FROM decisions WHERE made_at >= ? ORDER BY made_at DESC`;
    params.push(options.since);
  }

  if (options?.limit) {
    query += ` LIMIT ?`;
    params.push(options.limit);
  }

  return (db.prepare(query).all(...params) as any[]).map(parseDecision);
}

export function getDecision(db: Database, id: string): Decision | null {
  const row = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(id);
  return row ? parseDecision(row) : null;
}

function parseDecision(row: any): Decision {
  return {
    ...row,
    linked_entities: JSON.parse(row.linked_entities || '[]'),
  };
}
```

### Export from `packages/core/src/index.ts`

```typescript
// PM domain entities
export { createDecision, listDecisions, getDecision } from './memory/decisions';
export { createBlocker, resolveBlocker, getActiveBlockers } from './memory/blockers';
export { createNote, searchNotes, getNotesByTag } from './memory/notes';
export { createTask, updateTaskStatus, getBlockedTasks } from './memory/tasks';
export { captureScope, getLatestScope, getScopeHistory } from './memory/scope';

// Entity graph
export { getRelatedEntities, expandGraph } from './graph';

// Codebase intelligence
export { scan, scanIncremental, scanWatch, verifyScan } from './scanner';
export {
  getDependencies,
  getReverseDependencies,
  getImpactChain,
} from './scanner/dependency-mapper';
export { getEntryPoints, getArchitecture } from './scanner/architecture-detector';
export { searchCodebase, searchDocs } from './scanner/file-registry';
export { analyzeImpact } from './scanner/impact-analyzer';
export { getRelatedEntitiesByFile } from './graph';
```

---

## Testing with In-Memory DB

All storage tests use `better-sqlite3`'s `:memory:` database — no files, no cleanup, fast:

```typescript
// tests/decisions.test.ts
import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { createDecision, listDecisions } from '../src/memory/decisions';
import { migrate } from '../src/db';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  migrate(db);
});

it('creates a decision', () => {
  const decision = createDecision(db, {
    title: 'Drop OAuth',
    body: 'Use magic links instead',
    author: '@alice',
  });

  expect(decision.id).toMatch(/^ADR-\d{3}$/);
  expect(decision.title).toBe('Drop OAuth');
});

it('lists decisions ordered by date', () => {
  createDecision(db, { title: 'First', body: '...', made_at: '2026-01-01' });
  createDecision(db, { title: 'Second', body: '...', made_at: '2026-01-02' });

  const list = listDecisions(db);
  expect(list).toHaveLength(2);
  expect(list[0].title).toBe('Second');
});

it('auto-increments decision IDs', () => {
  const a = createDecision(db, { title: 'A', body: '...' });
  const b = createDecision(db, { title: 'B', body: '...' });
  expect(b.id).toBe(`ADR-${String(Number(a.id.split('-')[1]) + 1).padStart(3, '0')}`);
});
```

---

## Performance Considerations

### Indexes

All query patterns are covered by indexes:

| Index                   | Column(s)     | Covers                            |
| ----------------------- | ------------- | --------------------------------- |
| `idx_decisions_made_at` | `made_at`     | Recent decisions, standup queries |
| `idx_decisions_author`  | `author`      | Decisions by person               |
| `idx_blockers_status`   | `status`      | Active blocker queries            |
| `idx_blockers_age`      | `age_hours`   | Oldest-first blocker sorting      |
| `idx_notes_tags`        | `tags`        | Tag-filtered note queries         |
| `idx_tasks_status`      | `status`      | Blocked/in-progress task queries  |
| `idx_tasks_owner`       | `owner`       | Assigned task queries             |
| `idx_scope_sprint`      | `sprint_name` | Sprint scope history              |

### `linked_entities` Queries

The `linked_entities LIKE '%"ID"%'` pattern uses a `%` prefix which prevents B-tree index usage. This is acceptable because:

1. **Dataset is small** — a single project rarely has more than thousands of entities
2. **Only used for graph traversal** — not hot-path queries
3. **JSON can be indexed virtually** in a future optimization if needed

Future optimization: add a `links` junction table for proper indexing when datasets grow:

```sql
CREATE TABLE entity_links (
    source_type TEXT NOT NULL,  -- 'decision' | 'blocker' | 'note' | 'task'
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    PRIMARY KEY (source_type, source_id, target_id)
);
CREATE INDEX idx_links_target ON entity_links(target_id);
```

### WAL Mode

SQLite is configured with WAL (Write-Ahead Logging) for better concurrent read performance:

```typescript
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

### ID Generation

IDs are human-readable and auto-incrementing per entity type:

```typescript
function generateId(prefix: 'ADR' | 'BLK' | 'NOTE' | 'TASK'): string {
  const last = db
    .prepare(
      `
    SELECT id FROM ${tableFor(prefix)} ORDER BY id DESC LIMIT 1
  `,
    )
    .get() as { id: string } | undefined;

  const nextNum = last ? parseInt(last.id.split('-')[1], 10) + 1 : 1;

  return `${prefix}-${String(nextNum).padStart(3, '0')}`;
}
```

Produces: `ADR-001`, `BLK-042`, `NOTE-123`, `TASK-999`.
