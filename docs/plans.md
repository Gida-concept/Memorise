# PM Agent — Architecture & Reference

> All 9 build phases are complete. This file retains architectural decisions and structural reference.
> Active fix work tracked in [FIX_PLAN.md](FIX_PLAN.md).

---

## Build Order (completed)

```
Phase 1: Monorepo Scaffolding         (no deps)
        ↓
Phase 2: Core — SQLite Memory Layer   (needs Phase 1)
        ↓
Phase 3: Core — Rules Engine          (needs Phase 2)
        ↓
Phase 4: CLI                          (needs Phase 2+3)
        ↓
Phase 5: MCP Server                   (needs Phase 2+3)
        ↓
Phase 6: Core — Codebase Intelligence (needs Phase 2, partially parallel with 4+5)
        ↓
Phase 7: Integrations                 (needs Phase 2+4)
        ↓
Phase 8: Testing                      (needs all phases)
        ↓
Phase 9: Packaging & Publishing       (needs all phases)

Parallelizable:
  - Phases 4 and 5 can be built in parallel (both depend on 2+3)
  - Phase 6 scanner can start after Phase 2 (file_registry migration)
    and parallel with Phases 4-5
  - Phase 7 integrations can start after Phase 2 (memory stores) and
    parallel with Phases 4-5
  - Phase 8 is continuous — write tests alongside implementation
  - Phase 9 is final — packaging after all code is stable
```

---

## Key Design Decisions

1. **Monorepo with npm workspaces** — Shared core package, two consumer packages (CLI, MCP). Prevents code duplication, enables independent versioning.

2. **better-sqlite3 (synchronous)** — Synchronous API simplifies the rules engine and CLI flow. Avoids callback/promise complexity in a CLI tool. WAL mode enables concurrent reads.

3. **TOML for config and rules** — Human-readable, comment-friendly, version-controllable. Same format for both config and rules reduces cognitive overhead.

4. **Scope field on rules** — Single engine, single file, one source of truth. No duplicated parsing logic. `scope` field routes rules to the correct context (PM vs Code).

5. **Hand-written expression parser** — No `eval()`, no `new Function()`, no security risks. Purpose-built for the narrow domain of checking project state.

6. **MCP stdio transport** — No network ports, no HTTP server. Server inherits parent process permissions. Simplifies client configuration (no ports to manage).

7. **Per-project SQLite databases** — Data isolation, portable `.db` files, no centralized server needed. Simple backup by copying files.

8. **External tools orchestrated, not bundled** — ripgrep, madge, tree are invoked via `spawn`. If missing, features degrade gracefully. Keeps PM Agent's dependency surface small.

9. **Delete is resolution** — Blockers are resolved, not deleted. Notes can be archived but not deleted. Decisions are never pruned. History is preserved.

---

## Package Layout

```
pm-agent/
├── packages/
│   ├── core/               # @pm-agent/core — shared library
│   │   ├── src/
│   │   │   ├── db.ts               # SQLite setup, migrations, generateId
│   │   │   ├── config.ts           # TOML config loading
│   │   │   ├── defaults.ts         # Shipped default config & rules TOML
│   │   │   ├── graph.ts            # Entity graph traversal, standup data
│   │   │   ├── memory/             # CRUD for decisions/blockers/notes/tasks/scope
│   │   │   ├── rules/              # Expression parser, engine, types
│   │   │   ├── scanner/            # File walk, dependency mapping, architecture, impact analyzer
│   │   │   └── integrations/       # GitHub, Linear integrations
│   │   └── tests/
│   ├── cli/                # @pm-agent/cli — Commander-based CLI
│   │   ├── src/
│   │   │   ├── index.ts            # Entry, command definitions
│   │   │   ├── commands/           # init, log, scope, rules, blockers, note, standup, status, scan, depends, impact, search, arch, files
│   │   │   ├── db-utils.ts         # getCommandContext, closeCommandContext
│   │   │   ├── formatters.ts       # Colors, formatCard, formatTable
│   │   │   ├── prompts.ts          # confirmPrompt (Inquirer)
│   │   │   └── exit-codes.ts       # ExitCode enum
│   │   └── tests/                  # (to be added — see FIX_PLAN.md Gap 9)
│   └── mcp-server/         # @pm-agent/mcp-server — MCP stdio server
│       ├── src/
│       │   ├── index.ts            # Server setup, 18 tool definitions + handlers
│       │   └── tools/              # Individual tool handlers
│       └── tests/                  # (to be added — see FIX_PLAN.md Gap 9)
├── scripts/
│   ├── smoke-test.sh               # End-to-end verification
│   └── verify-package.sh           # Pre-publish verification
├── FIX_PLAN.md                     # Active fix plan for 10 identified gaps
└── INTEGRATION_GUIDE.md            # 18 MCP platform integration reference
```

---

## Database Schema

### Core tables (migration 001_initial_schema)

```sql
-- Decisions (Architecture Decision Records)
decisions (id TEXT PK, title TEXT, body TEXT, author TEXT, made_at TEXT,
           linked_entities TEXT DEFAULT '[]', created_at TEXT)

-- Blockers
blockers (id TEXT PK, title TEXT, description TEXT, age_hours INTEGER DEFAULT 0,
          blocked_by TEXT, status TEXT CHECK(open|resolved),
          linked_entities TEXT DEFAULT '[]', created_at TEXT)

-- Notes
notes (id TEXT PK, content TEXT, tags TEXT DEFAULT '[]',
       linked_entities TEXT DEFAULT '[]', created_at TEXT)

-- Tasks
tasks (id TEXT PK, title TEXT, status TEXT CHECK(todo|in_progress|blocked|done),
       owner TEXT, linked_entities TEXT DEFAULT '[]', created_at TEXT)

-- Scope snapshots
scope_snapshots (id INTEGER PK AUTOINCREMENT, sprint_name TEXT,
                 committed_days REAL, remaining_days REAL,
                 risk TEXT CHECK(LOW|MEDIUM|HIGH), captured_at TEXT)
```

