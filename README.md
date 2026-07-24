```
                           ╭──────────────────────╮
                           │     PM AGENT         │
                           │  memory · rules · cli │
                           ╰──────────┬───────────╯
                                      │
        ┌─────────────┬───────────────┼───────────────┬─────────────┐
        │             │               │               │             │
    ╭───┴───╮    ╭───┴───╮       ╭───┴───╮       ╭───┴───╮    ╭───┴───╮
    │  CLI  │    │  IDE  │       │ HOOKS │       │ FILE  │    │  WEB  │
    ╰───┬───╯    ╰───┬───╯       ╰───┬───╯       ╰───┬───╯    ╰───┬───╯
        │             │               │               │             │
        └────────┬────┘               │               └──────┬──────┘
                 │                    │                      │
         ╔═══════╧════════════════════╧══════════════════════╧═══════╗
         ║                     RULES ENGINE                         ║
         ║           trigger → condition → action                  ║
         ╚═══════════════════════════════════════════════════════════╝
                                  │
         ┌────────────────────────┼────────────────────────────┐
         │                        │                            │
    ═════╧════════════════════════╧════════════════════════════╧═════
        🐙     PM AGENT   —   8  T E N T A C L E S ,  0  B . S .

                    🐙  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  🐙
              🐙  GitHub  ·  Linear  ·  Slack  ·  Terminal  ·  IDE  🐙
           Notion  ·  Jira  ·  Figma  ·  Filesystem  ·  Calendar  🐙
                    🐙  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  🐙

```

# PM Agent 🐙 — Memory & Rules for AI-Native Product Management

> A context-aware memory layer and rules engine that lives in your terminal, IDE, and desktop. It doesn't think — it **remembers, directs, and enforces** so your AI can stay focused on execution.

---

## The Problem

Product managers live across Slack, GitHub, Figma, Notion, Linear, and a dozen other tools. Context is fragmented. Decisions get lost. Blockers surface too late. Scope creep happens silently. And every PM tool is just another dashboard to check.

Meanwhile, AI agents in your CLI and IDE are getting smarter — but they have **no memory of your project**, **no understanding of your rules**, and **no sense of what matters right now**. They can write code, but they can't tell you why the auth flow was dropped or who's blocking PR #442.

PM Agent fills that gap. It's not an AI. It's the **nervous system** your AI talks through.

---

## What PM Agent Actually Is

| What It Is                                                                                         | What It Isn't                             |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| A **memory layer** that recalls decisions, blockers, and context across sessions                   | An AI that generates plans or writes code |
| A **rules engine** that enforces PM guardrails (scope checks, decision logging, blocker surfacing) | A replacement for Linear, Jira, or Notion |
| A **context provider** that feeds structured project state to your AI via CLI commands and hooks    | A standalone chatbot or dashboard         |
| A **note-taker** that captures and links everything without you thinking about it                  | A tool that requires manual data entry    |

**Your AI brings the brain. PM Agent brings the memory and the rules.**

---

## Core Philosophy

| Principle                    | What It Means                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Memory, not intelligence** | We remember. Your AI (Claude, GPT, local LLM) thinks. We just make sure it has the right context                               |
| **Rules, not suggestions**   | Enforceable guardrails: log decisions before closing tickets, check scope before adding work, surface blockers before standup  |
| **Ambient, not app**         | You don't open PM Agent. It's already there when you type                                                                      |
| **Bring your own AI**        | Works with Claude Code. Uses your keys, your model, your config |
| **Local-first**              | Your project state lives in SQLite on your machine. No cloud required. Team sync is opt-in, encrypted                          |

---

## How It Works

### 1. Memory Layer — "What Happened"

PM Agent builds a **temporal project graph** from your tools:

```
┌─────────────────────────────────────────┐
│  Project Graph (SQLite + local)         │
│                                         │
│  Decisions ──► ADR-004: "Drop OAuth"   │
│    │           made: 2026-07-15          │
│    │           by: @you                 │
│    │           linked: PR #442, AUTH-91  │
│    │                                    │
│  Blockers ──► PR #442: no review (2d)   │
│    │           RFC #18: no response (3d) │
│    │                                    │
│  Scope ──► Sprint: 4 days left          │
│    │        Committed: 8 days work       │
│    │        Risk: HIGH                   │
│    │                                    │
│  Tasks ──► AUTH-91: blocked             │
│    │        AUTH-92: in progress         │
│    │        AUTH-93: ready for review    │
│    │                                    │
│  Notes ──► "Stakeholder call: delay OK" │
│            "Design review: approved"    │
│            "Tech debt: auth refactor"   │
└─────────────────────────────────────────┘
```

