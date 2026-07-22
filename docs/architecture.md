# PM Agent — Architecture

> The complete structure and design of the memory & rules layer for AI-native product management.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [Core: Memory Layer](#core-memory-layer)
- [Core: Codebase Intelligence](#core-codebase-intelligence)
- [Core: Rules Engine](#core-rules-engine)
- [CLI](#cli)
- [MCP Server](#mcp-server)
- [Integrations](#integrations)
- [Data Flow](#data-flow)
- [Configuration](#configuration)
- [Rule Scopes](#rule-scopes)

---

## Project Structure

```
pm-agent/
├── package.json                          # npm workspaces root (core, cli, mcp-server)
├── tsconfig.json                         # Base TypeScript config (strict mode)
├── .gitignore
│
├── rules.toml                            # Default rules (shipped with package)
├── config.toml                           # Default config (shipped with package)
│
├── packages/
│   ├── core/                             # Shared library — memory + rules + integrations
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                  # Public API barrel export
│   │   │   │
│   │   │   ├── config.ts                 # TOML config reader (~/.config/pm-agent/config.toml)
│   │   │   │
│   │   │   ├── db.ts                     # SQLite wrapper (better-sqlite3)
│   │   │   │   ├── open(path) → Database
│   │   │   │   ├── migrate(db) → void
│   │   │   │   └── close(db) → void
│   │   │   │
│   │   │   ├── scanner/                   # Codebase intelligence (file registry, deps, arch)
│   │   │   ├── index.ts               # scan(), scanIncremental() — entry point
│   │   │   ├── file-registry.ts       # Walk entire project tree, hash, classify files
│   │   │   ├── dependency-mapper.ts   # Parse imports (shells to ripgrep + madge)
│   │   │   ├── architecture-detector.ts  # Detect entry points, frameworks, patterns
│   │   │   ├── change-watcher.ts      # File watcher for incremental re-scans
│   │   │   └── impact-analyzer.ts     # "What breaks if I change this file?"
│   │   │
│   │   ├── memory/                   # Memory layer — temporal project graph stores
│   │   │   │   ├── decisions.ts          # Decision records (ADRs)
│   │   │   │   ├── blockers.ts           # Active/resolved blockers
│   │   │   │   ├── notes.ts              # Freeform notes with tag search
│   │   │   │   ├── tasks.ts              # Task state tracking
│   │   │   │   └── scope.ts              # Sprint scope snapshots
│   │   │   │
│   │   │   ├── graph.ts                  # Cross-entity graph traversal
│   │   │   │
│   │   │   ├── rules/                    # Rules engine
│   │   │   │   ├── engine.ts             # loadRules, enforce, applyAction
│   │   │   │   ├── expression.ts         # Lightweight trigger/condition expression parser
│   │   │   │   └── types.ts              # Rule, RuleResult, EnforcementResult types
│   │   │   │
│   │   │   └── integrations/             # External tool integrations
│   │   │       ├── github.ts             # GitHub PRs, issues via REST/GraphQL
│   │   │       ├── linear.ts             # Linear tickets via GraphQL API
│   │   │       └── types.ts              # Integration interface
│   │   │
│   │   └── tests/
│   │       ├── db.test.ts
│   │       ├── decisions.test.ts
│   │       ├── blockers.test.ts
│   │       ├── notes.test.ts
│   │       ├── scope.test.ts
│   │       ├── rules.test.ts
│   │       ├── expression.test.ts
│   │       ├── graph.test.ts
│   │       └── integrations.test.ts
│   │
│   ├── cli/                              # Terminal interface
│   │   ├── package.json                  # bin: { "pm": "./dist/index.js" }
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                  # Entry point — Commander.js program
│   │   │   ├── prompts.ts                # Inquirer.js interactive prompts
│   │   │   └── commands/
│   │   │       ├── init.ts               # pm init — scaffold config + DB + detect integrations
│   │   │       ├── blockers.ts           # pm blockers — list active blockers
│   │   │       ├── log.ts                # pm log — log a decision (enforces rules)
│   │   │       ├── note.ts               # pm note — quick capture with auto-linking
│   │   │       ├── scope.ts              # pm scope — snapshot or check sprint capacity
│   │   │       ├── standup.ts            # pm standup — generate standup summary
│   │   │       ├── rules.ts              # pm rules — list/add/remove/toggle rules
│   │   │       └── status.ts             # pm status — show project state overview
│   │   │
│   │   └── tests/
│   │       └── commands.test.ts
│   │
│   ├── mcp-server/                       # MCP server (stdio transport)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                  # MCP server setup + tool registration
│   │   │   └── tools/
│   │   │       ├── get-context.ts        # pm_get_context
│   │   │       ├── get-blockers.ts       # pm_get_blockers
│   │   │       ├── get-decisions.ts      # pm_get_decisions
│   │   │       ├── get-notes.ts          # pm_get_notes
│   │   │       ├── get-scope.ts          # pm_get_scope
│   │   │       ├── get-standup.ts        # pm_get_standup
│   │   │       ├── prep-meeting.ts       # pm_prep_meeting
│   │   │       ├── log-decision.ts       # pm_log_decision
│   │   │       ├── log-note.ts           # pm_log_note
│   │   │       ├── check-scope.ts        # pm_check_scope
│   │   │       ├── add-rule.ts           # pm_add_rule
│   │   │       └── enforce-rules.ts      # pm_enforce_rules
│   │   │
│   │   └── tests/
│   │       └── tools.test.ts
│   │
│   ├── desktop/                          # [Roadmap] Electron/Tauri desktop app
│   │   └── src/
│   │       ├── main/
│   │       ├── renderer/
│   │       └── preload.js
│   │
│   └── vscode-ext/                       # [Roadmap] VS Code extension
│       └── src/
│           ├── extension.ts
│           └── sidebarProvider.ts
│
├── README.md                             # Product documentation
└── architecture.md                       # This file — architecture reference
```

---

## Architecture Overview

PM Agent follows a **layered architecture** with a shared core, two user-facing interfaces (CLI + MCP), and optional integrations:

```
┌────────────────────────────────────────────────────────────┐
│                    YOUR AI (Claude, GPT, Local LLM)        │
│                    ┌─────────────────┐                      │
│                    │  Thinks, plans,  │                      │
│                    │  writes, decides │                      │
│                    └────────┬────────┘                      │
│                             │ MCP (stdio/sse)               │
│                             ▼                               │
│              ┌──────────────────────────────┐               │
│              │      PM Agent MCP Server      │               │
│              │  ┌─────────────────────────┐  │               │
│              │  │  Memory Layer (SQLite)  │  │               │
│              │  │  • decisions            │  │               │
│              │  │  • blockers             │  │               │
│              │  │  • notes                │  │               │
│              │  │  • tasks                │  │               │
│              │  │  • scope snapshots      │  │               │
│              │  │  • entity graph         │  │               │
│              │  └─────────────────────────┘  │               │
│              │  ┌─────────────────────────┐  │               │
│              │  │  Codebase Intelligence  │  │               │
│              │  │  • file_registry        │  │               │
│              │  │  • dependency_edges     │  │               │
│              │  │  • architecture_map     │  │               │
│              │  │  • doc_index (FTS5)     │  │               │
│              │  │  • impact analysis      │  │               │
│              │  │  orchestrates: rg, tree │  │               │
│              │  │  madge, glob, fs.watch  │  │               │
│              │  └─────────────────────────┘  │               │
│              │  ┌─────────────────────────┐  │               │
│              │  │  Rules Engine (TOML)    │  │               │
│              │  │  • trigger → condition  │  │               │
│              │  │    → action             │  │               │
│              │  │  • scope: pm / code     │  │               │
│              │  │  • severity: hard/soft  │  │               │
│              │  │    /info                │  │               │
│              │  └─────────────────────────┘  │               │
│              │  ┌─────────────────────────┐  │               │
│              │  │  Integrations (APIs)    │  │               │
│              │  │  • GitHub               │  │               │
│              │  │  • Linear               │  │               │
│              │  └─────────────────────────┘  │               │
│              └──────────────────────────────┘               │
│                             │                                │
│              ┌──────────────┴──────────────┐                │
│              │      User-Facing Interfaces   │               │
│  ┌───────────┼───────────┬───────────┬──────┘               │
│  │  Shell    │  IDE      │  Desktop  │  Web                 │
│  │  (CLI)    │  (ext)    │  (opt)    │  (opt)               │
│  └───────────┴───────────┴───────────┴──────                │
└────────────────────────────────────────────────────────────┘
```

### Dependency Graph

```
packages/core     ← packages/cli        (core is a dependency)
packages/core     ← packages/mcp-server (core is a dependency)
packages/core     ← packages/desktop    (roadmap)
packages/core     ← packages/vscode-ext (roadmap)
```

No circular dependencies. Each package builds independently and can be versioned separately.

---

## Core: Memory Layer

**Location:** `packages/core/src/memory/`

### Database

**Engine:** SQLite via `better-sqlite3`

**Location:** `~/.local/share/pm-agent/<project-name>.db`

Created on first `pm init`. Each project gets its own database file.

### Schema

```sql
-- Decision records (ADRs)
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,          -- ADR-001, ADR-002, ...
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT,
  made_at TEXT NOT NULL,         -- ISO 8601
  linked_entities TEXT,          -- JSON array: ["PR-442", "AUTH-91"]
  created_at TEXT DEFAULT (datetime('now'))
);

-- Active and resolved blockers
CREATE TABLE blockers (
  id TEXT PRIMARY KEY,          -- BLK-001, BLK-002, ...
  title TEXT NOT NULL,
  description TEXT,
  age_hours INTEGER,
  blocked_by TEXT,               -- Person or external dependency
  status TEXT DEFAULT 'open',    -- open | resolved
  linked_entities TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Freeform notes with auto-tagging
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  tags TEXT,                     -- JSON array: ["stakeholder", "sprint-14"]
  linked_entities TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Task state tracking
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'todo',    -- todo | in_progress | blocked | done
  owner TEXT,
  linked_entities TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Sprint scope snapshots
CREATE TABLE scope_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_name TEXT,
  committed_days REAL,
  remaining_days REAL,
  risk TEXT,                     -- LOW | MEDIUM | HIGH
  captured_at TEXT DEFAULT (datetime('now'))
);
```

### Entity Graph

The `graph.ts` module enables cross-entity traversal. Any entity can link to any other via the `linked_entities` JSON column, which stores an array of entity IDs from across tables.

```typescript
// Example: "What's related to AUTH-91?"
getRelatedEntities('AUTH-91');
// → {
//     decisions: [{ id: "ADR-004", title: "Drop OAuth, use magic links" }],
//     blockers:  [{ id: "BLK-003", title: "PR #442 unreviewed" }],
//     notes:     [{ id: "NOTE-012", content: "Stakeholder call: delay OK" }],
//     tasks:     [{ id: "TASK-007", title: "Implement magic link flow" }]
//   }
```

---

## Core: Codebase Intelligence

**Location:** `packages/core/src/scanner/`

### Purpose

PM Agent can't just remember what you tell it — it must also **discover** the codebase. When you join a project mid-way, `pm scan` walks the entire project tree, maps every file, parses dependencies, detects architecture patterns, and stores it all in the memory graph. Subsequent runs are incremental (only changed files).

> PM Agent is not a code scanner — it is an **orchestrator** that shells out to specialized tools (ripgrep, tree, madge) and pipes their output into the memory graph, then layers PM context on top.

### Cold-Start Problem: How It Works

```
User: pm scan --full
        │
        ├─ 1. Walk project tree (recursive, respects .gitignore)
        │   └─ Count: 1,234 files found
        │
        ├─ 2. Hash every file (SHA-256)
        │   └─ Store in file_registry table
        │
        ├─ 3. Classify every file
        │   ├─ source: .ts, .js, .py, .go, .rs, .java, ...
        │   ├─ test: .test.ts, _test.go, spec.js, ...
        │   ├─ doc: .md, .mdx, .txt
        │   ├─ config: .json, .toml, .yaml, .env
        │   └─ asset: .css, .svg, .png, ...
        │
        ├─ 4. Build dependency graph
        │   └─ Shells to ripgrep (import matching) + madge (circular detection)
        │   └─ Store edges in dependency_edges table
        │
        ├─ 5. Detect architecture
        │   ├─ Entry points: package.json "main", main.ts, App.tsx
        │   ├─ Framework: Express routes, Next.js pages, React components
        │   ├─ Patterns: Middleware chain, controller/service layer, monorepo layout
        │   └─ Store in architecture_map table
        │
        ├─ 6. Index documentation content
        │   └─ Parse README.md, CONTRIBUTING.md, docs/*.md
        │   └─ Store full text in doc_index table (for semantic search)
        │
        └─ 7. Link to PM context
            └─ "src/auth/service.ts depends on src/user/model.ts"
            └─ "ADR-004 says to refactor auth by next sprint"
            └─ Impact analysis: changing this file touches 14 others
```

### External Tools Orchestrated

| Tool                           | Purpose                                   | Invoked via           |
| ------------------------------ | ----------------------------------------- | --------------------- |
| `ripgrep` (rg)                 | Fast file content search, import matching | `child_process.spawn` |
| `tree`                         | Directory structure dump                  | `child_process.spawn` |
| `madge` / `dependency-cruiser` | Dependency graph, circular deps           | `npx madge`           |
| Node.js `fs.watch`             | File change detection (incremental)       | Native Node API       |
| `glob` (glob)                  | Pattern-based file matching               | npm package           |

None of these are hard dependencies — if a tool is missing, that feature degrades gracefully with a warning.

### Modules

| Module                | File                               | What it does                                                       |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Entry point           | `scanner/index.ts`                 | `scan()` and `scanIncremental()` — orchestrates the full pipeline  |
| File registry         | `scanner/file-registry.ts`         | Recursive directory walk, file hash (SHA-256), type classification |
| Dependency mapper     | `scanner/dependency-mapper.ts`     | Shells to ripgrep + madge, normalizes paths, detects cycles        |
| Architecture detector | `scanner/architecture-detector.ts` | Recognizes frameworks, entry points, project patterns              |
| Change watcher        | `scanner/change-watcher.ts`        | `fs.watch` on project root, re-scans changed files                 |
| Impact analyzer       | `scanner/impact-analyzer.ts`       | Reverse-dependency traversal, "who imports this?"                  |

### New Database Schema (added to existing DB)

```sql
-- Every file in the project — nothing skipped
CREATE TABLE file_registry (
    path TEXT PRIMARY KEY,                    -- Relative to project root (e.g. "src/auth/service.ts")
    hash TEXT NOT NULL,                        -- SHA-256 of file content
    size INTEGER NOT NULL,
    type TEXT NOT NULL                         -- source | test | doc | config | asset | unknown
        CHECK(type IN ('source', 'test', 'doc', 'config', 'asset', 'unknown')),
    last_indexed_at TEXT NOT NULL,             -- ISO 8601
    created_at TEXT DEFAULT (datetime('now'))
);

-- Cross-file dependency edges (directional)
CREATE TABLE dependency_edges (
    source_path TEXT NOT NULL,                 -- "src/auth/service.ts" (importer)
    target_path TEXT NOT NULL,                 -- "src/user/model.ts"   (imported)
    import_type TEXT DEFAULT 'static',         -- static | dynamic | type_only
    PRIMARY KEY (source_path, target_path)
);

CREATE INDEX idx_deps_target ON dependency_edges(target_path);

-- Architecture markers: roles, frameworks, entry points
CREATE TABLE architecture_map (
    path TEXT NOT NULL,
    role TEXT NOT NULL,                        -- entrypoint | middleware | model | route | controller | service | util | component | hook | test | config
    framework TEXT,                            -- express | next | react | vue | nest | vitest | jest
    metadata TEXT,                             -- JSON blob: { "page": "/login", "method": "POST", ... }
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_arch_role ON architecture_map(role);

-- Documentation index for semantic search
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

### Scanning Commands

```bash
# Full cold-start scan (first time on an existing project)
pm scan --full

# Incremental scan (only changed files since last scan)
pm scan

# Watch mode (continuous — re-scans on file save)
pm scan --watch

# Get dependency info for a file
pm depends src/auth/service.ts
# → src/auth/service.ts is imported by:
#     - src/routes/login.ts (static)
#     - src/middleware/auth.ts (static)
#   It imports:
#     - src/user/model.ts (static)
#     - src/db/client.ts (static)

# Impact analysis — what breaks if I change this file?
pm impact src/user/model.ts
# → Changing src/user/model.ts may affect:
#     - src/auth/service.ts (login flow) [DIRECT]
#     - src/profile/view.ts (profile page) [DIRECT]
#     - tests/user/model.test.ts (unit tests) [DIRECT]
#     - src/handlers/user.ts (API handler) [TRANSITIVE via service.ts]
#   Linked PM context:
#     - ADR-004: "Refactor user model next sprint" — due sprint 15
#     - BLK-003: PR #442 blocked on auth service
#     - TASK-007: blocked on BLK-003

# Search codebase + docs
pm search "deleted_at"
# → src/models/user.ts:42  (source) — "deleted_at: DateTime"
# → src/migrations/003_add_deleted_at.sql  (source) — "ALTER TABLE users ADD COLUMN deleted_at"
# → README.md (doc) — "Soft deletes use deleted_at timestamp"

# Show architecture overview
pm arch
# → Framework: Express.js
# → Entry points: src/main.ts, src/api/index.ts
# → Layers detected: controllers → services → models → db
# → 1,234 files indexed, 0 unstored
# → 2 circular dependencies detected (src/utils/helpers.ts ↔ src/utils/format.ts)

# Verify complete indexing (no files missed)
pm scan --verify
# → Checking 1,234 indexed files against disk...
# → 1,234 match, 12 new, 3 deleted, 47 modified
# → Run `pm scan` to update
```

### How It Never Misses Files

The scanner uses a **tracked-file approach**:

1. **First scan**: Recursive walk from project root using `glob` with `**/*` pattern, filtering out `.gitignore` entries. Every file gets a row in `file_registry`.
2. **Verify mode**: Count files on disk vs rows in `file_registry`. Any discrepancy is reported.
3. **Incremental mode**: Compare file modification times or hashes. Only re-process changed files.
4. **Change watcher**: `fs.watch` on the project root. On any `change` or `rename` event, the affected file is re-scanned within seconds.
5. **No silent skipping**: If a directory can't be read (permissions), it's logged as a warning, not silently ignored.

```typescript
// file-registry.ts — the core loop
async function walkProject(root: string): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  const gitignore = await parseGitignore(root);

  for await (const entry of globStream('**/*', {
    cwd: root,
    nodir: true,
    dot: true, // include .env, .eslintrc, etc.
    ignore: gitignore.patterns, // respect .gitignore
    absolute: false,
  })) {
    const stat = await fs.stat(join(root, entry));
    const content = await fs.readFile(join(root, entry));
    const hash = createHash('sha256').update(content).digest('hex');

    files.push({
      path: entry.replace(/\\/g, '/'),
      hash,
      size: stat.size,
      type: classifyFile(entry),
      last_indexed_at: new Date().toISOString(),
    });
  }

  return files;
}
```

### Impact Analysis

The impact analyzer uses **reverse dependency traversal** — it finds everything that imports a given file, then everything that imports those files (transitive), up to a configurable depth:

```typescript
// impact-analyzer.ts
function analyzeImpact(db: Database, filePath: string, depth = 2): ImpactReport {
  const directDependents = db
    .prepare(
      `
    SELECT source_path FROM dependency_edges WHERE target_path = ?
  `,
    )
    .all(filePath);

  const transitive =
    depth > 1
      ? directDependents.flatMap((d) => analyzeImpact(db, d.source_path, depth - 1).allDependents)
      : [];

  const linkedContext = getRelatedEntitiesByFile(db, filePath);

  return {
    target: filePath,
    directDependents: directDependents.map((d) => d.source_path),
    transitiveDependents: [...new Set(transitive)],
    totalAffected: directDependents.length + new Set(transitive).size,
    linkedDecisions: linkedContext.decisions,
    linkedBlockers: linkedContext.blockers,
    linkedTasks: linkedContext.tasks,
  };
}
```

### CLI Commands (Codebase Intelligence)

```bash
pm scan [--full] [--watch] [--verify]   # Scan/index the codebase
pm depends <path>                       # Show dependency graph for a file
pm impact <path>                        # Impact analysis (reverse deps + PM context)
pm search <query>                       # Full-text search across code + docs
pm arch                                 # Show architecture overview
pm files [--type source] [--unindexed]  # List files (filtered, unindexed check)
```

### MCP Tools (Codebase Intelligence)

| Tool                      | What the AI can ask                         |
| ------------------------- | ------------------------------------------- |
| `pm_scan_codebase`        | "Scan this project and learn its structure" |
| `pm_get_dependency_graph` | "What does the auth module depend on?"      |
| `pm_analyze_impact`       | "What breaks if I change this file?"        |
| `pm_search_codebase`      | "Find all files referencing 'deleted_at'"   |
| `pm_get_architecture`     | "What's the project architecture?"          |
| `pm_get_file_context`     | "What PM context is linked to this file?"   |

---

## Core: Rules Engine

**Location:** `packages/core/src/rules/`

### Design Principle

One file, one engine, scoped rules. PM and coding rules share the same TOML file (`~/.config/pm-agent/rules.toml`) and the same evaluator. The `scope` field determines which context a rule checks in.

### Rule Structure

```toml
[[rule]]
scope = "pm" | "code" | "all"      # Which context this applies to
name = "rule-name"                  # Unique identifier
trigger = "event.expression"        # What event or state triggers evaluation
condition = "boolean_expression"    # (optional) Additional condition to check
action = "action_type: 'message'"   # What to do when triggered
severity = "hard" | "soft" | "info" # How strictly to enforce
```

### Expression Language

A built-in lightweight expression parser evaluates triggers and conditions:

| Feature                | Syntax                      | Example                      |
| ---------------------- | --------------------------- | ---------------------------- |
| Property access        | `.`                         | `pr.age`, `ticket.status`    |
| Comparison             | `==` `!=` `>` `<` `>=` `<=` | `pr.age > 48h`               |
| String containment     | `.contains()`               | `file.contains('debugger')`  |
| Array length           | `.count`                    | `blockers.count > 0`         |
| Boolean logic          | `&&` `\|\|`                 | `x > 0 && y == 'active'`     |
| Template interpolation | `{expr}`                    | `'Cannot close {ticket.id}'` |

### Rule Evaluation Flow

```
Event occurs (CLI command, file save, MCP call)
        │
        ▼
Load rules from ~/.config/pm-agent/rules.toml
        │
        ▼
Filter rules by scope (if context = "code", only scope="code" rules)
        │
        ▼
For each matching rule:
  ├─ Evaluate trigger against current context
  │   └─ If trigger matches → continue
  │   └─ If trigger doesn't match → skip
  ├─ Evaluate condition (if present)
  │   └─ If condition true → continue
  │   └─ If condition false → skip
  └─ Execute action:
      ├─ hard   → Block the operation, return error
      ├─ soft   → Warn user, require explicit confirmation
      └─ info   → Surface context message, don't block
```

### Action Types

| Action   | Prefix      | Behavior                                                   |
| -------- | ----------- | ---------------------------------------------------------- |
| Block    | `block:`    | Prevents the operation. Returns a rejection message        |
| Confirm  | `confirm:`  | Surfaces a warning, asks user to confirm before proceeding |
| Notify   | `notify:`   | Shows an informational message, doesn't block              |
| Suggest  | `suggest:`  | Suggests an action without blocking                        |
| Generate | `generate:` | Auto-generates content (standup prep, meeting brief)       |

---

## CLI

**Location:** `packages/cli/src/`

**Framework:** Commander.js

### Commands

```bash
# PM commands
pm init                     # First-time setup: config, DB, integration detection
pm log "decision text"      # Log a decision (runs through rules engine)
pm note "quick thought"     # Quick capture with auto-linking
pm blockers                 # List all active blockers
pm scope "proposed change"  # Sprint scope check (enforces scope rules)
pm standup                  # Generate standup summary
pm status                   # Show project state overview

# Codebase intelligence commands
pm scan [--full] [--watch]  # Scan/index the codebase (cold-start or incremental)
pm scan --verify            # Verify no files were missed
pm depends <path>           # Show dependency graph for a file
pm impact <path>            # Impact analysis (reverse deps + PM context)
pm search <query>           # Full-text search across code + docs
pm arch                     # Show architecture overview
pm files [--type source]    # List indexed files (filtered, unindexed check)

# Rules management
pm rules                    # Manage rules (list, add, remove, toggle)
pm rules list               #   List all rules
pm rules add ...            #   Add a new rule
pm rules remove <name>      #   Delete a rule
pm rules enable <name>      #   Enable a disabled rule
pm rules disable <name>     #   Disable a rule without deleting it
```

### Bin Entry

```json
{ "bin": { "pm": "./dist/index.js" } }
```

### UX Patterns

- **Colors:** `chalk` for output styling (green for success, yellow for warnings, red for blocks)
- **Spinners:** `ora` for long operations (init, integration detection, API calls)
- **Prompts:** `inquirer` for interactive confirmations and selections
- **Tables:** Formatted table output for lists (blockers, decisions, rules)

---

## MCP Server

**Location:** `packages/mcp-server/src/`

**Framework:** `@modelcontextprotocol/sdk`

**Transport:** stdio (SSE planned for roadmap)

### Exposed Tools

| Tool                      | Input                | Output                        | Enforcement |
| ------------------------- | -------------------- | ----------------------------- | ----------- |
| `pm_get_context`          | —                    | Aggregated project state      | Passive     |
| `pm_get_blockers`         | —                    | List of active blockers       | Passive     |
| `pm_get_decisions`        | —                    | List of decision records      | Passive     |
| `pm_get_scope`            | —                    | Latest scope snapshot         | Passive     |
| `pm_get_notes`            | filter?              | Notes matching filter         | Passive     |
| `pm_get_standup`          | —                    | Standup summary               | Passive     |
| `pm_prep_meeting`         | meetingTitle         | Meeting brief with context    | Passive     |
| `pm_log_decision`         | title, body          | Creates decision              | Active      |
| `pm_log_note`             | content, tags        | Creates note, auto-links      | Passive     |
| `pm_check_scope`          | change, impact       | Risk assessment               | Active      |
| `pm_add_rule`             | name, scope, trigger | Creates a rule                | Passive     |
| `pm_enforce_rules`        | context              | Runs all matching rules       | Active      |
| `pm_scan_codebase`        | full? incremental?   | Index all files, deps, arch   | Passive     |
| `pm_get_dependency_graph` | path                 | Dependency tree for a file    | Passive     |
| `pm_analyze_impact`       | path, depth          | Reverse deps + PM context     | Passive     |
| `pm_search_codebase`      | query, scope         | Full-text search results      | Passive     |
| `pm_get_architecture`     | —                    | Project architecture overview | Passive     |
| `pm_get_file_context`     | path                 | PM context linked to file     | Passive     |

### Tool Handler Pattern

```typescript
server.tool(
  'pm_get_blockers',
  'Get current blockers',
  {/* optional inputSchema */},
  async (args) => {
    const config = loadConfig();
    const db = openDb(config.memory.path);
    const rules = loadRules(config.rules.path, 'pm');
    const blockers = getActiveBlockers(db);
    const enforcement = enforce(rules, { blockers });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ blockers, enforcement }),
        },
      ],
    };
  },
);
```

---

## Integrations

**Location:** `packages/core/src/integrations/`

### Integration Interface

```typescript
interface Integration {
  name: string;
  detect(): Promise<boolean>;
  connect(config: any): Promise<void>;
  fetchBlockers(): Promise<Blocker[]>;
  fetchDecisions(): Promise<Decision[]>;
  fetchTasks(): Promise<Task[]>;
}
```

### GitHub

- **API:** REST (`GET /repos/{owner}/{repo}/pulls`, `GET /repos/{owner}/{repo}/issues`)
- **Auth:** `GITHUB_TOKEN` env var or OS keychain
- **Detection:** Reads `git remote -v` during `pm init`
- **Data:** Pulls open PRs (age, review count, author), open issues, assigns status

### Linear

- **API:** Linear GraphQL (`issues()`, `teams()`, `projects()` queries)
- **Auth:** `LINEAR_API_KEY` env var or OS keychain
- **Detection:** Prompts during `pm init` if `linear` CLI is detected or workspace configured
- **Data:** Pulls tickets (status, assignee, team, sprint), maps to tasks/blockers

---

## Data Flow

### Initialization (`pm init`)

```
pm init
  │
  ├─ Create ~/.config/pm-agent/ (if not exists)
  ├─ Write default config.toml
  ├─ Write default rules.toml
  ├─ Detect project root (from cwd)
  ├─ Detect git remote (GitHub integration)
  ├─ Detect Linear workspace (if configured)
  ├─ Create SQLite DB at ~/.local/share/pm-agent/
  ├─ Run schema migrations
  ├─ Initial data fetch (PRs, tickets, issues)
  └─ Prompt: "Scan existing codebase? (recommended) [Y/n]"
      └─ If yes → pm scan --full (walk, hash, classify, dep graph, arch detect)