### Intelligence tables (migration 002_codebase_intelligence)

```sql
file_registry (path TEXT PK, hash TEXT, size INTEGER, type TEXT CHECK(...),
               last_indexed_at TEXT, created_at TEXT)

dependency_edges (source_path TEXT, target_path TEXT, import_type TEXT CHECK(...),
                  PK(source_path, target_path))

architecture_map (path TEXT, role TEXT CHECK(...), framework TEXT,
                  metadata TEXT DEFAULT '{}', created_at TEXT)

doc_index (path TEXT PK, title TEXT, content TEXT, tokens TEXT)
doc_fts    -- FTS5 virtual table over doc_index
```

---

## ID Format

All entity IDs use a prefix + sequential 3-digit zero-padded number:
- `ADR-001`, `ADR-002`, ... — Decisions
- `BLK-001`, `BLK-002`, ... — Blockers
- `NOTE-001`, `NOTE-002`, ... — Notes
- `TASK-001`, `TASK-002`, ... — Tasks

Generated by `generateId(db, prefix)` in `packages/core/src/db.ts`.

---

## Test Structure

| File | Tests |
|------|-------|
| `packages/core/tests/db.test.ts` | 6 (migration, generateId, closeDb, double-open, memory mode, config) |
| `packages/core/tests/decisions.test.ts` | 10 |
| `packages/core/tests/blockers.test.ts` | 8 |
| `packages/core/tests/notes.test.ts` | 8 |
| `packages/core/tests/scope.test.ts` | 6 |
| `packages/core/tests/rules.test.ts` | 10 |
| `packages/core/tests/expression.test.ts` | 15 |
| `packages/core/tests/graph.test.ts` | 6 |
| `packages/core/tests/scanner.test.ts` | 10 |
| `packages/core/tests/file-registry.test.ts` | 6 |
| `packages/core/tests/config.test.ts` | 6 |
| `packages/core/tests/integrations.test.ts` | 8 |
| `packages/core/tests/impact-analyzer.test.ts` | 6 |
| **Total core** | **105** |

All use in-memory SQLite (`openDb({ path: ':memory:', memory: true })`).  
Integration tests use `nock` for HTTP mocking.

### Fixture structure

```
packages/core/tests/fixtures/
├── configs/       # valid.toml, minimal.toml, with-env.toml, malformed.toml
├── rules/         # valid-rules.toml, minimal-rule.toml, malformed-rule.toml
├── projects/      # minimal/ (1 file), small/ (10 files), complex/ (50+ files)
└── github/        # pulls-response.json, issues-response.json
```

### Coverage targets

| Category   | Minimum |
|------------|:-------:|
| Statements |   80%   |
| Branches   |   75%   |
| Functions  |   80%   |
| Lines      |   80%   |

---

## CLI Exit Codes

| Code | Constant         | Meaning                    |
|:----:|------------------|----------------------------|
| 0    | `SUCCESS`        | Normal completion          |
| 1    | `GENERAL_ERROR`  | Runtime error              |
| 2    | `RULE_BLOCKED`   | Hard rule blocked action   |
| 3    | `CONFIG_ERROR`   | Config or DB not found     |

Defined in `packages/cli/src/exit-codes.ts`.

---

## MCP Tools (18 registered)

| Tool | Handler | Transport |
|------|---------|-----------|
| `pm_get_context` | `handleGetContext` | `withDb` |
| `pm_get_blockers` | `handleGetBlockers` | `withDb` |
| `pm_get_decisions` | `handleGetDecisions` | `withDb` |
| `pm_get_notes` | `handleGetNotes` | `withDb` |
| `pm_get_scope` | `handleGetScope` | `withDb` |
| `pm_get_standup` | `handleGetStandup` | `withDb` |
| `pm_prep_meeting` | `handlePrepMeeting` | `withDb` |
| `pm_log_decision` | `handleLogDecision` | `withDb` |
| `pm_log_note` | `handleLogNote` | `withDb` |
| `pm_check_scope` | `handleCheckScope` | `withDb` |
| `pm_add_rule` | `handleAddRule` | direct |
| `pm_enforce_rules` | `handleEnforceRules` | direct |
| `pm_scan_codebase` | `handleScanCodebase` | direct |
| `pm_get_dependency_graph` | `handleGetDependencyGraph` | direct |
| `pm_analyze_impact` | `handleAnalyzeImpact` | direct |
| `pm_search_codebase` | `handleSearchCodebase` | direct |
| `pm_get_architecture` | `handleGetArchitecture` | direct |
| `pm_get_file_context` | `handleGetFileContext` | direct |

---

## Integration Platforms (18 documented)

Comprehensive integration guide at [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) covering config and setup for:

Claude Code, Cursor, OpenCode, GitHub Copilot CLI, Zed, Cline, Continue.dev, Windsurf, Goose, VS Code, Kilo Code, Android Studio, JetBrains IDEs, Gemini CLI, OpenAI Codex CLI, Roo Code, CodeGPT Desktop, Visual Studio 2022+

Each entry documents: config file location, config key format, supported transports, and platform-specific notes.