Everything is **automatically captured** from your existing tools. No manual entry.

### 2. Rules Engine — "What You Must Do"

Configurable guardrails that **enforce** PM discipline:

```toml
# .pm-agent/rules.toml
[[rule]]
name = "decision-before-close"
trigger = "ticket.status == 'closed'"
condition = "ticket.has_decision == false"
action = "block_and_prompt: 'Log a decision before closing this ticket'"

[[rule]]
name = "scope-check-before-add"
trigger = "sprint.proposed_change"
condition = "sprint.impact > sprint.capacity * 0.3"
action = "warn_and_confirm: 'This adds significant scope. Proceed?'"

[[rule]]
name = "blocker-surface-daily"
trigger = "time == '09:00'"
condition = "blockers.count > 0"
action = "notify: 'You have {blockers.count} blockers today'"

[[rule]]
name = "stale-pr-alert"
trigger = "pr.age > 48h"
condition = "pr.reviews == 0"
action = "suggest: 'Ping {pr.author} for review'"
```

Rules are **enforced**, not suggested. The agent can't proceed until the rule is satisfied.

### 3. Context Provider — "What Your AI Needs to Know"

Exposed as a **CLI tool** so any AI agent can query project state:

```json
// CLI: pm status — project context
{
  "project": "auth-service",
  "sprint": "Sprint 14",
  "blockers": [
    { "id": "PR-442", "age": "2d", "type": "no_review" },
    { "id": "RFC-18", "age": "3d", "type": "no_response" }
  ],
  "decisions": [{ "id": "ADR-004", "text": "Drop OAuth, use magic links", "date": "2026-07-15" }],
  "scope": {
    "committed": "8 days",
    "remaining": "4 days",
    "risk": "HIGH"
  }
}
```

Your AI asks. PM Agent answers. No hallucination, no stale context.

---

## Quick Start

### Installation

**Recommended — global install (one command, works everywhere):**

```bash
npm install -g @gida-concept/pm-agent-cli
```

That installs the CLI and everything it needs (native SQLite, hooks, etc.) into one place. Then just use `pm` from any project directory.

> **Windows PowerShell users:** After global install, if `pm` isn't recognized, restart your terminal or see [the install guide](docs/INSTALL.md#windows-users--powershell-path) for the one-time PATH fix.

**Other options** (npx, local install, from source) — see the full [Installation Guide](docs/INSTALL.md) for details and troubleshooting.

### Initialize in Your Project

Config and data stay **project-local** — everything goes in `.pm-agent/` in your project root, never globally.

```bash
$ cd your-project
$ pm init
✔ PM Agent initialized for "your-project"

Config:    /home/you/your-project/.pm-agent/config.toml
Database:  /home/you/your-project/.pm-agent/pm.db
Rules:     /home/you/your-project/.pm-agent/rules.toml
CLAUDE.md: /home/you/your-project/CLAUDE.md
```

`pm init` sets up **everything** in one command: project config, database, rules, Claude Code hooks, CLAUDE.md with AI instructions, and an initial codebase scan.

Do not edit a global `~/.config/pm-agent/config.toml` — that global path is unused unless you create it manually.

### Daily Usage

```bash
# What's blocking me?
$ pm blockers
→ 1. PR #442 (OAuth backend) — open 2 days, no review from @backend-lead
→ 2. RFC #18 (auth flow) — @design-lead hasn't responded in 48h
→ 3. Ticket AUTH-91 — blocked by external dependency, no owner

# Log a decision (enforced by rule: decision-before-close)
$ pm log "we're going with magic links instead of OAuth"
→ Decision logged as ADR-004
→ Linked to: PR #442, Ticket AUTH-91, RFC #18
→ Rule satisfied: ticket AUTH-91 can now be closed

# Check scope (enforced by rule: scope-check-before-add)
$ pm scope "add passwordless login"
→ Estimated impact: +5 days backend, +3 days frontend, +2 days QA
→ Current sprint: 4 days remaining
→ Risk: HIGH — will push 3 existing tickets
→ Rule triggered: confirm to proceed? [Y/n/details]

# Prep for standup
$ pm standup
→ Yesterday: reviewed PR #438, #440. Logged ADR-004.
→ Today: unblock PR #442 (ping @backend-lead), draft AUTH-92 spec
→ Blockers: PR #442 needs review, design RFC pending

# Quick capture (global hotkey or CLI)
$ pm note "stakeholder call: delay is acceptable if we ship by Aug 1"
→ Note linked to: Sprint 14, AUTH-91
→ Will surface in standup and meeting prep
```

