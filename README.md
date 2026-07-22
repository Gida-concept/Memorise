```
                           ╭──────────────────────╮
                           │     PM AGENT         │
                           │  memory · rules · mcp │
                           ╰──────────┬───────────╯
                                      │
        ┌─────────────┬───────────────┼───────────────┬─────────────┐
        │             │               │               │             │
    ╭───┴───╮    ╭───┴───╮       ╭───┴───╮       ╭───┴───╮    ╭───┴───╮
    │  CLI  │    │  IDE  │       │  MCP  │       │ HOOK  │    │  WEB  │
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
| A **context provider** that feeds structured project state to your AI via MCP                      | A standalone chatbot or dashboard         |
| A **note-taker** that captures and links everything without you thinking about it                  | A tool that requires manual data entry    |

**Your AI brings the brain. PM Agent brings the memory and the rules.**

---

## Core Philosophy

| Principle                    | What It Means                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Memory, not intelligence** | We remember. Your AI (Claude, GPT, local LLM) thinks. We just make sure it has the right context                               |
| **Rules, not suggestions**   | Enforceable guardrails: log decisions before closing tickets, check scope before adding work, surface blockers before standup  |
| **Ambient, not app**         | You don't open PM Agent. It's already there when you type                                                                      |
| **Bring your own AI**        | Works with Claude Code, OpenCode, Codex CLI, Cursor, Zed, or any MCP-compatible agent. Uses your keys, your model, your config |
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
# ~/.config/pm-agent/rules.toml
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

Exposed as an **MCP server** so any AI agent can query project state:

```json
// MCP tool: pm_get_context
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

**Via npm (recommended after publish):**

```bash
# Install the CLI globally
npm install -g @gida-concept/pm-agent-cli

# Then `pm` is available anywhere
pm --help
```

**Via npx (no install):**

```bash
# Run directly without installing
npx @gida-concept/pm-agent-cli init
```

**From source (development):**

```bash
git clone https://github.com/Gida-concept/Memorise.git
cd Memorise
npm install
npm run build
npm link

# Now `pm` is available anywhere
pm --help
```

### Initialize in Your Project

```bash
$ cd ~/projects/my-app
$ pm init
→ Created: /home/you/.config/pm-agent/config.toml
→ Created: /home/you/.config/pm-agent/rules.toml
→ Project graph ready in SQLite
```

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

PM Agent is **not** an AI. It uses **your** AI via the **Model Context Protocol (MCP)** — a standard way for AI assistants to interact with tools.

When you configure PM Agent as an MCP server, your AI assistant (Claude Code, Cursor, etc.) can:
- Query project state (blockers, decisions, tasks) inline while you code
- Log decisions and enforce rules before you commit
- Surface blockers, sprint risks, and pending decisions in your workflow

> **No external API keys or environment variables needed.** The PM Agent MCP server uses `stdio` transport — it runs locally as a child process and reads your project files directly from disk.

---

### Quick Start (All CLIs)

1. **Install Node.js** (v18+) if you don't have it.
2. Pick your AI tool below and add the config shown.
3. **Restart** the tool (config is only read at startup).
4. **Verify** by asking your AI about blockers or decisions — it should call PM Agent automatically.

The correct command is always this npx invocation:

```
npx -y @gida-concept/pm-agent-mcp-server
```

The `-y` flag tells npx to skip the "install this package?" prompt so the AI tool can start the server automatically.

---

### Claude Code

**Config file:** Create `./.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@gida-concept/pm-agent-mcp-server"]
    }
  }
}
```

Alternatively, add the same object to your user-level config at `~/.claude.json` under `mcpServers`.

Then:

```bash
$ claude
> What should I work on today?
  [Claude calls pm_get_context via MCP]
  [Claude sees: 2 blockers, 1 pending decision, sprint at risk]
  → "You have 2 blockers. PR #442 needs a review ping.
      Also, decision ADR-004 is pending stakeholder sign-off."

> Log that we're dropping OAuth
  [Claude calls pm_log_decision]
  → "Decision logged as ADR-004. Linked to PR #442 and AUTH-91."

> Can we add dark mode to this sprint?
  [Claude calls pm_scope_check]
  → "Scope check: +3 days design, +2 days frontend.
      Sprint has 4 days left. Risk: HIGH. Confirm?"
```

**Verify:** Restart Claude Code, then run `/mcp` — you should see `pm-agent` in the connected servers list.

---

### Cursor

**Config file:** Create `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@gida-concept/pm-agent-mcp-server"]
    }
  }
}
```

**Verify:** Restart Cursor. Open the MCP panel (gear icon → Features → MCP) — `pm-agent` should show as connected. Then try asking Cursor's AI: *"What are my current blockers?"*

> **Note:** Cursor v0.45+ reads `.cursor/mcp.json` automatically. Older versions may need the config in `~/.cursor/mcp.json` or in VS Code-style `settings.json` under `mcp.servers`.

---

### OpenCode

**Config file:** Create `opencode.json` (or `opencode.jsonc`) in your project root:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "pm-agent": {
      "type": "local",
      "command": ["npx", "-y", "@gida-concept/pm-agent-mcp-server"],
      "enabled": true
    }
  }
}
```

**Verify:** Restart OpenCode and ask: *"Show my current project context."* The AI should call the PM Agent tools automatically.

---

### Continue.dev

**Config file:** Add to `~/.continue/config.json` (or `.continue/config.yaml` in your project):

```json
{
  "mcpServers": [
    {
      "name": "pm-agent",
      "command": "npx",
      "args": ["-y", "@gida-concept/pm-agent-mcp-server"]
    }
  ]
}
```

> Note: Continue.dev uses an **array** (not an object) for `mcpServers`. Each server is a list item with a `name` field.

In YAML format (`config.yaml`):

```yaml
mcpServers:
  - name: pm-agent
    command: npx
    args:
      - "-y"
      - "@gida-concept/pm-agent-mcp-server"
```

**Verify:** Open Continue, start a new chat, and ask: *"What decisions are pending?"*

---

### Zed

**Config file:** Add to `~/.config/zed/settings.json`:

```json
{
  "mcp_servers": {
    "pm-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@gida-concept/pm-agent-mcp-server"]
    }
  }
}
```

> Note: Zed uses **snake_case** (`mcp_servers`, not `mcpServers`).

**Verify:** Restart Zed. Open the Assistant panel — the PM Agent tools should be available to the AI.

---

### OpenAI Codex CLI

**Config file:** Create `codexrc.toml` or add to `config.toml` in your project:

```toml
[mcp_servers.pm-agent]
enabled = true