```

### Decision Logging (`pm log` or `pm_log_decision`)

```
User/AI: "Log decision to drop OAuth"
  │
  ├─ Rules engine evaluates decision-before-close rule
  │   └─ trigger: "ticket.status_change == 'closed'"
  │   └─ condition: "ticket.decisions.count == 0"
  │   └─ Not triggered (not closing a ticket) → pass through
  │
  ├─ Store decision in SQLite
  │   └─ INSERT INTO decisions (id, title, body, ...)
  │
  ├─ Auto-link to related entities
  │   └─ Match PRs, tickets, notes by keyword in title/body
  │
  └─ Return confirmation with ADR ID
```

### Standup Generation (`pm standup` or `pm_get_standup`)

```
pm standup
  │
  ├─ Query recent decisions (last 24h)
  ├─ Query resolved blockers (last 24h)
  ├─ Query active blockers (current)
  ├─ Query recent notes (last 24h)
  ├─ Query scope snapshot (latest)
  │
  ├─ Rules engine evaluates daily-blocker-check
  │   └─ If blockers.count > 0 → notifies
  │
  └─ Generate summary:
      "Yesterday: reviewed 2 PRs, logged ADR-004.
       Today: unblock PR #442, draft AUTH-92 spec.
       Blockers: PR #442 needs review (2d)."
