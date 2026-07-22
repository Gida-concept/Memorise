# PM Agent — CLI Reference

> The complete command-line reference for `pm`: installation, every command with all flags, examples, output formats, exit codes, and scripting patterns.

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Global Flags](#global-flags)
- [Command Reference](#command-reference)
  - [`pm init`](#pm-init)
  - [`pm scan`](#pm-scan)
  - [`pm log`](#pm-log)
  - [`pm blockers`](#pm-blockers)
  - [`pm scope`](#pm-scope)
  - [`pm standup`](#pm-standup)
  - [`pm note`](#pm-note)
  - [`pm depends`](#pm-depends)
  - [`pm impact`](#pm-impact)
  - [`pm search`](#pm-search)
  - [`pm arch`](#pm-arch)
  - [`pm files`](#pm-files)
  - [`pm status`](#pm-status)
  - [`pm rules`](#pm-rules)
- [Interactive Mode](#interactive-mode)
- [Output Formats](#output-formats)
- [Exit Codes](#exit-codes)
- [Shell Completion](#shell-completion)
- [Common Workflows](#common-workflows)
- [Scripting with pm](#scripting-with-pm)

---

## Overview

PM Agent ships as a single **`pm`** binary. One binary, all commands.

```
$ pm --help

  PM Agent — AI-native product management for developers

  Usage: pm <command> [options]

  Commands:
    init           First-time setup: config, DB, integrations
    scan           Codebase intelligence (index, deps, arch)
    log            Log a decision record (ADR)
    blockers       List and manage active blockers
    scope          Sprint scope check and risk assessment
    standup        Generate standup summary from project state
    note           Quick capture with auto-linking
    depends        Show dependency graph for a file
    impact         Impact analysis — what breaks if you change a file
    search         Full-text search across code + docs
    arch           Architecture overview
    files          List indexed files
    status         Project state dashboard
    rules          Manage rules (list, add, remove, toggle)

  Global Flags:
    --help, -h     Show help for any command
    --version, -v  Show version number
    --config       Path to config file
    --project      Project name (overrides auto-detection)
    --verbose      Detailed output with debug info
    --quiet        Minimal output, no spinners or colors
    --json         Structured JSON output for piping

  Learn more: https://pm-agent.dev/docs
```

Installed via npm. Ships as a compiled Node.js binary with zero runtime build step.

---

## Installation

### npm Global

```bash
npm install -g pm-agent

# Verify installation
pm --version
# → 1.0.0

# First-time setup in your project
cd my-project
pm init
```

### npx (no install)

```bash
# Run without installing
npx pm-agent init
npx pm-agent scan
npx pm-agent status
```

### From Source

```bash
git clone https://github.com/acme-corp/pm-agent.git
cd pm-agent

# Install dependencies and build
npm install
npm run build --workspace=packages/cli

# Link the binary locally
npm link --workspace=packages/cli

# Verify
pm --version
```

The binary entry point is defined in `packages/cli/package.json`:

```json
{
  "bin": {
    "pm": "./dist/index.js"
  }
}
```

---

## Global Flags

All flags apply to every command. Place them before or after the command name.

| Flag        | Alias | Type      | Description                                                              |
| ----------- | ----- | --------- | ------------------------------------------------------------------------ |
| `--help`    | `-h`  | `boolean` | Show help for any command (including subcommands)                        |
| `--version` | `-v`  | `boolean` | Print version number and exit                                            |
| `--config`  | —     | `path`    | Path to config file (default: `~/.config/pm-agent/config.toml`)          |
| `--project` | `-p`  | `string`  | Project name (overrides auto-detection from `git remote` or `cwd`)       |
| `--verbose` | —     | `boolean` | Detailed output with debug info, expression evaluation traces            |
| `--quiet`   | `-q`  | `boolean` | Minimal output — no spinners, no colors, no ASCII art. Ideal for scripts |
| `--json`    | `-j`  | `boolean` | Structured JSON output for machine parsing. Implies `--quiet`            |

```bash
# Help for a specific command
pm log --help
pm scan --help
pm rules list --help

# Version
pm --version
# → 1.0.0

# JSON output for scripting
pm blockers --json
pm status --json | jq '.blockers | length'

# Quiet mode in cron
pm standup --quiet >> ~/standup.log

# Override config path
pm --config ./team-config.toml status

# Debug a rules evaluation
pm scope "add dark mode" --verbose
```

---

## Command Reference

### `pm init`

**First-time setup.** Creates the config directory, initializes the SQLite database, detects GitHub/Linear/Slack integrations, and writes the default `rules.toml`. Detects project name from `git remote` and `cwd`.

**Usage:**

```bash
pm init [options]
```

**Flags:**

| Flag       | Alias | Type      | Default                          | Description                                                  |
| ---------- | ----- | --------- | -------------------------------- | ------------------------------------------------------------ |
| `--force`  | `-f`  | `boolean` | `false`                          | Overwrite existing config, rules, and database               |
| `--name`   | `-n`  | `string`  | (auto-detect)                    | Project name. Skips git/cwd detection                        |
| `--scan`   | `-s`  | `boolean` | `false`                          | Auto-scan codebase immediately after init (`pm scan --full`) |
| `--config` | —     | `path`    | `~/.config/pm-agent/config.toml` | Config file path                                             |

**What it does:**

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
      └─ If yes → pm scan --full
```

**Examples:**

```bash
# Basic setup (auto-detect project name from git remote)
cd my-project
pm init

# Specify project name explicitly
pm init --name "auth-service"

# Force re-init (overwrite existing configs)
pm init --force

# Init and immediately scan the full codebase
pm init --scan

# Init with a custom config file
pm init --config ./pm-config.toml
```

**Output:**

```
$ pm init
  → Initializing PM Agent...
  → Created ~/.config/pm-agent/config.toml
  → Created ~/.config/pm-agent/rules.toml
  → Detected project: auth-service
  → Detected git remote: github.com/acme-corp/auth-service
  → GitHub integration configured (token: ~/.config/pm-agent/.env)
  → Created database: ~/.local/share/pm-agent/auth-service.db
  → Schema migrations applied (7 tables, 4 indexes, 3 triggers)

  ┌──────────────────────────────────────────────────────────┐
  │                    init complete                          │
  │                                                          │
  │  Project:     auth-service                               │
  │  Config:      ~/.config/pm-agent/config.toml             │
  │  Rules:       ~/.config/pm-agent/rules.toml (8 default)  │
  │  Database:    ~/.local/share/pm-agent/auth-service.db    │
  │  Integrations: github (connected), linear (skip)         │
  └──────────────────────────────────────────────────────────┘

  → Scan codebase now? (recommended) [Y/n] > Y
  → Scanning... [████████████████████████████] 1,234 files indexed
```

**With `--force`:**

```bash
$ pm init --force
  → Existing config detected. Overwriting...
  → Overwrote ~/.config/pm-agent/config.toml
  → Overwrote ~/.config/pm-agent/rules.toml
  → Recreated database: ~/.local/share/pm-agent/auth-service.db
  → init complete (previous data archived to ~/.local/share/pm-agent/backups/)
```

**Related MCP tool:** — (No direct MCP equivalent. `pm init` is CLI-only.)

---

### `pm scan`

**Codebase intelligence.** Walks the project tree, hashes every file, classifies types, builds the dependency graph, detects architecture patterns, and indexes documentation for full-text search. The engine that powers `pm depends`, `pm impact`, `pm search`, and `pm arch`.

**Usage:**

```bash
pm scan [options]
```

**Flags:**

| Flag            | Alias | Type      | Default | Description                                                  |
| --------------- | ----- | --------- | ------- | ------------------------------------------------------------ |
| `--full`        | `-f`  | `boolean` | `false` | Cold-start full walk from scratch. Re-hashes every file      |
| `--watch`       | `-w`  | `boolean` | `false` | Continuous file watching. Re-scans on save (uses `fs.watch`) |
| `--verify`      | `-V`  | `boolean` | `false` | Check for discrepancies between indexed files and disk       |
| `--incremental` | —     | `boolean` | `true`  | Default mode — only process changed files (mtime/hash)       |
| `--verbose`     | —     | `boolean` | `false` | Show each file as it's scanned                               |
| `--json`        | `-j`  | `boolean` | `false` | Output scan summary as JSON                                  |

**Scan modes at a glance:**

| Mode                  | Command            | Use Case                                               |
| --------------------- | ------------------ | ------------------------------------------------------ |
| Incremental (default) | `pm scan`          | Daily use — fast, only changed files                   |
| Full                  | `pm scan --full`   | First run, or after git clone, or to rebuild the index |
| Watch                 | `pm scan --watch`  | Keep index in sync during development                  |
| Verify                | `pm scan --verify` | Check if any files were missed or are out of date      |

**What gets indexed:**

```
pm scan --full
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
        │   └─ Shells to ripgrep + madge
        │   └─ Store edges in dependency_edges table
        │
        ├─ 5. Detect architecture
        │   ├─ Entry points, frameworks, patterns
        │   └─ Store in architecture_map table
        │
        ├─ 6. Index documentation content
        │   └─ Store full text in doc_index table (FTS5)
        │
        └─ 7. Link to PM context
```

**Examples:**

```bash
# Incremental scan (default) — only changed files
pm scan

# Full cold-start scan
pm scan --full

# Watch mode — re-scans on every file save
pm scan --watch

# Verify — check for missed or out-of-date files
pm scan --verify

# Scan with verbose output
pm scan --verbose --full

# JSON output for scripting
pm scan --json
```

**Output (incremental):**

```
$ pm scan
  → Scanning... [████████████████████████████] 12 files changed

  ┌──────────────────────────────────────────────────────────┐
  │                    scan summary                          │
  │                                                          │
  │  Total indexed:  1,234 files                             │
  │  New:            3                                       │
  │  Modified:       9                                       │
  │  Deleted:        1                                       │
  │  Unchanged:      1,221 (skipped)                         │
  │  Duration:       0.8s                                    │
  └──────────────────────────────────────────────────────────┘
```

**Output (full):**

```
$ pm scan --full
  → Full scan... [████████████████████████████] 1,234 files

  ┌──────────────────────────────────────────────────────────┐
  │                    scan summary                          │
  │                                                          │
  │  Total indexed:  1,234 files                             │
  │  Source:         892                                     │
  │  Test:           187                                     │
  │  Doc:            34                                      │
  │  Config:         45                                      │
  │  Asset:          76                                      │
  │                                                          │
  │  Dependencies:   4,321 edges                             │
  │  Circular deps:  2                                       │
  │  Entry points:   src/main.ts, src/api/index.ts           │
  │  Framework:      Express.js                              │
  │                                                          │
  │  Duration:       12.4s                                   │
  └──────────────────────────────────────────────────────────┘
```

**Output (verify):**

```
$ pm scan --verify
  → Checking 1,234 indexed files against disk...
  →   1,234 match (ok)
  →   12 new files on disk (not indexed)
  →   3 files on disk deleted since last scan
  →   47 files modified since last scan

  → Run `pm scan` to update the index.
  → Run `pm scan --full` to rebuild from scratch.
```

**Output (watch):**

```
$ pm scan --watch
  → Watching for file changes... (Ctrl+C to stop)
  → [14:32:15] src/auth/service.ts modified → re-indexed
  → [14:32:17] src/auth/service.test.ts modified → re-indexed
  → [14:32:20] src/auth/types.ts created → indexed
  → [14:32:22] src/auth/deprecated.ts deleted → removed from index
```

**Output (JSON):**

```bash
$ pm scan --json
```

```json
{
  "status": "completed",
  "mode": "full",
  "total": 1234,
  "new": 1234,
  "modified": 0,
  "deleted": 0,
  "duration_seconds": 12.4,
  "summary": {
    "source": 892,
    "test": 187,
    "doc": 34,
    "config": 45,
    "asset": 76
  },
  "dependencies": {
    "total_edges": 4321,
    "circular_count": 2
  },
  "architecture": {
    "framework": "Express.js",
    "entry_points": ["src/main.ts", "src/api/index.ts"]
  }
}
```

**External tools orchestrated:**

| Tool                           | Purpose                                   | Required?                         |
| ------------------------------ | ----------------------------------------- | --------------------------------- |
| `ripgrep` (rg)                 | Fast file content search, import matching | Recommended (degrades gracefully) |
| `tree`                         | Directory structure dump                  | Optional (fallback: glob)         |
| `madge` / `dependency-cruiser` | Circular dependency detection             | Optional (skip if missing)        |
| Node.js `fs.watch`             | File change detection                     | Built-in                          |

**Related MCP tool:** `pm_scan_codebase`

```json
{
  "tool": "pm_scan_codebase",
  "input": { "full": true },
  "output": "Scan complete: 1,234 files indexed"
}
```

---

### `pm log`

**Log a decision.** Creates an Architecture Decision Record (ADR) with auto-generated ID. Enforces the **decision-before-close** rule — if you try to close a ticket without logging a decision, the rules engine blocks the operation.

**Usage:**

```bash
pm log <title> [options]
```

**Arguments:**

| Argument  | Required | Description                              |
| --------- | -------- | ---------------------------------------- |
| `<title>` | Yes      | Short, descriptive title of the decision |

**Flags:**

| Flag       | Alias | Type       | Default      | Description                                                                     |
| ---------- | ----- | ---------- | ------------ | ------------------------------------------------------------------------------- |
| `--body`   | `-b`  | `string`   | `""`         | Detailed body text explaining the decision context, rationale, and consequences |
| `--author` | `-a`  | `string`   | (git config) | Who made the decision. Detects from `git config user.name`                      |
| `--link`   | `-l`  | `string[]` | `[]`         | Link to related entities (tickets, PRs, other ADRs). Repeatable                 |
| `--ticket` | `-t`  | `string`   | —            | Associate with a ticket ID. Short for `--link <id>` with ticket semantics       |
| `--json`   | `-j`  | `boolean`  | `false`      | Output as JSON                                                                  |
| `--quiet`  | `-q`  | `boolean`  | `false`      | Suppress the ADR card output, just show the ID                                  |

**ADR ID format:**

IDs are auto-incremented per project: `ADR-001`, `ADR-002`, `ADR-003`, ...

**Examples:**

```bash
# Log a simple decision
pm log "Drop OAuth, use magic links"

# Log with full body and author
pm log "Migrate from REST to GraphQL" \
  --body "The REST API has grown unmanageable. GraphQL gives us type-safe queries and reduces over-fetching. Migration planned for sprint 15-16." \
  --author "alice"

# Log a decision and link to a ticket
pm log "Drop OAuth, use magic links" \
  --body "Magic links eliminate the password reset flow entirely. Reduces auth surface area." \
  --ticket AUTH-91 \
  --link PR-442

# Log with multiple links
pm log "Adopt Vitest over Jest" \
  --body "Vitest is 3x faster, native ESM, and compatible with our existing Jest plugins." \
  --link "RFC-18" \
  --link "TASK-009" \
  --link "PR-448"

# JSON output for automation
pm log "Drop OAuth" --json
```

**Output:**

```
$ pm log "Drop OAuth, use magic links" --body "Eliminates password reset flow" --ticket AUTH-91

  ✓ Decision logged as ADR-004

  ┌──────────────────────────────────────────────────────────┐
  │  ADR-004                                                  │
  │  ─────────────────────────────────────                    │
  │  Title:   Drop OAuth, use magic links                     │
  │  Author:  alice                                           │
  │  Date:    2026-07-21 14:30 UTC                            │
  │  Body:    Eliminates password reset flow.                 │
  │           Reduces auth surface area.                      │
  │  Links:   AUTH-91, PR-442                                 │
  └──────────────────────────────────────────────────────────┘

  → Linked entities:
      TASK-007: "Implement magic link flow" (blocked on BLK-003)
      BLK-003:  "PR #442 unreviewed" (open, 2d)
```

**When rules block:**

```
$ pm log "Drop OAuth" --ticket AUTH-91 --close-ticket

  [ERROR] Rule 'decision-before-close' fired: hard block
  → Cannot close AUTH-91: no decision logged. Run `pm log` first.

  Action aborted. (exit code 2)
```

**Output (JSON):**

```bash
$ pm log "Drop OAuth" --json
```

```json
{
  "id": "ADR-004",
  "title": "Drop OAuth, use magic links",
  "body": "",
  "author": "alice",
  "made_at": "2026-07-21T14:30:00Z",
  "linked_entities": [],
  "linked_blockers": [],
  "linked_tasks": [],
  "linked_notes": []
}
```

**Related MCP tool:** `pm_log_decision`

```json
{
  "tool": "pm_log_decision",
  "input": {
    "title": "Drop OAuth, use magic links",
    "body": "Eliminates password reset flow",
    "links": ["AUTH-91"]
  },
  "output": "ADR-004 created"
}
```

---

### `pm blockers`

**List and manage active blockers.** Shows what's currently blocking progress, how long each has been blocked, and who or what is the blocker. Enforces the **daily-blocker-check** rule.

**Usage:**

```bash
pm blockers [options]
```

**Flags:**

| Flag        | Alias | Type       | Default | Description                                                    |
| ----------- | ----- | ---------- | ------- | -------------------------------------------------------------- |
| `--all`     | `-a`  | `boolean`  | `false` | Include resolved blockers in the output                        |
| `--age`     | —     | `duration` | —       | Filter by minimum age (e.g., `24h`, `3d`, `30m`)               |
| `--resolve` | `-r`  | `string`   | —       | Mark a blocker as resolved by ID. Example: `--resolve BLK-003` |
| `--json`    | `-j`  | `boolean`  | `false` | Output as JSON                                                 |
| `--quiet`   | `-q`  | `boolean`  | `false` | Just print the count, no table                                 |

**Examples:**

```bash
# List all active blockers
pm blockers

# List all blockers including resolved
pm blockers --all

# List only blockers older than 2 days
pm blockers --age 48h

# List blockers older than 1 day
pm blockers --age 1d

# Resolve a blocker
pm blockers --resolve BLK-003

# JSON output
pm blockers --json

# Quiet — just the count (useful for scripts)
pm blockers --quiet
# → 2
```

**Output:**

```
$ pm blockers

  ┌────────┬─────────────────────────────────┬──────┬───────────────┬──────────┐
  │ ID     │ Title                           │ Age  │ Blocked By    │ Status   │
  ├────────┼─────────────────────────────────┼──────┼───────────────┼──────────┤
  │ BLK-003│ PR #442 needs review            │ 2d   │ @backend-lead │ open     │
  │ BLK-004│ RFC #18 unanswered              │ 3d   │ @design-lead  │ open     │
  │ BLK-005│ CI pipeline flaky on main       │ 5h   │ infra          │ open     │
  └────────┴─────────────────────────────────┴──────┴───────────────┴──────────┘

  → 3 active blockers | 12 resolved this sprint

  [INFO] daily-blocker-check: You have 3 active blockers today
```

**After resolving:**

```
$ pm blockers --resolve BLK-003
  → Blocker BLK-003 ("PR #442 needs review") marked as resolved.

$ pm blockers

  ┌────────┬─────────────────────────────────┬──────┬───────────────┬──────────┐
  │ ID     │ Title                           │ Age  │ Blocked By    │ Status   │
  ├────────┼─────────────────────────────────┼──────┼───────────────┼──────────┤
  │ BLK-004│ RFC #18 unanswered              │ 3d   │ @design-lead  │ open     │
  │ BLK-005│ CI pipeline flaky on main       │ 5h   │ infra          │ open     │
  └────────┴─────────────────────────────────┴──────┴───────────────┴──────────┘
```

**With `--all`:**

```
$ pm blockers --all

  ┌────────┬─────────────────────────────────┬──────┬───────────────┬──────────┐
  │ ID     │ Title                           │ Age  │ Blocked By    │ Status   │
  ├────────┼─────────────────────────────────┼──────┼───────────────┼──────────┤
  │ BLK-003│ PR #442 needs review            │ 2d   │ @backend-lead │ resolved │
  │ BLK-004│ RFC #18 unanswered              │ 3d   │ @design-lead  │ open     │
  │ BLK-005│ CI pipeline flaky on main       │ 5h   │ infra          │ open     │
  │ BLK-001│ Database migration stuck        │ 7d   │ DBA team      │ resolved │
  │ BLK-002│ ESLint config conflict          │ 4d   │ @alice        │ resolved │
  └────────┴─────────────────────────────────┴──────┴───────────────┴──────────┘
```

**Output (JSON):**

```bash
$ pm blockers --json
```

```json
{
  "active": 2,
  "total": 5,
  "blockers": [
    {
      "id": "BLK-004",
      "title": "RFC #18 unanswered",
      "age_hours": 72,
      "blocked_by": "@design-lead",
      "status": "open",
      "linked_entities": ["RFC-18"],
      "created_at": "2026-07-18T14:00:00Z"
    },
    {
      "id": "BLK-005",
      "title": "CI pipeline flaky on main",
      "age_hours": 5,
      "blocked_by": "infra",
      "status": "open",
      "linked_entities": [],
      "created_at": "2026-07-21T10:00:00Z"
    }
  ],
  "resolved_this_sprint": 3
}
```

**Related MCP tool:** `pm_get_blockers`

```json
{
  "tool": "pm_get_blockers",
  "input": {},
  "output": "3 active blockers returned"
}
```

---

### `pm scope`

**Sprint scope check.** Assesses risk when proposing to add work to an active sprint. Enforces the **scope-check** rule — if the proposed addition exceeds 50% of remaining capacity, the rule fires a confirmation prompt.

**Usage:**

```bash
pm scope <description> [options]
```

**Arguments:**

| Argument        | Required | Description                                                      |
| --------------- | -------- | ---------------------------------------------------------------- |
| `<description>` | Yes      | Description of the proposed work. Should include effort estimate |

**Flags:**

| Flag          | Alias | Type      | Default  | Description                                                                             |
| ------------- | ----- | --------- | -------- | --------------------------------------------------------------------------------------- |
| `--sprint`    | `-s`  | `string`  | (latest) | Sprint name to check against. Defaults to the latest snapshot                           |
| `--committed` | `-c`  | `number`  | —        | Committed days in the sprint (overrides stored value)                                   |
| `--remaining` | `-r`  | `number`  | —        | Remaining days in the sprint (overrides stored value)                                   |
| `--impact`    | `-i`  | `number`  | —        | Estimated impact of the proposed work in days (parsed from description if not provided) |
| `--yes`       | `-y`  | `boolean` | `false`  | Auto-confirm the prompt (skip interactive check). Use with caution                      |
| `--json`      | `-j`  | `boolean` | `false`  | Output as JSON                                                                          |

**Risk assessment logic:**

| Condition                           | Risk Level                   |
| ----------------------------------- | ---------------------------- |
| Impact <= 25% of remaining capacity | LOW                          |
| Impact <= 50% of remaining capacity | MEDIUM                       |
| Impact > 50% of remaining capacity  | HIGH (confirmation required) |

**Examples:**

```bash
# Check scope — effort parsed from description
pm scope "Add dark mode — estimated 5 days"

# Specify impact explicitly
pm scope "Add dark mode" --impact 5

# Check against a specific sprint
pm scope "Refactor auth middleware" --sprint "Sprint 14"

# Override committed/remaining values
pm scope "Add dark mode" --committed 20 --remaining 4

# Auto-confirm (skip interactive prompt)
pm scope "Add dark mode" --impact 2 --remaining 10 --yes

# JSON output
pm scope "Add dark mode" --impact 5 --remaining 4 --json
```

**Output (low risk — passes through):**

```
$ pm scope "Add tests for user model — 1 day"
  → Checking scope against current sprint...
  → Sprint 14: 8 committed days, 4 remaining
  → Impact: 1 day (25% of remaining)
  → Risk: LOW — fits within sprint capacity
  → Scope check passed.
```

**Output (high risk — confirmation required):**

```
$ pm scope "Add dark mode — 5 days"

  ⚠ Rule 'scope-check' fired: soft confirmation
  → Adding "dark mode" adds +5 days to a sprint with only 4 days remaining.
    This will push existing work and may cause spillover.

  Confirm? [Y/n/details] > n
  Action cancelled. (exit code 0 — intentional cancel)
```

**Output (high risk — confirmed):**

```
$ pm scope "Add dark mode — 5 days"

  ⚠ Rule 'scope-check' fired: soft confirmation
  → Adding "dark mode" adds 5 days to a sprint with 4 days remaining.

  Confirm? [Y/n/details] > y
  → Scope change confirmed. Snapshot saved.

  ┌──────────────────────────────────────────────────────────┐
  │  Sprint 14 — scope update                                │
  │  ─────────────────────────────────────                    │
  │  Committed:   8 days (+5 = 13 days total)                │
  │  Remaining:   4 days                                     │
  │  Impact:      5 days (38% over capacity)                 │
  │  Risk:        HIGH — spillover likely                    │
  │  Status:      confirmed                                  │
  └──────────────────────────────────────────────────────────┘
```

**Output (details prompt):**

```
  Confirm? [Y/n/details] > details

  ┌──────────────────────────────────────────────────────────┐
  │  Sprint 14 — detailed breakdown                          │
  │                                                          │
  │  Current committed work:                                 │
  │    AUTH-91 (3d) — in progress (bob)                      │
  │    AUTH-92 (3d) — not started                            │
  │    AUTH-93 (2d) — in review                              │
  │                                                          │
  │  Proposed addition:                                      │
  │    Dark mode (5d) — not started                          │
  │                                                          │
  │  Capacity analysis:                                      │
  │    Total sprint capacity:  10 days                       │
  │    Already committed:       8 days (80%)                 │
  │    Remaining capacity:      2 days                       │
  │    Proposed impact:         5 days                       │
  │    Over capacity by:        3 days (150%)                │
  │                                                          │
  │  Recommendations:                                        │
  │    - Move AUTH-93 to sprint 15 (frees 2d)               │
  │    - Reduce dark mode scope to MVP (frees 3d)            │
  │    - Or: defer to sprint 15 (recommended)                │
  └──────────────────────────────────────────────────────────┘

  Confirm anyway? [Y/n] > n
```

**Output (JSON):**

```bash
$ pm scope "Add dark mode" --impact 5 --remaining 4 --json
```

```json
{
  "sprint": "Sprint 14",
  "committed_days": 8,
  "remaining_days": 4,
  "impact_days": 5,
  "risk": "HIGH",
  "over_capacity_days": 3,
  "status": "pending",
  "rules_evaluation": {
    "blocked": false,
    "confirmation_required": true,
    "message": "Adding 'Add dark mode' adds 5 days to a sprint with 4 days remaining"
  }
}
```

**Related MCP tool:** `pm_check_scope`

```json
{
  "tool": "pm_check_scope",
  "input": {
    "change": "Add dark mode",
    "impact_days": 5
  },
  "output": "Risk: HIGH — confirmation required"
}
```

---

### `pm standup`

**Generate standup summary.** Queries recent decisions, blockers, notes, and sprint context to produce a structured "what I did yesterday / what I'm doing today / blockers" summary. Enforces the **daily-blocker-check** rule.

**Usage:**

```bash
pm standup [options]
```

**Flags:**

| Flag          | Alias | Type      | Default | Description                                                |
| ------------- | ----- | --------- | ------- | ---------------------------------------------------------- |
| `--yesterday` | `-y`  | `string`  | `24h`   | Custom lookback period. Formats: `24h`, `3d`, `2026-07-20` |
| `--format`    | `-f`  | `string`  | `text`  | Output format: `text` (default), `json`                    |
| `--json`      | `-j`  | `boolean` | `false` | Short for `--format json`                                  |
| `--quiet`     | `-q`  | `boolean` | `false` | Minimal output — no intro/outro, just the summary          |

**What it sources:**

| Source              | Timeframe   | Content                           |
| ------------------- | ----------- | --------------------------------- |
| Decisions           | Last 24h    | ADRs logged                       |
| Blockers (resolved) | Last 24h    | Blockers that were resolved       |
| Blockers (active)   | Current     | Blockers still open               |
| Notes               | Last 24h    | Quick captures and tags           |
| Scope               | Latest      | Sprint name, remaining days, risk |
| Tasks               | In progress | Tasks with status updates         |

**Examples:**

```bash
# Generate default standup (looks back 24h)
pm standup

# Look back 3 days (e.g., Monday standup after weekend)
pm standup --yesterday 3d

# Look back to a specific date
pm standup --yesterday 2026-07-20

# JSON format for piping into other tools
pm standup --json

# Quiet mode — just the facts
pm standup --quiet
```

**Output (text):**

```
$ pm standup

  ┌──────────────────────────────────────────────────────────┐
  │              Standup Summary — 2026-07-21                │
  │              auth-service / Sprint 14                     │
  └──────────────────────────────────────────────────────────┘

  Yesterday (since 2026-07-20):
    ✓ Logged ADR-004: "Drop OAuth, use magic links"
    ✓ Resolved BLK-003: "PR #442 needs review"
    ✓ Captured 3 notes (tags: auth, sprint-14, stakeholder)

  Today:
    □ Start implementing magic link flow (AUTH-92)
    □ Review RFC #18 for GraphQL migration
    □ Follow up on CI flakiness (BLK-005)

  Blockers:
    ! BLK-004: RFC #18 unanswered (3d, @design-lead)
    ! BLK-005: CI pipeline flaky on main (5h, infra)

  [INFO] daily-blocker-check: You have 2 active blockers today
```

**Output (JSON):**

```bash
$ pm standup --json
```

```json
{
  "date": "2026-07-21",
  "project": "auth-service",
  "sprint": "Sprint 14",
  "sprint_remaining_days": 4,
  "sprint_risk": "MEDIUM",
  "yesterday": {
    "decisions": [{ "id": "ADR-004", "title": "Drop OAuth, use magic links" }],
    "blockers_resolved": [{ "id": "BLK-003", "title": "PR #442 needs review" }],
    "notes_count": 3
  },
  "today": [
    "Implement magic link flow (AUTH-92)",
    "Review RFC #18 for GraphQL migration",
    "Follow up on CI flakiness (BLK-005)"
  ],
  "blockers": [
    {
      "id": "BLK-004",
      "title": "RFC #18 unanswered",
      "age_hours": 72,
      "blocked_by": "@design-lead"
    },
    { "id": "BLK-005", "title": "CI pipeline flaky on main", "age_hours": 5, "blocked_by": "infra" }
  ]
}
```

**Related MCP tool:** `pm_get_standup`

```json
{
  "tool": "pm_get_standup",
  "input": {},
  "output": "Standup summary with 2 blockers"
}
```

---

### `pm note`

**Quick capture.** Logs a freeform note with auto-tagging and auto-linking to related entities (tickets, PRs, decisions, blockers). Tags and links are extracted from the note content and enriched via the entity graph.

**Usage:**

```bash
pm note <content> [options]
```

**Arguments:**

| Argument    | Required | Description                              |
| ----------- | -------- | ---------------------------------------- |
| `<content>` | Yes      | The note content. Supports freeform text |

**Flags:**

| Flag      | Alias | Type       | Default | Description                                             |
| --------- | ----- | ---------- | ------- | ------------------------------------------------------- |
| `--tag`   | `-t`  | `string[]` | `[]`    | Tags to apply. Repeatable: `--tag auth --tag sprint-14` |
| `--link`  | `-l`  | `string[]` | `[]`    | Link to related entities. Repeatable                    |
| `--json`  | `-j`  | `boolean`  | `false` | Output as JSON                                          |
| `--quiet` | `-q`  | `boolean`  | `false` | Just show the note ID, no detail                        |

**Auto-linking behavior:**

When a note mentions ticket IDs (e.g., `AUTH-91`), PR numbers (`#442`), or ADR references (`ADR-004`), the engine automatically links the note to those entities in the entity graph. You can also link manually with `--link`.

**Examples:**

```bash
# Quick thought — auto-linked
pm note "Stakeholder approved the dark mode design. Moving to sprint 15."

# With explicit tags
pm note "Need to investigate CI flaky test" --tag infra --tag ci

# With explicit links
pm note "Decision discussed in standup" \
  --link ADR-004 \
  --link AUTH-91 \
  --tag meeting \
  --tag sprint-14

# JSON output
pm note "Quick capture" --tag idea --json

# Quiet — just the ID
pm note "Remember to update the README" --quiet
# → NOTE-013 saved
```

**Output:**

```
$ pm note "Stakeholder approved the dark mode design. Moving to sprint 15."

  ✓ Captured as NOTE-013

  ┌──────────────────────────────────────────────────────────┐
  │  NOTE-013                                                 │
  │  ─────────────────────────────────────                    │
  │  Content:  Stakeholder approved the dark mode             │
  │            design. Moving to sprint 15.                   │
  │  Tags:     stakeholder, sprint-15                         │
  │  Links:    (none detected)                                │
  └──────────────────────────────────────────────────────────┘
```

```
$ pm note "PR #442 needs review before we can close AUTH-91" --tag blockers

  ✓ Captured as NOTE-014

  ┌──────────────────────────────────────────────────────────┐
  │  NOTE-014                                                 │
  │  ─────────────────────────────────────                    │
  │  Content:  PR #442 needs review before we can             │
  │            close AUTH-91                                  │
  │  Tags:     blockers                                       │
  │  Links:    PR-442, AUTH-91                                │
  │                                                           │
  │  → Note linked to AUTH-91 (todo)                          │
  │  → Note linked to PR-442 (unreviewed, 2d old)             │
  └──────────────────────────────────────────────────────────┘
```

**Output (JSON):**

```bash
$ pm note "Investigate CI flaky test" --tag infra --json
```

```json
{
  "id": "NOTE-015",
  "content": "Investigate CI flaky test",
  "tags": ["infra"],
  "linked_entities": [],
  "created_at": "2026-07-21T15:00:00Z"
}
```

**Related MCP tool:** `pm_log_note`

```json
{
  "tool": "pm_log_note",
  "input": {
    "content": "Stakeholder approved dark mode",
    "tags": ["stakeholder", "sprint-15"]
  },
  "output": "NOTE-013 created"
}
```

---

### `pm depends`

**Dependency graph for a file.** Shows what a file imports and what imports it. Uses the dependency graph built by `pm scan`.

**Usage:**

```bash
pm depends <path> [options]
```

**Arguments:**

| Argument | Required | Description                                                              |
| -------- | -------- | ------------------------------------------------------------------------ |
| `<path>` | Yes      | Path to the file (relative to project root, e.g., `src/auth/service.ts`) |

**Flags:**

| Flag        | Alias | Type      | Default | Description                                             |
| ----------- | ----- | --------- | ------- | ------------------------------------------------------- |
| `--depth`   | `-d`  | `number`  | `1`     | Traversal depth for transitive dependencies             |
| `--reverse` | `-r`  | `boolean` | `false` | Only show what imports this file (reverse dependencies) |
| `--json`    | `-j`  | `boolean` | `false` | Output as JSON                                          |

**Examples:**

```bash
# Show direct dependencies and dependents
pm depends src/auth/service.ts

# Show with depth 2
pm depends src/auth/service.ts --depth 2

# Show only reverse dependencies (what imports this)
pm depends src/user/model.ts --reverse

# JSON output
pm depends src/auth/service.ts --json
```

**Output:**

```
$ pm depends src/auth/service.ts

  src/auth/service.ts
  ├── imports:
  │   ├── src/user/model.ts (static)
  │   ├── src/db/client.ts (static)
  │   └── src/utils/jwt.ts (static)
  │
  └── imported by:
      ├── src/routes/login.ts (static)
      ├── src/middleware/auth.ts (static)
      └── tests/auth/service.test.ts (static)
```

```
$ pm depends src/user/model.ts --depth 2

  src/user/model.ts
  ├── imports:
  │   ├── src/db/client.ts (static)
  │   └── src/utils/validate.ts (static)
  │
  └── imported by:
      ├── src/auth/service.ts (static)
      │   └── imported by:
      │       ├── src/routes/login.ts (static)
      │       └── src/middleware/auth.ts (static)
      ├── src/profile/view.ts (static)
      │   └── imported by:
      │       └── src/routes/profile.ts (static)
      └── tests/user/model.test.ts (static)
```

```
$ pm depends src/user/model.ts --reverse

  src/user/model.ts
  └── imported by:
      ├── src/auth/service.ts (static)
      ├── src/profile/view.ts (static)
      └── tests/user/model.test.ts (static)
```

**Output (JSON):**

```bash
$ pm depends src/auth/service.ts --json
```

```json
{
  "file": "src/auth/service.ts",
  "imports": [
    { "path": "src/user/model.ts", "type": "static" },
    { "path": "src/db/client.ts", "type": "static" },
    { "path": "src/utils/jwt.ts", "type": "static" }
  ],
  "imported_by": [
    { "path": "src/routes/login.ts", "type": "static" },
    { "path": "src/middleware/auth.ts", "type": "static" },
    { "path": "tests/auth/service.test.ts", "type": "static" }
  ]
}
```

**Related MCP tool:** `pm_get_dependency_graph`

```json
{
  "tool": "pm_get_dependency_graph",
  "input": { "path": "src/auth/service.ts" },
  "output": "3 imports, 3 dependents"
}
```

---

### `pm impact`

**Impact analysis.** Shows everything that breaks if you change a file — direct dependents, transitive dependents, and linked PM context (decisions, blockers, tasks). Uses reverse dependency traversal from the codebase intelligence layer.

**Usage:**

```bash
pm impact <path> [options]
```

**Arguments:**

| Argument | Required | Description                    |
| -------- | -------- | ------------------------------ |
| `<path>` | Yes      | Path to the file being changed |

**Flags:**

| Flag      | Alias | Type      | Default | Description                |
| --------- | ----- | --------- | ------- | -------------------------- |
| `--depth` | `-d`  | `number`  | `2`     | Transitive traversal depth |
| `--json`  | `-j`  | `boolean` | `false` | Output as JSON             |

**Examples:**

```bash
# Basic impact analysis
pm impact src/user/model.ts

# Deeper transitive scan
pm impact src/db/client.ts --depth 3

# JSON output for pipeline integration
pm impact src/user/model.ts --json
```

**Output:**

```
$ pm impact src/user/model.ts

  Impact analysis for: src/user/model.ts

  Direct dependents (3):
    ├── src/auth/service.ts          [login flow]
    ├── src/profile/view.ts          [profile page]
    └── tests/user/model.test.ts     [unit tests]

  Transitive dependents (7):
    ├── src/routes/login.ts          → via src/auth/service.ts
    ├── src/middleware/auth.ts       → via src/auth/service.ts
    ├── src/routes/profile.ts        → via src/profile/view.ts
    ├── src/handlers/user.ts         → via src/profile/view.ts
    ├── tests/auth/service.test.ts   → via src/auth/service.ts
    ├── tests/e2e/login.test.ts      → via src/routes/login.ts
    └── tests/e2e/profile.test.ts    → via src/routes/profile.ts

  Total files affected: 10

  Linked PM context:
    ┌──────────────────────────────────────────────────────────┐
    │  ADR-004: "Refactor user model next sprint"             │
    │    → due sprint 15, priority high                       │
    │                                                         │
    │  BLK-003: "PR #442 blocked on auth service"             │
    │    → open, 2d old, @backend-lead                        │
    │                                                         │
    │  TASK-007: "Implement magic link flow"                  │
    │    → blocked on BLK-003                                 │
    │                                                         │
    │  NOTE-013: "Stakeholder approved dark mode"             │
    │    → tagged: stakeholder, sprint-15                     │
    └──────────────────────────────────────────────────────────┘
```

**Output (JSON):**

```bash
$ pm impact src/user/model.ts --json
```

```json
{
  "target": "src/user/model.ts",
  "direct_dependents": ["src/auth/service.ts", "src/profile/view.ts", "tests/user/model.test.ts"],
  "transitive_dependents": [
    "src/routes/login.ts",
    "src/middleware/auth.ts",
    "src/routes/profile.ts",
    "src/handlers/user.ts",
    "tests/auth/service.test.ts",
    "tests/e2e/login.test.ts",
    "tests/e2e/profile.test.ts"
  ],
  "total_affected": 10,
  "linked_context": {
    "decisions": [{ "id": "ADR-004", "title": "Refactor user model next sprint" }],
    "blockers": [{ "id": "BLK-003", "title": "PR #442 blocked on auth service" }],
    "tasks": [{ "id": "TASK-007", "title": "Implement magic link flow" }],
    "notes": [{ "id": "NOTE-013", "content": "Stakeholder approved dark mode" }]
  }
}
```

**Related MCP tool:** `pm_analyze_impact`

```json
{
  "tool": "pm_analyze_impact",
  "input": { "path": "src/user/model.ts", "depth": 2 },
  "output": "10 files affected, 4 linked PM entities"
}
```

---

### `pm search`

**Full-text search.** Searches indexed code and documentation using SQLite FTS5. Returns results with path, line number, snippet preview, and highlights.

**Usage:**

```bash
pm search <query> [options]
```

**Arguments:**

| Argument  | Required | Description                              |
| --------- | -------- | ---------------------------------------- |
| `<query>` | Yes      | Search query (plain text or FTS5 syntax) |

**Flags:**

| Flag       | Alias | Type      | Default | Description                                                |
| ---------- | ----- | --------- | ------- | ---------------------------------------------------------- |
| `--scope`  | `-s`  | `string`  | `all`   | Search scope: `code`, `docs`, `all`                        |
| `--type`   | `-t`  | `string`  | —       | File type filter: `source`, `test`, `doc`, `config`, `all` |
| `--json`   | `-j`  | `boolean` | `false` | Output as JSON                                             |
| `--limit`  | `-l`  | `number`  | `20`    | Maximum results                                            |
| `--offset` | —     | `number`  | `0`     | Result offset for pagination                               |

**Examples:**

```bash
# Search for a term across code + docs
pm search "deleted_at"

# Search only in code files
pm search "deleted_at" --scope code

# Search only in documentation
pm search "migration" --scope docs

# Search only source files
pm search "OAuth" --type source

# Search tests only
pm search "mock" --type test

# Paginated results
pm search "handler" --limit 5 --offset 10

# JSON output
pm search "deleted_at" --json
```

**Output:**

```
$ pm search "deleted_at"

  Found 3 results for "deleted_at":

  ┌────────────────────────────────────────────────────────────────────────┐
  │ src/models/user.ts:42                        source                    │
  │   ...export interface User {                                          │
  │   ...  email: string;                                                  │
  │   →  deleted_at: DateTime | null;                                     │
  │   ...  updated_at: DateTime;                                           │
  │   ...}                                                                 │
  ├────────────────────────────────────────────────────────────────────────┤
  │ src/migrations/003_add_deleted_at.sql:5        source                  │
  │   ...-- Add soft delete support                                        │
  │   →  ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;               │
  │   ...-- Update existing records                                        │
  ├────────────────────────────────────────────────────────────────────────┤
  │ README.md:143                              doc                         │
  │   ...## Soft Deletes                                                    │
  │   →  Soft deletes use the `deleted_at` timestamp on each table.       │
  │   ...All queries should filter `WHERE deleted_at IS NULL`.              │
  └────────────────────────────────────────────────────────────────────────┘
```

**Output (JSON):**

```bash
$ pm search "deleted_at" --json
```

```json
{
  "query": "deleted_at",
  "total_results": 3,
  "results": [
    {
      "path": "src/models/user.ts",
      "line": 42,
      "type": "source",
      "snippet": "  deleted_at: DateTime | null;"
    },
    {
      "path": "src/migrations/003_add_deleted_at.sql",
      "line": 5,
      "type": "source",
      "snippet": "ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;"
    },
    {
      "path": "README.md",
      "line": 143,
      "type": "doc",
      "snippet": "Soft deletes use the `deleted_at` timestamp on each table."
    }
  ]
}
```

**Related MCP tool:** `pm_search_codebase`

```json
{
  "tool": "pm_search_codebase",
  "input": { "query": "deleted_at", "scope": "all" },
  "output": "3 results found"
}
```

---

### `pm arch`

**Architecture overview.** Displays a summary of the project's architecture: framework detected, entry points, layer structure, file counts by type, and circular dependency count. Data comes from the `architecture_map` table populated by `pm scan`.

**Usage:**

```bash
pm arch [options]
```

**Flags:**

| Flag     | Alias | Type      | Default | Description    |
| -------- | ----- | --------- | ------- | -------------- |
| `--json` | `-j`  | `boolean` | `false` | Output as JSON |

**Examples:**

```bash
# Show architecture overview
pm arch

# JSON output
pm arch --json
```

**Output:**

```
$ pm arch

  ┌──────────────────────────────────────────────────────────┐
  │              Architecture Overview                        │
  │              auth-service                                 │
  └──────────────────────────────────────────────────────────┘

  Framework:       Express.js
  Entry Points:    src/main.ts, src/api/index.ts

  Layer Structure:
    routes/          → controllers      (7 files)
    controllers/     → services         (5 files)
    services/        → models           (4 files)
    models/          → db               (3 files)
    middleware/      → routes           (3 files)

  File Types:
    source:         892
    test:           187
    doc:             34
    config:          45
    asset:           76
    ─────────────────
    total:        1,234

  Circular Dependencies:  2
    src/utils/helpers.ts ↔ src/utils/format.ts
    src/middleware/auth.ts ↔ src/routes/auth.ts

  Index Status:      1,234 / 1,234 files indexed (up to date)
  Last Scanned:      2026-07-21 14:00 UTC
  Unindexed Files:   0
```

**Output (JSON):**

```bash
$ pm arch --json
```

```json
{
  "project": "auth-service",
  "framework": "Express.js",
  "entry_points": ["src/main.ts", "src/api/index.ts"],
  "layers": [
    { "from": "routes", "to": "controllers", "file_count": 7 },
    { "from": "controllers", "to": "services", "file_count": 5 },
    { "from": "services", "to": "models", "file_count": 4 },
    { "from": "models", "to": "db", "file_count": 3 },
    { "from": "middleware", "to": "routes", "file_count": 3 }
  ],
  "files_by_type": {
    "source": 892,
    "test": 187,
    "doc": 34,
    "config": 45,
    "asset": 76,
    "total": 1234
  },
  "circular_dependencies": 2,
  "circular_chains": [
    "src/utils/helpers.ts ↔ src/utils/format.ts",
    "src/middleware/auth.ts ↔ src/routes/auth.ts"
  ],
  "indexed": 1234,
  "last_scanned": "2026-07-21T14:00:00Z",
  "unindexed_files": 0
}
```

**Related MCP tool:** `pm_get_architecture`

```json
{
  "tool": "pm_get_architecture",
  "input": {},
  "output": "Express.js, 1,234 files, 2 circular deps"
}
```

---

### `pm files`

**List indexed files.** Shows files in the `file_registry` with optional filtering by type. Can also detect files on disk that are not yet in the index.

**Usage:**

```bash
pm files [options]
```

**Flags:**

| Flag          | Alias | Type      | Default | Description                                                           |
| ------------- | ----- | --------- | ------- | --------------------------------------------------------------------- |
| `--type`      | `-t`  | `string`  | —       | Filter by type: `source`, `test`, `doc`, `config`, `asset`, `unknown` |
| `--unindexed` | `-u`  | `boolean` | `false` | Show files on disk that are NOT in the index (comparison mode)        |
| `--limit`     | `-l`  | `number`  | `50`    | Max results                                                           |
| `--offset`    | —     | `number`  | `0`     | Result offset for pagination                                          |
| `--json`      | `-j`  | `boolean` | `false` | Output as JSON                                                        |

**Examples:**

```bash
# List source files (first 50)
pm files --type source

# List test files
pm files --type test

# List all config files
pm files --type config

# Show unindexed files
pm files --unindexed

# Paginate results
pm files --type source --limit 10 --offset 20

# JSON output
pm files --type source --json
```

**Output:**

```
$ pm files --type source

  Showing 50 of 892 source files:

  src/main.ts
  src/app.ts
  src/api/index.ts
  src/auth/service.ts
  src/auth/controller.ts
  src/auth/types.ts
  src/user/model.ts
  src/user/controller.ts
  ...

  → Run `pm files --type source --limit all` for the full list.
```

```
$ pm files --unindexed

  Found 7 unindexed files on disk:

    .env.local (config)       — not tracked
    docs/notes.md (doc)       — not tracked
    src/temp/debug.ts (source) — not tracked
    vendor/old-lib.js (source) — not tracked
    test-results/output.json (asset) — not tracked
    coverage/lcov.info (asset) — not tracked
    dist/bundle.js (source)   — not tracked

  → Run `pm scan` to index these files.
```

**Output (JSON):**

```bash
$ pm files --type test --json
```

```json
{
  "type": "test",
  "total": 187,
  "offset": 0,
  "limit": 50,
  "files": [
    "tests/auth/service.test.ts",
    "tests/user/model.test.ts",
    "tests/e2e/login.test.ts",
    "..."
  ]
}
```

**Related MCP tool:** `pm_get_file_context`

```json
{
  "tool": "pm_get_file_context",
  "input": { "path": "src/auth/service.ts" },
  "output": "PM context linked to file: ADR-004, BLK-003, TASK-007"
}
```

---

### `pm status`

**Project state overview.** Dashboard-style output showing the current state of the project: name, sprint info, active blockers, recent decisions, file index stats, and integration health. The single best command for orienting yourself or an AI agent.

**Usage:**

```bash
pm status [options]
```

**Flags:**

| Flag     | Alias | Type      | Default | Description    |
| -------- | ----- | --------- | ------- | -------------- |
| `--json` | `-j`  | `boolean` | `false` | Output as JSON |

**Examples:**

```bash
# Show project status
pm status

# JSON for programmatic use
pm status --json
```

**Output:**

```
$ pm status

  ┌──────────────────────────────────────────────────────────┐
  │                   Project Status                          │
  │                   auth-service                            │
  └──────────────────────────────────────────────────────────┘

  Project:          auth-service
  Config:           ~/.config/pm-agent/config.toml
  Database:         ~/.local/share/pm-agent/auth-service.db
  Integrations:     github (connected), linear (not configured)

  Sprint:
    Name:           Sprint 14
    Committed:      8 days
    Remaining:      4 days
    Risk:           MEDIUM

  Decisions:        4 (last: ADR-004 — "Drop OAuth, use magic links")
  Active Blockers:  2
    BLK-004: RFC #18 unanswered (3d, @design-lead)
    BLK-005: CI pipeline flaky on main (5h, infra)

  Notes:            15 total (3 since yesterday)
  Tasks:            7 total (2 in progress, 1 blocked, 4 todo)

  Codebase:
    Files indexed:  1,234
    Dependencies:   4,321 edges
    Circular deps:  2
    Last scanned:   2026-07-21 14:00 UTC

  Active Rules:     8 (2 hard, 3 soft, 3 info)
```

**Output (JSON):**

```bash
$ pm status --json
```

```json
{
  "project": "auth-service",
  "config": {
    "path": "~/.config/pm-agent/config.toml",
    "database": "~/.local/share/pm-agent/auth-service.db",
    "integrations": {
      "github": "connected",
      "linear": "not_configured"
    }
  },
  "sprint": {
    "name": "Sprint 14",
    "committed_days": 8,
    "remaining_days": 4,
    "risk": "MEDIUM"
  },
  "decisions_total": 4,
  "last_decision": {
    "id": "ADR-004",
    "title": "Drop OAuth, use magic links"
  },
  "active_blockers": 2,
  "blockers": [
    { "id": "BLK-004", "title": "RFC #18 unanswered", "age_hours": 72 },
    { "id": "BLK-005", "title": "CI pipeline flaky on main", "age_hours": 5 }
  ],
  "notes_total": 15,
  "notes_since_yesterday": 3,
  "tasks_total": 7,
  "tasks_by_status": {
    "in_progress": 2,
    "blocked": 1,
    "todo": 4
  },
  "codebase": {
    "files_indexed": 1234,
    "dependency_edges": 4321,
    "circular_dependencies": 2,
    "last_scanned": "2026-07-21T14:00:00Z"
  },
  "rules_active": 8,
  "rules_by_severity": {
    "hard": 2,
    "soft": 3,
    "info": 3
  }
}
```

**Related MCP tool:** `pm_get_context`

```json
{
  "tool": "pm_get_context",
  "input": {},
  "output": "Aggregated project state returned"
}
```

---

### `pm rules`

**Rules management.** Manage the rules engine — list, add, remove, enable, disable, toggle, show, and reload rules. All rules are stored in `~/.config/pm-agent/rules.toml`.

**Usage:**

```bash
pm rules <subcommand> [options]
```

**Subcommands:**

| Subcommand       | Description                                   |
| ---------------- | --------------------------------------------- |
| `list`           | List all rules, optionally filtered           |
| `add`            | Add a new rule (interactive or with flags)    |
| `remove <name>`  | Delete a rule                                 |
| `enable <name>`  | Enable a disabled rule                        |
| `disable <name>` | Disable a rule without deleting it            |
| `toggle <name>`  | Toggle a rule's enabled state                 |
| `show <name>`    | Show full details for a specific rule         |
| `reload`         | Reload rules from disk (pick up manual edits) |

---

#### `pm rules list`

**Usage:**

```bash
pm rules list [options]
```

**Flags:**

| Flag         | Alias | Type      | Default | Description                                    |
| ------------ | ----- | --------- | ------- | ---------------------------------------------- |
| `--scope`    | `-s`  | `string`  | —       | Filter by scope: `pm`, `code`, `all`           |
| `--enabled`  | `-e`  | `boolean` | —       | Show only enabled rules                        |
| `--disabled` | `-d`  | `boolean` | —       | Show only disabled rules                       |
| `--verbose`  | `-V`  | `boolean` | `false` | Show detailed info including source file lines |

**Examples:**

```bash
# List all rules
pm rules list

# List only PM-scoped rules
pm rules list --scope pm

# List only code-scoped rules
pm rules list --scope code

# List only enabled rules
pm rules list --enabled

# List only disabled rules
pm rules list --disabled

# Verbose listing with source info
pm rules list --verbose
```

**Output:**

```
$ pm rules list

  ┌──────────────────────────────────┬────────┬──────────┬──────────┐
  │ Name                             │ Scope  │ Severity │ Enabled  │
  ├──────────────────────────────────┼────────┼──────────┼──────────┤
  │ decision-before-close            │ pm     │ hard     │ ✓        │
  │ scope-check                      │ pm     │ soft     │ ✓        │
  │ daily-blocker-check              │ pm     │ info     │ ✓        │
  │ meeting-prep                     │ all    │ info     │ ✓        │
  │ no-any-in-shared                 │ code   │ hard     │ ✓        │
  │ tests-before-merge               │ code   │ hard     │ ✓        │
  │ strict-tsconfig                  │ code   │ hard     │ ✓        │
  │ no-console-log                   │ code   │ soft     │ ✓        │
  │ stale-pr                         │ all    │ soft     │ ✓        │
  │ review-before-merge              │ code   │ hard     │ ✗        │
  └──────────────────────────────────┴────────┴──────────┴──────────┘

  10 rules loaded from ~/.config/pm-agent/rules.toml
```

```
$ pm rules list --scope pm

  ┌──────────────────────┬────────┬──────────┬──────────┐
  │ Name                 │ Scope  │ Severity │ Enabled  │
  ├──────────────────────┼────────┼──────────┼──────────┤
  │ decision-before-close│ pm     │ hard     │ ✓        │
  │ scope-check          │ pm     │ soft     │ ✓        │
  │ daily-blocker-check  │ pm     │ info     │ ✓        │
  └──────────────────────┴────────┴──────────┴──────────┘
```

```
$ pm rules list --disabled

  ┌──────────────────────┬────────┬──────────┬──────────┐
  │ Name                 │ Scope  │ Severity │ Enabled  │
  ├──────────────────────┼────────┼──────────┼──────────┤
  │ review-before-merge  │ code   │ hard     │ ✗        │
  └──────────────────────┴────────┴──────────┴──────────┘
```

```
$ pm rules list --verbose

  ┌──────────────────────────────────┬────────┬──────────┬──────────┬──────────┐
  │ Name                             │ Scope  │ Severity │ Enabled  │ Source   │
  ├──────────────────────────────────┼────────┼──────────┼──────────┼──────────┤
  │ decision-before-close            │ pm     │ hard     │ ✓        │ :12      │
  │ scope-check                      │ pm     │ soft     │ ✓        │ :20      │
  │ daily-blocker-check              │ pm     │ info     │ ✓        │ :28      │
  │ meeting-prep                     │ all    │ info     │ ✓        │ :36      │
  │ no-any-in-shared                 │ code   │ hard     │ ✓        │ :44      │
  │ tests-before-merge               │ code   │ hard     │ ✓        │ :52      │
  │ strict-tsconfig                  │ code   │ hard     │ ✓        │ :60      │
  │ no-console-log                   │ code   │ soft     │ ✓        │ :68      │
  │ stale-pr                         │ all    │ soft     │ ✓        │ :76      │
  │ review-before-merge              │ code   │ hard     │ ✗        │ :84      │
  └──────────────────────────────────┴────────┴──────────┴──────────┴──────────┘
```

---

#### `pm rules add`

**Usage:**

```bash
pm rules add <name> [options]
```

**Arguments:**

| Argument | Required | Description                 |
| -------- | -------- | --------------------------- |
| `<name>` | Yes      | Unique kebab-case rule name |

**Flags:**

| Flag            | Alias | Type     | Required? | Description                          |
| --------------- | ----- | -------- | --------- | ------------------------------------ |
| `--scope`       | `-s`  | `string` | Yes       | Scope: `pm`, `code`, or `all`        |
| `--trigger`     | `-t`  | `string` | Yes       | Trigger expression                   |
| `--condition`   | `-c`  | `string` | No        | Condition expression                 |
| `--action`      | `-a`  | `string` | Yes       | Action in format `"type: 'message'"` |
| `--severity`    | `-S`  | `string` | Yes       | Severity: `hard`, `soft`, or `info`  |
| `--description` | `-d`  | `string` | No        | Human-readable description           |

**Examples:**

```bash
# Add a rule with all required flags
pm rules add "no-console-log" \
  --scope code \
  --trigger "file.saved" \
  --condition "file.path == 'src/**/*.ts' && file.contains('console.log')" \
  --action "suggest: 'Remove console.log before committing'" \
  --severity soft \
  --description "Remind developers to remove debugging console.log statements"

# Add a rule with no condition
pm rules add "stale-pr" \
  --scope all \
  --trigger "pr.age > 48h" \
  --action "notify: 'PR {pr.id} needs review'" \
  --severity info

# Interactive mode (no flags)
pm rules add
```

**Output:**

```
$ pm rules add enforce-import-order \
  --scope code \
  --trigger "file.saved" \
  --condition "file.path == 'src/**/*.ts'" \
  --action "suggest: 'Sort imports in {file.path} according to project convention'" \
  --severity soft

  → Rule 'enforce-import-order' added and enabled.

  ┌──────────────────────┬────────┬──────────┬──────────┐
  │ Name                 │ Scope  │ Severity │ Enabled  │
  ├──────────────────────┼────────┼──────────┼──────────┤
  │ enforce-import-order │ code   │ soft     │ ✓        │
  └──────────────────────┴────────┴──────────┴──────────┘

  11 rules loaded from ~/.config/pm-agent/rules.toml
```

**Interactive add flow:**

```
$ pm rules add
  → Name: enforce-import-order
  → Scope: [pm/code/all] code
  → Trigger: file.saved
  → Condition (optional): file.path == 'src/**/*.ts'
  → Action type: [block/confirm/notify/suggest/generate] suggest
  → Action message: 'Sort imports in {file.path} according to project convention'
  → Severity: [hard/soft/info] soft
  → Description (optional): Enforce consistent import ordering in source files

  Preview:
  ┌──────────────────────┬────────┬──────────┬──────────┐
  │ Name                 │ Scope  │ Severity │ Enabled  │
  ├──────────────────────┼────────┼──────────┼──────────┤
  │ enforce-import-order │ code   │ soft     │ ✓        │
  └──────────────────────┴────────┴──────────┴──────────┘

  Add this rule? [Y/n] > y
  → Rule 'enforce-import-order' added and enabled.
```

---

#### `pm rules remove`

**Usage:**

```bash
pm rules remove <name>
```

**Example:**

```
$ pm rules remove enforce-import-order
  → Rule 'enforce-import-order' removed from ~/.config/pm-agent/rules.toml.
```

---

#### `pm rules enable`

**Usage:**

```bash
pm rules enable <name>
```

**Example:**

```
$ pm rules enable review-before-merge
  → Rule 'review-before-merge' enabled. It will be evaluated on matching triggers.
```

---

#### `pm rules disable`

**Usage:**

```bash
pm rules disable <name>
```

**Example:**

```
$ pm rules disable no-console-log
  → Rule 'no-console-log' disabled. It will not be evaluated until re-enabled.
```

---

#### `pm rules toggle`

**Usage:**

```bash
pm rules toggle <name>
```

**Example:**

```
$ pm rules toggle stale-pr
  → Rule 'stale-pr' disabled. (was enabled)

$ pm rules toggle stale-pr
  → Rule 'stale-pr' enabled. (was disabled)
```

---

#### `pm rules show`

**Usage:**

```bash
pm rules show <name>
```

**Example:**

```
$ pm rules show stale-pr

  ┌─────────────┬──────────────────────────────────────────┐
  │ Name        │ stale-pr                                 │
  │ Scope       │ all                                      │
  │ Trigger     │ pr.age > 48h                             │
  │ Condition   │ pr.reviews == 0                          │
  │ Action      │ suggest                                  │
  │ Message     │ PR {pr.id} ({pr.title}) has been         │
  │             │ open {pr.age} with no reviews.           │
  │             │ Consider pinging {pr.author}.            │
  │ Severity    │ soft                                     │
  │ Enabled     │ yes                                      │
  │ Description │ Alert when PR open 48h+ with no reviews  │
  │ Source      │ ~/.config/pm-agent/rules.toml:76         │
  └─────────────┴──────────────────────────────────────────┘
```

---

#### `pm rules reload`

**Usage:**

```bash
pm rules reload
```

**Example:**

```
$ pm rules reload
  → Rules reloaded from ~/.config/pm-agent/rules.toml
  → 11 rules loaded (1 new, 0 removed, 2 modified)
  → Previously disabled rules retain their state.
```

**Related MCP tool:** `pm_add_rule`, `pm_enforce_rules`

```json
{
  "tool": "pm_add_rule",
  "input": {
    "name": "no-console-log",
    "scope": "code",
    "trigger": "file.saved",
    "condition": "file.path == 'src/**/*.ts' && file.contains('console.log')",
    "action": "suggest: 'Remove console.log before committing'",
    "severity": "soft"
  },
  "output": "Rule 'no-console-log' added and enabled"
}
```

```json
{
  "tool": "pm_enforce_rules",
  "input": {
    "context": { "blockers": { "count": 2 } },
    "scope": "pm"
  },
  "output": "Enforcement results: 1 triggered, 0 blocked"
}
```

---

## Interactive Mode

The `confirm:` action type triggers interactive prompts. When the rules engine evaluates a rule with action type `confirm`, it pauses and asks the user to approve or reject the operation.

### Prompt Types

**Y/n — Simple confirmation:**

The most common prompt. User types `y` or `n` (or presses Enter for the default).

```
  ⚠ Rule 'scope-check' fired: soft confirmation
  → Adding "dark mode" adds 5 days to a sprint with only 4 days remaining.

  Confirm? [Y/n] > n
  Action cancelled.
```

**Y/n/details — Confirmation with detail view:**

Some confirmation prompts offer a `details` option that shows additional context before deciding.

```
  Confirm? [Y/n/details] > details

  ┌─── Sprint 14 – detailed breakdown ─────────────────────┐
  │  Committed:  AUTH-91 (3d), AUTH-92 (3d), AUTH-93 (2d) │
  │  Impact:     Dark mode adds 5d (150% over capacity)    │
  │  Options:    Defer to sprint 15 (recommended)          │
  └────────────────────────────────────────────────────────┘

  Confirm anyway? [Y/n] > n
```

**Select — Multiple choice:**

Some prompts present a selection menu.

```
  ? Blocker BLK-003 can be resolved by:
    ❯ Mark as resolved
      Reassign to @backend-lead
      Add comment
      Cancel
```

**Input — Freeform text:**

Rare, but used when the rule needs additional input.

```
  ? Add a note explaining why you're overriding the scope check:
  > Stakeholder approved the timeline extension
```

### Non-TTY Behavior

When `pm` detects that stdout is **not** a TTY (piped output, CI/CD, cron jobs), interactive prompts are **blocked** by default:

```
  ⚠ Confirm action required, but running in non-TTY mode.
  → Rule 'scope-check' requires confirmation to proceed.
  → Use --yes to auto-confirm, or --json to get the confirmation request.

  Aborted. (exit code 2)
```

To bypass in scripts:

```bash
# Auto-confirm (use with caution)
pm scope "Add dark mode" --yes

# Or use JSON mode to inspect and handle programmatically
pm scope "Add dark mode" --json
```

---

## Output Formats

### Default (colored tables)

By default, `pm` uses `chalk` for colors, `ora` for spinners, and formatted tables with box-drawing characters.

| Element    | Color       | Example                              |
| ---------- | ----------- | ------------------------------------ |
| Success    | Green       | `✓ Decision logged as ADR-004`       |
| Warning    | Yellow      | `⚠ Rule 'scope-check' fired`         |
| Error      | Red         | `[ERROR] Rule blocked the operation` |
| Info       | Cyan        | `[INFO] daily-blocker-check: ...`    |
| Suggestion | Green       | `[SUGGEST] Remove console.log...`    |
| Tables     | White on bg | Box-drawn table grids                |
| Spinners   | Cyan        | `Scanning... [████████████]`         |

### `--json` (machine parsing)

Every command supports `--json` for structured output. JSON output implies `--quiet` (no spinners, no colors, no ASCII art).

```bash
# Pipe JSON into jq for processing
pm blockers --json | jq '.blockers | length'
# → 2

pm status --json | jq '.sprint.risk'
# → "MEDIUM"

pm search "TODO" --json | jq '.results | .[] | .path'
# → "src/auth/service.ts"
# → "src/utils/jwt.ts"
```

### `--quiet` (scripts)

The `--quiet` flag suppresses spinners, intro banners, and decorative output. Commands print only the essential information.

```bash
pm scan --quiet
# → 1,234 files indexed (12 new, 47 modified)

pm standup --quiet
# (prints summary without intro/outro)

pm blockers --quiet
# → 2

pm log "Drop OAuth" --quiet
# → ADR-004
```

---

## Exit Codes

| Code | Meaning       | Description                                                                        |
| :--: | ------------- | ---------------------------------------------------------------------------------- |
| `0`  | Success       | Command completed successfully. No errors, no blocks                               |
| `1`  | General error | Unexpected error: missing config, DB connection failed, unhandled exception        |
| `2`  | Rule blocked  | A `hard` severity rule blocked the operation. The action was not performed         |
| `3`  | Config error  | Configuration file missing, malformed, or invalid. TOML parse error, invalid field |

### Examples

```bash
$ pm log "Drop OAuth"
# → Success (exit 0)

$ pm status
# → Success (exit 0)

$ pm scope "Add dark mode" --impact 5 --remaining 4
# → Confirmation required (exit 0 — intentional cancel)

$ pm log --ticket AUTH-91
# → Error: missing required argument 'title' (exit 1)

$ pm scope "Add dark mode"
# → Rule blocked (exit 2)

$ pm --config /nonexistent/config.toml status
# → Config file not found (exit 3)
```

### Using exit codes in scripts

```bash
#!/bin/bash
# Check if a change is safe before committing

pm scope "Add 5-day feature" --impact 5 --yes
case $? in
  0) echo "✓ Scope accepted, proceeding" ;;
  2) echo "✗ Blocked by rules engine"    ;;
  3) echo "✗ Config error, fix pm setup" ;;
  *) echo "✗ Unexpected error"           ;;
esac
```

---

## Shell Completion

Shell completion for `bash` and `zsh` is **planned** for a future release. When available:

### Bash

```bash
# Add to ~/.bashrc
source <(pm completion bash)
```

### Zsh

```zsh
# Add to ~/.zshrc
source <(pm completion zsh)

# Or install to a completion directory
pm completion zsh > /usr/local/share/zsh/site-functions/_pm
```

### What completion covers

Once implemented, completion will provide:

- Command names: `pm <TAB>` → `init`, `scan`, `log`, `blockers`, ...
- Subcommand names: `pm rules <TAB>` → `list`, `add`, `remove`, ...
- Flag names: `pm log --<TAB>` → `--body`, `--author`, `--link`, ...
- File paths: `pm depends <TAB>` → `src/auth/`, `src/user/`, ...
- Rule names: `pm rules show <TAB>` → `decision-before-close`, `scope-check`, ...
- Scope values: `pm rules list --scope <TAB>` → `pm`, `code`, `all`
- Severity values: `pm rules add --severity <TAB>` → `hard`, `soft`, `info`

---

## Common Workflows

### Getting Started

Complete first-time setup for a new project:

```bash
# 1. Install
npm install -g pm-agent

# 2. Navigate to your project
cd ~/projects/my-app

# 3. Initialize (detects project name, git remote, creates DB)
pm init

# 4. Full codebase scan
pm scan --full

# 5. Check your project status
pm status

# 6. Log your first decision
pm log "Adopt PM Agent for project management"

# 7. View the architecture overview
pm arch
```

### Morning Check-In

Daily routine to orient yourself:

```bash
# 1. Quick project status
pm status

# 2. Check active blockers
pm blockers

# 3. See what's going on
pm standup --yesterday 24h

# 4. Search for anything left pending
pm search "TODO"

# 5. Check sprint capacity
pm scope "Morning review" --committed 10 --remaining 4
```

### Code Review Prep

Before reviewing a pull request, understand context:

```bash
# 1. What does the changed file depend on?
pm depends src/auth/service.ts

# 2. What breaks if this changes?
pm impact src/auth/service.ts

# 3. What PM context is relevant?
pm search "auth" --scope docs

# 4. Any blockers related to this area?
pm blockers
```

### Sprint Planning

```bash
# 1. Review current sprint status
pm status

# 2. Check out the architecture to understand scope
pm arch

# 3. Search for pending decisions
pm search "decision" --scope docs

# 4. Review blockers to unstick before planning
pm blockers --all

# 5. Log planning decisions
pm log "Sprint 15 scope finalized" \
  --body "Focus on auth refactor + dark mode MVP" \
  --link AUTH-91 \
  --link AUTH-92
```

### Troubleshooting a File

When you encounter a problematic file:

```bash
# 1. See what touches it
pm depends path/to/file.ts

# 2. Full impact analysis
pm impact path/to/file.ts

# 3. Search for related references
pm search "functionName" --type source

# 4. Check if there are related blockers
pm blockers --all | grep file.ts

# 5. Quick note about the issue
pm note "file.ts has a bug in the caching layer" --tag bug --link TASK-042
```

---

## Scripting with pm

### CI/CD Pipelines

Use `--json` to integrate pm checks into CI workflows:

```yaml
# .github/workflows/pm-checks.yml
name: PM Agent Checks
on: [pull_request]

jobs:
  pm-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4

      - name: PM Agent — Init
        run: npx pm-agent init --force --scan
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: PM Agent — Check Scope
        run: |
          npx pm-agent scope "PR changes" \
            --impact ${{ github.event.pull_request.additions / 100 }} \
            --committed 10 --remaining 5 --yes
        id: scope-check

      - name: PM Agent — Scan for issues
        run: |
          npx pm-agent scan --verify
          npx pm-agent search "TODO" --json --type source
```

### Git Hooks

Pre-commit hook to catch rule violations early:

```bash
#!/bin/bash
# .git/hooks/pre-commit — PM Agent pre-commit check

# Check for any scanning issues on staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -n "$STAGED_FILES" ]; then
  # Run a quick incremental scan
  pm scan --quiet

  # Check for any known blockers related to changed files
  for file in $STAGED_FILES; do
    pm impact "$file" --json 2>/dev/null | jq -e '.total_affected > 0' > /dev/null
    if [ $? -eq 0 ]; then
      echo "⚠  Warning: $file has $($pm impact "$file" --json | jq '.total_affected') dependents."
      echo "   Run 'pm impact $file' for details."
    fi
  done
fi

exit 0
```

### Cron Jobs

Schedule daily standups and blocker checks:

```bash
# crontab — daily PM Agent checks

# 9 AM — standup reminder with blocker check
0 9 * * 1-5 cd ~/projects/my-app && pm standup >> ~/standup.log 2>&1

# 10 AM — check stale PRs and blockers
0 10 * * 1-5 cd ~/projects/my-app && pm blockers --json | \
  jq -r '.blockers[] | "\(.id): \(.title) (\(.age_hours)h)"' | \
  mail -s "Daily Blocker Report" team@example.com

# Midnight — full scan to keep index fresh
0 0 * * * cd ~/projects/my-app && pm scan --quiet >> ~/pm-scan.log 2>&1
```

### Slack/Discord Notifications

Pipe JSON output into webhook payloads:

```bash
#!/bin/bash
# pm-notify — Send blocker summary to Slack

BLOCKERS=$(pm blockers --json)

COUNT=$(echo "$BLOCKERS" | jq '.active')
if [ "$COUNT" -gt 0 ]; then
  MESSAGE=$(echo "$BLOCKERS" | jq -r '.blockers[] | "• \(.id): \(.title) (\(.age_hours)h)"' | paste -sd '\n' -)

  curl -X POST -H "Content-type: application/json" \
    --data "{
      \"text\": \"*PM Agent — Daily Blocker Report*\n$MESSAGE\"
    }" \
    "$SLACK_WEBHOOK_URL"
fi
```

### Batch Decisions

Log multiple decisions from a script:

```bash
#!/bin/bash
# batch-import-decisions — Import decisions from a CSV file
# Format: title,body,author,ticket

cat decisions.csv | while IFS=, read title body author ticket; do
  pm log "$title" \
    --body "$body" \
    --author "$author" \
    --ticket "$ticket" \
    --quiet

  echo "  → Logged decision for $ticket"
done
```

### Monitoring Script

Track project health over time:

```bash
#!/bin/bash
# pm-health — Collect project metrics for dashboard

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Gather metrics
STATUS=$(pm status --json)
BLOCKERS=$(pm blockers --json)

# Extract values
BLOCKER_COUNT=$(echo "$BLOCKERS" | jq '.active')
DECISION_COUNT=$(echo "$STATUS" | jq '.decisions_total')
FILES_INDEXED=$(echo "$STATUS" | jq '.codebase.files_indexed')
SPRINT_RISK=$(echo "$STATUS" | jq -r '.sprint.risk')

# Log to a metrics file
echo "$TIMESTAMP | blockers=$BLOCKER_COUNT | decisions=$DECISION_COUNT | files=$FILES_INDEXED | risk=$SPRINT_RISK" >> ~/pm-metrics.log

# Alert on high risk
if [ "$SPRINT_RISK" = "HIGH" ] || [ "$BLOCKER_COUNT" -gt 5 ]; then
  echo "⚠  Alert: High risk or too many blockers"
  pm blockers
fi
```

---

## Quick Reference Card

```bash
# ── Setup ─────────────────────────────────────────────────────
pm init                          # First-time setup
pm init --force                  # Reinitialize from scratch
pm init --scan                   # Init + full codebase scan

# ── Codebase Intelligence ─────────────────────────────────────
pm scan                          # Incremental scan (default)
pm scan --full                   # Cold-start full scan
pm scan --watch                  # Continuous file watching
pm scan --verify                 # Check for missed files
pm depends <path>                # Show dependency graph
pm depends <path> --depth 3      # Transitive deps
pm depends <path> --reverse      # Only what imports it
pm impact <path>                 # Impact analysis
pm impact <path> --depth 3       # Deeper transitive scan
pm search <query>                # Full-text search
pm search <query> --scope docs   # Docs-only search
pm search <query> --type test    # Tests-only search
pm arch                          # Architecture overview

# ── PM Commands ───────────────────────────────────────────────
pm log "<title>"                 # Log a decision (ADR)
pm log "<title>" --body "..."    # With body text
pm log "<title>" --link TICKET   # Link to ticket
pm note "<content>"              # Quick capture
pm note "<content>" --tag tag    # With tags
pm blockers                      # List active blockers
pm blockers --resolve BLK-001    # Mark resolved
pm blockers --age 48h            # Filter by min age
pm scope "<work>"                # Sprint scope check
pm scope "<work>" --impact 5     # With explicit effort
pm standup                       # Generate standup
pm standup --yesterday 3d        # Custom lookback

# ── Rules ─────────────────────────────────────────────────────
pm rules list                    # List all rules
pm rules list --scope pm         # Filter by scope
pm rules add <name> ...          # Add a rule
pm rules remove <name>           # Delete a rule
pm rules enable <name>           # Enable a rule
pm rules disable <name>          # Disable a rule
pm rules toggle <name>           # Toggle state
pm rules show <name>             # Show rule details
pm rules reload                  # Reload from disk

# ── Dashboard ─────────────────────────────────────────────────
pm status                        # Project state overview
pm files --type source           # List source files
pm files --unindexed             # Show files not in index

# ── Output Control ────────────────────────────────────────────
pm <command> --json              # JSON output
pm <command> --quiet             # Minimal output
pm <command> --verbose           # Detailed/debug output
```