### Codebase Intelligence — "Know Your Code"

PM Agent can also **scan your entire codebase** so your AI understands the project even if you're joining mid-way:

```bash
# Cold-start: index every file, dependency, and doc
$ pm scan --full
→ Walked 1,234 files across 47 directories
→ Built dependency graph (3,892 edges, 0 circular deps)
→ Detected architecture: Express.js with controllers → services → models
→ Indexed 12 documentation files
→ Linked to: Sprint 14, ADR-004, 2 active blockers

# What breaks if I change this file?
$ pm impact src/auth/service.ts
→ Changing src/auth/service.ts may affect:
   - src/routes/login.ts (login flow)
   - src/middleware/auth.ts (auth middleware)
   - tests/auth/service.test.ts (unit tests)
→ Linked PM context:
   - ADR-004: "Drop OAuth, use magic links" — due sprint 15
   - BLK-003: PR #442 blocked, blocking TASK-007

# Search across code + documentation
$ pm search "deleted_at"
→ src/models/user.ts:42        — "deleted_at: DateTime"
→ src/migrations/003.sql        — "ALTER TABLE users ADD COLUMN deleted_at"
→ docs/data-model.md            — "Soft deletes use deleted_at timestamp"

# Watch mode — stays up to date automatically
$ pm scan --watch
→ Watching 1,234 files for changes...
→ [detected] src/auth/service.ts modified — re-indexed
→ [detected] src/routes/new-feature.ts created — added to registry
→ [detected] README.md modified — re-indexed for search
```

---

## Integration with Your AI

PM Agent is **not** an AI. It uses **your** AI via **Claude Code hooks** — the pre-tool-use and session-start hooks automatically load your project context into every AI interaction.

When you configure PM Agent hooks (via `pm init` or `pm hooks setup`), Claude Code automatically:
- Queries project state (blockers, decisions, tasks) inline while you code
- Logs decisions and enforces rules before you commit
- Surfaces blockers, sprint risks, and pending decisions in your workflow

> **No external API keys or environment variables needed.** Everything runs locally from your project's `.pm-agent/` directory.

### Usage from Claude Code

After running `pm init`, use the CLI with `! pm <command>` from Claude Code:

```
! pm status        — Project overview
! pm log "Title"   — Log a decision
! pm blockers      — Check blockers
! pm scope "desc"  — Check scope
! pm note "text"   — Take a note
! pm standup       — Standup summary
```

All commands support `--json` output for programmatic use by AI agents. PM Agent hooks (Claude Code `PreToolUse` and `SessionStart`) automatically load project context and enforce rules without any config file editing.

---
## Automatic AI Awareness — Claude Code Hooks

PM Agent ships with **Claude Code hooks** that are auto-installed by `pm init` (or manually via `pm hooks setup`). These hooks inject your project's context and enforce your rules automatically on every interaction — no manual prompting or config file edits needed.

### What the Hooks Do

| Hook | Trigger | Behavior |
|------|---------|----------|
| **Session Start** | Every new Claude Code session | Loads project state, checks blockers, surfaces rules |
| **Pre-Tool Use** | Before every tool call | Evaluates code rules against changes, blocks violations |
| **Pre-Exit** | Before Claude Code exits | Prompts to log pending decisions, notes blockers |

### How It Works

1. **`pm init`** creates the hooks in `.claude/hooks/` and generates `CLAUDE.md` with PM Agent instructions
2. Every time Claude Code starts, the session-start hook reads the `.pm-agent/` database and injects context into the system prompt
3. Before every file write or commit, the pre-tool-use hook evaluates active rules (e.g., "no `any` types", "tests before merge") and blocks violations
4. Your AI gets full project context automatically — blockers, decisions, notes, scope, and rules — without you having to type `! pm status`

### Hooks for Other Clients

For Claude Code, add a `CLAUDE.md` in your project root:

```markdown
## Required PM Agent Behavior

Before every response, you MUST:
1. Run `! pm status` to check current project state
2. Run `! pm blockers` before planning work
3. Run `! pm rules list` before finalizing decisions
4. Run `! pm log <title>` after reaching significant agreements
```

