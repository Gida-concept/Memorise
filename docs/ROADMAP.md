# PM Agent -- Roadmap

> Where the project has been, where it's going, and what it takes to get there.

---

## Overview

PM Agent is in **pre-release** phase. The architecture and product design are complete (see `architecture.md` and `README.md`). All v0.1 features have been implemented across 9 build phases. This document tracks progress and the forward roadmap.

**v0.1 "Foundation"** — a fully functional local-first PM tool with SQLite memory, a TOML rules engine, a CLI, an MCP server, GitHub and Linear integrations, codebase intelligence, and publishing pipeline. The project is usable by individual developers and small teams running their AI agents locally.

All dates are relative and will be revised as work progresses.

---

## v0.1 "Foundation" -- Current Build Target

> The core that everything else stacks on. Local-first, single-user, CLI + MCP.

**Target: Q3 2026**

### Memory Layer (SQLite)

| Item                                                                     | Status |
| ------------------------------------------------------------------------ | ------ |
| SQLite database wrapper (`better-sqlite3`) with schema migrations        | ✅     |
| Decision records table (`decisions`) -- ADR-style structured logging     | ✅     |
| Blockers table (`blockers`) -- open/resolved tracking with age           | ✅     |
| Notes table (`notes`) -- freeform capture with tag auto-detection        | ✅     |
| Tasks table (`tasks`) -- todo/in_progress/blocked/done state machine     | ✅     |
| Scope snapshots table (`scope_snapshots`) -- sprint capacity + risk      | ✅     |
| Entity graph (`graph.ts`) -- cross-table traversal via `linked_entities` | ✅     |

### Rules Engine (TOML)

| Item                                                                                                 | Status |
| ---------------------------------------------------------------------------------------------------- | ------ |
| TOML rule definition format (scope, trigger, condition, action, severity)                            | ✅     |
| Lightweight expression parser (property access, comparisons, boolean logic, `.contains()`, `.count`) | ✅     |
| Rule evaluator -- trigger matching, condition checking, action dispatch                              | ✅     |
| Three severity levels: `hard` (block), `soft` (confirm), `info` (notify)                             | ✅     |
| Scope filtering (`pm` / `code` / `all`)                                                              | ✅     |
| Template interpolation in action messages (`{ticket.id}`, `{blockers.count}`)                        | ✅     |

### CLI

| Item                                                                            | Status |
| ------------------------------------------------------------------------------- | ------ |
| `pm init` -- first-time setup (config dirs, DB creation, integration detection) | ✅     |
| `pm log <text>` -- log a decision through the rules engine                      | ✅     |
| `pm blockers` -- list active blockers                                           | ✅     |
| `pm scope <change>` -- sprint scope check with risk assessment                  | ✅     |
| `pm standup` -- generate standup summary from recent state                      | ✅     |
| `pm note <text>` -- quick capture with auto-linking                             | ✅     |
| `pm status` -- project state overview dashboard                                 | ✅     |
| `pm rules` -- list/add/remove/enable/disable rules                              | ✅     |
| Interactive prompts (Inquirer) for confirmations and selections                 | ✅     |
| Styled output (Chalk, Ora spinners, table formatting)                           | ✅     |

### MCP Server

| Item                                                                          | Status |
| ----------------------------------------------------------------------------- | ------ |
| Server setup with `@modelcontextprotocol/sdk` (stdio transport)               | ✅     |
| `pm_get_context` -- aggregated project state snapshot                         | ✅     |
| `pm_get_blockers` -- active blockers                                          | ✅     |
| `pm_get_decisions` -- decision records                                        | ✅     |
| `pm_get_notes` -- notes with optional filter                                  | ✅     |
| `pm_get_scope` -- latest scope snapshot                                       | ✅     |
| `pm_get_standup` -- standup summary                                           | ✅     |
| `pm_prep_meeting` -- meeting brief with context                               | ✅     |
| `pm_log_decision` -- create decision record (active enforcement)              | ✅     |
| `pm_log_note` -- create note with auto-linking                                | ✅     |
| `pm_check_scope` -- risk assessment for proposed changes (active enforcement) | ✅     |
| `pm_add_rule` -- add a rule from AI suggestion                                | ✅     |
| `pm_enforce_rules` -- run all matching rules against current context          | ✅     |

### GitHub Integration