[mcp_servers.pm-agent.transport]
type = "stdio"
command = "npx"
args = ["-y", "@gida-concept/pm-agent-mcp-server"]
```

**Verify:** Restart Codex and ask: *"What blockers do I have?"*

> **Note:** Codex CLI uses TOML format. The exact schema may evolve — if this exact structure doesn't work, check the [Codex CLI docs](https://github.com/openai/codex) for the latest `[mcp_servers]` configuration reference.

---

### General Tips

| Tip | Details |
|-----|---------|
| **Restart required** | Config is only read when the tool starts. Always restart after editing config files. |
| **One server, many tools** | PM Agent exposes 17+ tools. Your AI picks the right one — you don't need to configure individual tools. |
| **No env vars needed** | The server runs locally and reads your project files directly. |
| **Project vs user scope** | Project-level config (`.mcp.json`, `.cursor/mcp.json`) is portable with your repo. User-level config (`~/.claude.json`, `~/.config/zed/settings.json`) applies across all projects. |
| **Stuck?** | Run `npx -y @gida-concept/pm-agent-mcp-server` directly in your terminal. If it errors, check Node.js is v18+. If it starts without error, the package works — the issue is in your config file path or restart step. |


---

## MCP Tools Exposed

| Tool               | What Your AI Can Ask                              |
| ------------------ | ------------------------------------------------- |
| `pm_get_context`   | "What's the current project state?"               |
| `pm_get_blockers`  | "What's blocking me?"                             |
| `pm_get_decisions` | "What decisions have been made?"                  |
| `pm_get_scope`     | "What's the sprint capacity?"                     |
| `pm_get_notes`     | "What did we discuss in the last meeting?"        |
| `pm_log_decision`  | "Log this decision" (enforces rules)              |
| `pm_log_note`      | "Take a note" (auto-links to context)             |
| `pm_check_scope`   | "Can we add this to the sprint?" (enforces rules) |
| `pm_get_standup`   | "What did I do yesterday?"                        |
| `pm_prep_meeting`  | "Prep me for the 2pm meeting"                     |
| `pm_enforce_rules` | "Are any rules being violated?"                   |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     YOUR AI (Claude, GPT, Local LLM)        │
│                     ┌─────────────────┐                      │
│                     │  Thinks, plans, │                      │
│                     │  writes, decides│                      │
│                     └────────┬────────┘                      │
│                              │ MCP (stdio/sse)                │
│                              ▼                                │
│              ┌───────────────────────────────┐               │
│              │      PM Agent MCP Server       │               │
│              │  ┌─────────────────────────┐   │               │
│              │  │  Memory Layer (SQLite)  │   │               │
│              │  │  • project graph        │   │               │
│              │  │  • decision log           │   │               │
│              │  │  • temporal notes         │   │               │
│              │  │  • task state             │   │               │
│              │  └─────────────────────────┘   │               │
│              │  ┌─────────────────────────┐   │               │
│              │  │  Rules Engine (TOML)    │   │               │
│              │  │  • enforceable guardrails │   │               │
│              │  │  • trigger → condition    │   │               │
│              │  │    → action               │   │               │
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

- **MCP Server**: Node.js (`@modelcontextprotocol/sdk`, `better-sqlite3`)
- **CLI**: Node.js (Commander.js, Inquirer.js, Chalk, Ora)
- **State**: SQLite (local-first, `better-sqlite3`)
- **Rules**: TOML (human-readable, version-controllable)
- **Package Manager**: npm workspaces (monorepo)

---

## Rules Engine

Rules are the heart of PM Agent. They make discipline **automatic**, not optional — whether that's PM discipline (log decisions, check scope) or coding discipline (no `any` types, always write tests, enforce patterns).

### How It Works: One File, Two Concerns

All rules live in a single file (`~/.config/pm-agent/rules.toml`). A `scope` field tells PM Agent which context a rule applies in:

| `scope` | Applied when                                   | Example                                   |
| ------- | ---------------------------------------------- | ----------------------------------------- |
| `pm`    | CLI commands (`pm log`, `pm scope`), MCP tools | "Must log decision before closing ticket" |
| `code`  | File save, commit, PR (IDE hooks)              | "No `any` types in shared packages"       |
| `all`   | Everywhere                                     | "Surface blockers before standup"         |

Same engine, same parser, same evaluator — one source of truth for everything.

### How to Create Rules

**Three ways, pick your style:**

#### 1. Write TOML directly

```toml
# ~/.config/pm-agent/rules.toml

# ── PM discipline (checked by CLI + MCP) ──

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

Your AI agent can call the MCP tool `pm_add_rule` to suggest a rule:

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

Add this rule? [Y/n]"
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
- [x] MCP server (stdio transport)
- [x] CLI interface
- [ ] Jira integration
- [ ] Slack integration (decision detection, blocker alerts)
- [ ] Notion integration (doc linking)
- [ ] VS Code extension (sidebar + inline)
- [ ] Cursor extension
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