Your AI reads these instructions on every interaction and follows them.

---

### Auto-Enforcement — Rules That Actually Block

> Rules are evaluated **automatically on every CLI command**. No manual enforcement needed.

When a rule's scope is `all` (or matches the command's context), the engine checks it before the command executes. If a **hard** rule's trigger matches, the command is **blocked** and the rule's message is returned instead.

#### How It Works

Every command invocation generates a context object with:

| Variable | Description | Example |
|----------|-------------|---------|
| `tool_name` | The command being invoked | `log` |
| `operation` | Inferred operation type | `read`, `log`, `add`, `scan` |
| `entity` | Inferred target entity | `context`, `decision`, `note` |
| `tool_args` | Full arguments object | `{title, body, author}` |
| _Each arg directly_ | Every argument by name | `title`, `body`, `content` |

#### Writing Auto-Enforceable Rules

Triggers must be **boolean expressions** using the expression engine (`==`, `!=`, `contains()`, `&&`, `||`):

```toml
# Good — expression-compatible trigger that matches a CLI command
[[rule]]
scope = "all"
name = "ask-permission-decisions"
trigger = "tool_name == 'log'"
condition = "body && (body.contains('architecture') || body.contains('scope'))"
action = "block: 'Decision may affect project direction ({title}). Ask permission first.'"
severity = "hard"
description = "Blocks decision logging without permission."

# Bad — natural language won't parse (silently fails)
trigger = "about to make a significant decision"  # ✗ won't work
```

**Important:** Auto-enforcement does NOT apply to the `rules` subcommands themselves (to avoid loops and allow rule management).

---

## CLI Commands

| Command              | What It Does                                     |
| -------------------- | ------------------------------------------------ |
| `pm status`          | "What's the current project state?"               |
| `pm blockers`        | "What's blocking me?"                             |
| `pm log`             | "Log a decision with body and links"              |
| `pm note`            | "Quick capture with tags and links"               |
| `pm scope`           | "Can we add this to the sprint?"                  |
| `pm standup`         | "What did I do yesterday?"                        |
| `pm rules`           | "List, add, or manage enforcement rules"          |
| `pm search`          | "Full-text search across code and docs"           |
| `pm arch`            | "Show architecture overview"                      |
| `pm scan`            | "Index file registry, deps, and architecture"     |
| `pm depends`         | "Show dependency graph for a file"                |
| `pm impact`          | "Analyze what breaks if I change this file"       |
| `pm files`           | "List indexed files by type"                      |
| `pm understand`      | "Deep semantic analysis of the codebase"          |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     YOUR AI (Claude, GPT, Local LLM)        │
│                     ┌─────────────────┐                      │
│                     │  Thinks, plans, │                      │
│                     │  writes, decides│                      │
│                     └────────┬────────┘                      │
│                              │ CLI / hooks                    │
│                              ▼                                │
│              ┌───────────────────────────────┐               │
│              │       PM Agent CLI + Hooks      │               │
│              │  ┌─────────────────────────┐   │               │
│              │  │  Memory Layer (SQLite)  │   │               │
│              │  │  • project graph        │   │               │
│              │  │  • decision log         │   │               │
│              │  │  • temporal notes       │   │               │
│              │  │  • task state           │   │               │
│              │  └─────────────────────────┘   │               │
│              │  ┌─────────────────────────┐   │               │
│              │  │  Rules Engine (TOML)    │   │               │
│              │  │  • enforceable guardrails│   │               │
│              │  │  • trigger → condition   │   │               │
│              │  │    → action              │   │               │
│              │  └─────────────────────────┘   │               │
│              │  ┌─────────────────────────┐   │               │
│              │  │  Integrations (APIs)    │   │               │
│              │  │  • GitHub • Linear      │   │               │
│              │  │  • Slack • Notion       │   │               │
│              │  │  • Jira • Figma         │   │               │
│              │  └─────────────────────────┘   │               │
│              └───────────────────────────────┘               │
│                              │                                │
│              ┌───────────────┴───────────────┐               │
│              │      User-Facing Interfaces      │               │
│  ┌───────────┼───────────┬───────────┬────────┐              │
│  │  Shell    │  IDE      │  Desktop  │  Web   │              │
│  │  (hook)   │  (ext)    │  (menu)   │  (opt) │              │
│  └───────────┴───────────┴───────────┴────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