```

---

## Configuration

### Config File: `~/.config/pm-agent/config.toml`

```toml
[project]
name = "auth-service"
root = "/Users/you/projects/auth-service"

[integrations.github]
repo = "acme-corp/auth-service"
token = "${GITHUB_TOKEN}"

[integrations.linear]
workspace = "ACME"
api_key = "${LINEAR_API_KEY}"

[ai]
provider = "anthropic"
model = "claude-sonnet-4-20250514"

[rules]
config_path = "~/.config/pm-agent/rules.toml"
enabled = true

[memory]
storage = "sqlite"
path = "~/.local/share/pm-agent/auth-service.db"
retention_days = 365
```

### Data Locations

| Data             | Path                                   |
| ---------------- | -------------------------------------- |
| User config      | `~/.config/pm-agent/config.toml`       |
| User rules       | `~/.config/pm-agent/rules.toml`        |
| Project database | `~/.local/share/pm-agent/<project>.db` |

---

## Rule Scopes

The `scope` field on each rule determines which context evaluates it:

| Scope  | Evaluated By                           | Example Rule                              |
| ------ | -------------------------------------- | ----------------------------------------- |
| `pm`   | CLI commands, MCP tools                | "Must log decision before closing ticket" |
| `code` | IDE hooks (VS Code ext, file watchers) | "No `any` types in shared packages"       |
| `all`  | Both                                   | "Surface blockers before standup"         |

The rules engine accepts an optional scope filter. A CLI command calls `loadRules(path, 'pm')`, while an IDE hook calls `loadRules(path, 'code')`. Rules with `scope: 'all'` are always returned.

---

## Roadmap Architecture

The following components are planned but not yet built:

| Component          | Directory                                  | Status  |
| ------------------ | ------------------------------------------ | ------- |
| Desktop app        | `packages/desktop/`                        | Planned |
| VS Code extension  | `packages/vscode-ext/`                     | Planned |
| Slack integration  | `packages/core/src/integrations/slack.ts`  | Planned |
| Notion integration | `packages/core/src/integrations/notion.ts` | Planned |
| Jira integration   | `packages/core/src/integrations/jira.ts`   | Planned |
| Team sync          | `packages/core/src/sync/`                  | Planned |
| Web UI             | `packages/web/`                            | Planned |

---

## Tech Stack Summary

| Layer         | Technology                                |
| ------------- | ----------------------------------------- |
| Language      | TypeScript (strict mode)                  |
| Runtime       | Node.js                                   |
| Database      | SQLite (`better-sqlite3` + FTS5)          |
| Rules format  | TOML                                      |
| MCP SDK       | `@modelcontextprotocol/sdk`               |
| CLI framework | Commander.js                              |
| CLI UX        | Chalk, Ora, Inquirer                      |
| Code scanning | ripgrep, tree, madge, glob (orchestrated) |
| File watching | Node.js `fs.watch`                        |
| Build         | tsup (CJS + ESM + dts)                    |
| Test          | Vitest                                    |
| Package mgmt  | npm workspaces                            |