| Item                                                                    | Status |
| ----------------------------------------------------------------------- | ------ |
| REST API client for PRs and issues                                      | ✅     |
| Auto-detection via `git remote -v` during `pm init`                     | ✅     |
| Token-based auth (`GITHUB_TOKEN` env var or OS keychain)                | ✅     |
| Fetch open PRs (age, review count, author) into blocker/decision tables | ✅     |
| Fetch open issues into task/decision tables                             | ✅     |

### Linear Integration

| Item                                                                  | Status |
| --------------------------------------------------------------------- | ------ |
| GraphQL API client (`issues()`, `teams()`, `projects()`)              | ✅     |
| Workspace detection during `pm init`                                  | ✅     |
| API key auth (`LINEAR_API_KEY` env var or OS keychain)                | ✅     |
| Sync tickets (status, assignee, team, sprint) into tasks and blockers | ✅     |

### Codebase Intelligence

| Item                                                                                                           | Status |
| -------------------------------------------------------------------------------------------------------------- | ------ |
| File registry -- recursive walk, SHA-256 hashing, type classification (`source`/`test`/`doc`/`config`/`asset`) | ✅     |
| Dependency mapper -- shell-out to ripgrep for import matching, madge for circular detection                    | ✅     |
| Architecture detector -- entry points, framework detection, layer patterns                                     | ✅     |
| Change watcher -- `fs.watch`-based incremental re-scanning                                                     | ✅     |
| Impact analyzer -- reverse dependency traversal with PM context linking                                        | ✅     |
| Documentation indexer -- README/docs parsing into SQLite FTS5                                                  | ✅     |
| `pm scan [--full] [--watch] [--verify]` -- scan and index the codebase                                         | ✅     |
| `pm depends <path>` -- dependency graph for a file                                                             | ✅     |
| `pm impact <path>` -- impact analysis with linked PM context                                                   | ✅     |
| `pm search <query>` -- full-text search across code and docs                                                   | ✅     |
| `pm arch` -- architecture overview                                                                             | ✅     |
| `pm files [--type] [--unindexed]` -- list indexed files                                                        | ✅     |
| MCP tools for codebase intelligence (scan, dependency graph, impact, search, architecture, file context)       | ✅     |

### Project Infrastructure

| Item                                                                                    | Status |
| --------------------------------------------------------------------------------------- | ------ |
| npm workspaces monorepo layout (`packages/core`, `packages/cli`, `packages/mcp-server`) | ✅     |
| TypeScript strict mode project-wide                                                     | ✅     |
| tsup build config (CJS + ESM + dts)                                                     | ✅     |
| Vitest test suite with per-module test files                                            | ✅     |
| Default `rules.toml` and `config.toml` shipped with package                             | ✅     |
| Complete README, architecture docs, ROADMAP                                             | ✅     |
| CI/CD pipeline (GitHub Actions)                                                         | ✅     |

---

## v0.2 "Integrations & Desktop"

> Connect to the tools PMs actually live in. Add desktop surfaces for ambient presence.

**Target: Q1 2027**

### Slack Integration

| Item                                                                                | Status |
| ----------------------------------------------------------------------------------- | ------ |
| Slack API client (Web API + Events API)                                             | 📋     |
| Decision detection in Slack messages (keyword + context heuristics)                 | 📋     |
| Blocker alert surfacing (automatic notification when blocker age exceeds threshold) | 📋     |
| `/pm` slash command for querying state from Slack                                   | 📋     |
| Thread linking -- attach Slack threads to decisions/notes                           | 📋     |

### Notion Integration

| Item                                                     | Status |
| -------------------------------------------------------- | ------ |
| Notion API client                                        | 📋     |
| Doc linking -- link decisions and notes to Notion pages  | 📋     |
| Auto-sync PM context to a Notion dashboard page (opt-in) | 📋     |

### Jira Integration

| Item                                            | Status |
| ----------------------------------------------- | ------ |
| Jira REST API client                            | 📋     |
| Issue sync (status, assignee, sprint, priority) | 📋     |
| Decision/blocker linking to Jira tickets        | 📋     |

### VS Code Extension