- **CLI**: Node.js (Commander.js, Inquirer.js, Chalk, Ora)
- **State**: SQLite (local-first, `sql.js`, WASM)
- **Rules**: TOML (human-readable, version-controllable)
- **Package Manager**: npm workspaces (monorepo)

---

## Rules Engine

Rules are the heart of PM Agent. They make discipline **automatic**, not optional — whether that's PM discipline (log decisions, check scope) or coding discipline (no `any` types, always write tests, enforce patterns).

### How It Works: One File, Two Concerns

All rules live in a single file (`.pm-agent/rules.toml`). A `scope` field tells PM Agent which context a rule applies in:

| `scope` | Applied when                                   | Example                                   |
| ------- | ---------------------------------------------- | ----------------------------------------- |
| `pm`    | CLI commands (`pm log`, `pm scope`, `pm rules`) | "Must log decision before closing ticket" |
| `code`  | File save, commit, PR (IDE hooks)              | "No `any` types in shared packages"       |
| `all`   | Everywhere                                     | "Surface blockers before standup"         |

Same engine, same parser, same evaluator — one source of truth for everything.

### How to Create Rules

**Three ways, pick your style:**

#### 1. Write TOML directly

```toml
# .pm-agent/rules.toml

# ── PM discipline (checked by CLI + hooks) ──

[[rule]]
scope = "pm"
name = "decision-before-close"
trigger = "ticket.status_change == 'closed'"
condition = "ticket.decisions.count == 0"
action = "block: 'Log a decision before closing {ticket.id}'"
severity = "hard"

[[rule]]
scope = "pm"
name = "scope-check"
trigger = "sprint.proposed_addition"
condition = "sprint.impact_days > sprint.remaining_days * 0.5"
action = "confirm: 'This adds {sprint.impact_days} days to a sprint with {sprint.remaining_days} days left. Proceed?'"
severity = "soft"

[[rule]]
scope = "pm"
name = "daily-blocker-check"
trigger = "time == '09:00'"
condition = "blockers.count > 0"
action = "notify: 'You have {blockers.count} blockers today: {blockers.list}'"
severity = "info"

[[rule]]
scope = "pm"
name = "meeting-prep"
trigger = "calendar.event.starting_in < 15m"
condition = "event.has_prep == false"
action = "generate: 'Prep brief for {event.title} with context from {event.related_tickets}'"
severity = "info"

# ── Code discipline (checked by IDE hooks, file save, PR) ──

[[rule]]
scope = "code"
name = "no-any-in-shared"
trigger = "file.saved"
condition = "file.path == 'packages/shared/**/*.ts' && file.contains('any')"
action = "block: 'Avoid `any` type in shared libraries — use generics or `unknown`'"
severity = "hard"

[[rule]]
scope = "code"
name = "tests-before-merge"
trigger = "pr.ready_for_review"
condition = "pr.new_code_without_tests > 0"
action = "block: 'All new code must have accompanying tests before merge'"
severity = "hard"

[[rule]]
scope = "code"
name = "strict-tsconfig"
trigger = "file.saved"
condition = "file.path == 'tsconfig.json' && file.contains('strict: false')"
action = "block: 'tsconfig must use strict mode. Set \"strict\": true'"
severity = "hard"

[[rule]]
scope = "code"
name = "no-console-log"
trigger = "file.saved"
condition = "file.path == 'src/**/*.ts' && file.contains('console.log')"
action = "suggest: 'Remove console.log before committing. Use a logger instead.'"
severity = "soft"

[[rule]]
scope = "all"
name = "stale-pr"
trigger = "pr.age > 48h"
condition = "pr.reviews == 0"
action = "suggest: 'PR {pr.id} has been open {pr.age} with no reviews. Ping {pr.author}?'"
severity = "soft"
```

#### 2. Use the CLI

```bash
# Add a PM rule
pm rules add "decision-before-close" \
  --scope pm \
  --trigger "ticket.status_change == 'closed'" \
  --condition "ticket.decisions.count == 0" \
  --action "block: 'Log a decision before closing {ticket.id}'" \
  --severity hard

# Add a code rule
pm rules add "no-any-in-shared" \
  --scope code \
  --trigger "file.saved" \
  --condition "file.path == 'packages/shared/**/*.ts' && file.contains('any')" \
  --action "block: 'Avoid `any` type in shared libraries'" \
  --severity hard

# Manage rules
pm rules list              # see all rules, grouped by scope
pm rules list --scope code # only code rules
pm rules disable "no-console-log"
pm rules enable "no-console-log"
pm rules remove "stale-pr"
```

#### 3. Let your AI propose them

Your AI agent can suggest a rule via the CLI:

```
You: "I keep accidentally pushing console.log to production"

Claude: "I can add a rule to catch that. Here's what I'd add:

[[rule]]
scope = "code"
name = "no-console-log"
trigger = "file.saved"
condition = "file.contains('console.log')"
action = "suggest: 'Remove console.log before committing.'"
severity = "soft"

Run this to add it:
  pm rules add "no-console-log" --scope code --trigger "file.saved" --condition "file.contains('console.log')" --action "suggest: 'Remove console.log before committing.'" --severity soft"
```

### Trigger Matching

Rules are evaluated with a lightweight expression parser that supports:

| Syntax                  | Example                       | Matches when                      |
| ----------------------- | ----------------------------- | --------------------------------- |
| `.` property access     | `pr.age > 48h`                | PR is over 48 hours old           |
| `==` / `!=`             | `file.path == 'src/**/*.ts'`  | File path matches glob            |
| `>` / `<` / `>=` / `<=` | `blockers.count > 0`          | At least one blocker exists       |
| `&&` / `\|\|`           | `x > 0 && y < 5`              | Both conditions met               |
| `.contains()`           | `file.contains('any')`        | File content contains substring   |
| `.count`                | `ticket.decisions.count == 0` | Array is empty                    |
| `{template}`            | `'{pr.id}'`                   | Interpolated into action messages |

### Rule Severity

| Severity | Behavior                                        |
| -------- | ----------------------------------------------- |
| `hard`   | Blocks the action. Must satisfy rule to proceed |
| `soft`   | Warns and requires explicit confirmation        |
| `info`   | Surfaces context, doesn't block                 |

---

## Memory Model

PM Agent's memory is **temporal and relational** — not just a log, but a graph:

```
Memory Types:
├── Decisions (ADRs)
│   ├── What was decided
│   ├── Who decided it
│   ├── When
│   └── Linked to: tickets, PRs, meetings, notes
│
├── Blockers
│   ├── What's blocked
│   ├── How long
│   ├── Who can unblock
│   └── Linked to: decisions, tasks, people
│
├── Notes
│   ├── Raw capture (meeting notes, Slack messages, thoughts)
│   ├── Auto-tagged with: project, sprint, people, topics
│   └── Linked to: decisions, blockers, tasks
│
├── Tasks
│   ├── State: todo, in_progress, blocked, done
│   ├── Owner
│   └── Linked to: decisions, blockers, notes
│
└── Scope
    ├── Sprint capacity
    ├── Committed work
    ├── Proposed changes
    └── Risk assessment
```

Everything is **automatically linked**. Ask "what's related to AUTH-91?" and get decisions, notes, blockers, and tasks in one view.



---

## Security & Privacy

- **Local-first**: All project state in SQLite on your machine
- **No AI calls from PM Agent**: Your AI keys stay with your AI. We only expose context
- **Encrypted sync**: If enabled, AES-256-GCM. Team sync is opt-in
- **Token isolation**: API keys in OS keychain (Keychain/macOS, libsecret/Linux, Credential Manager/Windows)
- **No telemetry**: No usage data sent anywhere
- **Auditable rules**: All rule triggers and actions are logged locally

---

## Roadmap

- [x] Core memory layer (SQLite project graph)
- [x] Rules engine (TOML config, enforceable guardrails)
- [x] GitHub integration (PRs, issues, reviews)
- [x] Linear integration (tickets, sprints)
- [x] CLI interface
- [x] Claude Code hooks (session-start, pre-tool-use)
- [ ] Jira integration
- [ ] Slack integration (decision detection, blocker alerts)
- [ ] Notion integration (doc linking)
- [ ] VS Code extension (sidebar + inline)

- [ ] Raycast extension (quick capture)
- [ ] macOS menubar (blocker indicator)
- [ ] Team sync (encrypted, opt-in)
- [ ] Web UI (read-only project overview)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — or just open an issue or PR on [GitHub](https://github.com/Gida-concept/Memorise).

---

## License

MIT License — see [LICENSE](LICENSE).

---

## Why This Exists

> "AI agents are getting smarter, but they have no memory of your project and no sense of your rules. PM Agent is the layer that gives them context and discipline — so they can focus on thinking, while we handle remembering and enforcing."

Built for PMs who work with engineers, by someone who believes the future of product tools isn't another AI brain — it's the **infrastructure that makes every AI brain useful**.