| Item                                                           | Status |
| -------------------------------------------------------------- | ------ |
| Extension scaffold (package.json, activation events, commands) | 📋     |
| Sidebar panel with blockers, decisions, scope overview         | 📋     |
| Inline rule enforcement on file save (code-scope rules)        | 📋     |
| Status bar indicator (blocker count, sprint risk)              | 📋     |
| Quick capture via command palette (`PM: Log Note`)             | 📋     |
| MCP transport integration (communicates with local MCP server) | 📋     |

### macOS Menubar (Electron/Tauri)

| Item                                                          | Status |
| ------------------------------------------------------------- | ------ |
| Menubar app scaffold                                          | 📋     |
| Blocker indicator icon (color changes based on blocker count) | 📋     |
| Quick capture window (global hotkey)                          | 📋     |
| Standup summary at a glance                                   | 📋     |

### Team Sync

| Item                                     | Status |
| ---------------------------------------- | ------ |
| Encrypted sync protocol (AES-256-GCM)    | 💡     |
| Opt-in team workspace sharing            | 💡     |
| Conflict resolution for concurrent edits | 💡     |

---

## v0.3 "AI-Native PM"

> Let the machine do the synthesis. PM Agent graduates from passive memory to active insight.

**Target: Q3 2027**

### AI-Generated Standup Summaries

| Item                                                           | Status |
| -------------------------------------------------------------- | ------ |
| NLP-based standup generation from decision/blocker/note deltas | 💡     |
| Sentiment and momentum indicators across sprints               | 💡     |
| Automatic highlight detection ("what actually shipped")        | 💡     |

### Automatic Sprint Risk Detection

| Item                                                     | Status |
| -------------------------------------------------------- | ------ |
| Burndown trend analysis against committed scope          | 💡     |
| Blocker aging curves -- predict which blockers will slip | 💡     |
| Capacity vs. remaining work ratio alerts                 | 💡     |

### Decision Conflict Detection

| Item                                                                                      | Status |
| ----------------------------------------------------------------------------------------- | ------ |
| Cross-decision contradiction scanning ("ADR-003 says X, but note from 2026-07-15 says Y") | 💡     |
| Stale decision flagging (decisions older than N days without review)                      | 💡     |

### Predictive Blocker Resolution

| Item                                                                    | Status |
| ----------------------------------------------------------------------- | ------ |
| Historical resolution pattern analysis                                  | 💡     |
| "Who can unblock this?" suggestion based on past resolution assignments | 💡     |

### Meeting Transcription Integration

| Item                                                                  | Status |
| --------------------------------------------------------------------- | ------ |
| Transcript ingestion from meeting tools (Zoom, Google Meet, Otter.ai) | 💡     |
| Auto-extraction of decisions and action items from transcripts        | 💡     |

### Web UI

| Item                                   | Status |
| -------------------------------------- | ------ |
| Read-only project overview dashboard   | 💡     |
| Filterable blocker/decision/note views | 💡     |
| Sprint burnup chart                    | 💡     |

---

## v1.0 "Production Ready"

> Enterprise-grade stability, performance, and extensibility. PM Agent is ready for org-wide adoption.

**Target: Q1 2028**

| Item                                                                                       | Status |
| ------------------------------------------------------------------------------------------ | ------ |
| **Enterprise SSO** -- SAML/OIDC auth for team sync workspaces                              | 💡     |
| **Team management** -- role-based access, workspace administration                         | 💡     |
| **Performance benchmarks** -- sub-50ms response for all MCP tools on 10K+ file projects    | 💡     |
| **API stability guarantees** -- semantic versioning, migration guides, deprecation windows | 💡     |
| **Plugin system** -- public API for custom integrations (any tool, any transport)          | 💡     |
| **Cursor extension** -- MCP-first integration with Cursor's AI sidebar                     | 💡     |
| **Raycast extension** -- quick capture, blocker lookup, standup trigger from Raycast       | 💡     |
| **Windows menubar equivalent** -- system tray blocker indicator                            | 💡     |
| **Documentation site** -- full reference docs, guides, migration paths                     | 💡     |

---

## Legend

| Mark           | Meaning                             |
| -------------- | ----------------------------------- |
| ✅ Done        | Shipped and stable                  |
| 🔧 In Progress | Being worked on now                 |
| 📋 Planned     | Spec'd and in the backlog           |
| 💡 Idea        | Concept phase -- design not started |

---

_This roadmap is a living document. Priorities shift, ideas get replaced by better ones, and dates move. What doesn't change: PM Agent ships when it's useful, not when it's complete._
