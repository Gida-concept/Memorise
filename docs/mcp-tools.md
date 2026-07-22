# PM Agent — MCP Tools Reference

> The complete Model Context Protocol (MCP) tool reference for AI agents. Every tool, schema, example, and integration pattern.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Tool Reference](#tool-reference)
  - [PM Context Tools (Passive)](#pm-context-tools-passive)
  - [PM Write Tools (Active)](#pm-write-tools-active)
  - [Codebase Intelligence Tools (Passive)](#codebase-intelligence-tools-passive)
- [Tool Response Format](#tool-response-format)
- [Rules Enforcement in MCP](#rules-enforcement-in-mcp)
- [Error Handling](#error-handling)
- [Integration Examples](#integration-examples)
- [Client Configuration](#client-configuration)
- [Server Transport](#server-transport)
- [Security Notes](#security-notes)

---

## Overview

PM Agent exposes its **memory layer**, **rules engine**, and **codebase intelligence** as MCP (Model Context Protocol) tools. Any MCP-compatible AI agent — Claude Code, Cursor, Zed, OpenCode, Codex CLI, and others — can connect to the PM Agent MCP server and query or modify project state.

The server uses **stdio transport**, meaning the AI agent launches the PM Agent server as a child process and communicates via JSON-RPC 2.0 messages over stdin/stdout. There is no HTTP server, no open ports, and no network layer by default.

### Architecture

```
Your AI (Claude Code, Cursor, Codex CLI, ...)
       │
       │ MCP stdio transport (JSON-RPC 2.0)
       ▼
┌─────────────────────────────────────────────┐
│         PM Agent MCP Server                  │
│  ┌───────────────────────────────────────┐   │
│  │  PM Context Tools (passive)           │   │
│  │  pm_get_context ─── aggregated state  │   │
│  │  pm_get_blockers ── active blockers   │   │
│  │  pm_get_decisions ── decision records │   │
│  │  pm_get_scope ────── scope snapshots  │   │
│  │  pm_get_notes ────── tagged notes     │   │
│  │  pm_get_standup ──── standup summary  │   │
│  │  pm_prep_meeting ─── meeting brief    │   │
│  └───────────────────────────────────────┘   │
│  ┌───────────────────────────────────────┐   │
│  │  PM Write Tools (active — rules!)     │   │
│  │  pm_log_decision ── log ADR + rules   │   │
│  │  pm_log_note ────── create note       │   │
│  │  pm_check_scope ─── risk assessment   │   │
│  │  pm_add_rule ────── create rule       │   │
│  │  pm_enforce_rules ─ evaluate rules    │   │
│  └───────────────────────────────────────┘   │
│  ┌───────────────────────────────────────┐   │
│  │  Codebase Intelligence (passive)      │   │
│  │  pm_scan_codebase ──── scan project   │   │
│  │  pm_get_dependency_graph ── deps      │   │
│  │  pm_analyze_impact ──── impact report │   │
│  │  pm_search_codebase ─── full-text     │   │
│  │  pm_get_architecture ── arch overview │   │
│  │  pm_get_file_context ── PM per file   │   │
│  └───────────────────────────────────────┘   │
│  ┌───────────────────────────────────────┐   │
│  │  Rules Engine                         │   │
│  │  ┌── rules.toml ── trigger → action   │   │
│  │  └── severity: hard / soft / info     │   │
│  └───────────────────────────────────────┘   │
│  ┌───────────────────────────────────────┐   │
│  │  Memory Layer (SQLite)                │   │
│  │  decisions, blockers, notes, tasks    │   │
│  │  scope, file_registry, deps, arch    │   │
│  └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Tool Categories

| Category                  | Enforcement                       | Tools                                                                                                                                  |
| ------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **PM Context**            | Passive — read-only, no rules     | `pm_get_context`, `pm_get_blockers`, `pm_get_decisions`, `pm_get_scope`, `pm_get_notes`, `pm_get_standup`, `pm_prep_meeting`           |
| **PM Write**              | Active — may trigger rules engine | `pm_log_decision`, `pm_log_note`, `pm_check_scope`, `pm_add_rule`, `pm_enforce_rules`                                                  |
| **Codebase Intelligence** | Passive — read-only, no rules     | `pm_scan_codebase`, `pm_get_dependency_graph`, `pm_analyze_impact`, `pm_search_codebase`, `pm_get_architecture`, `pm_get_file_context` |

### Server Package

```
packages/mcp-server/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts              # MCP server setup + tool registration
│   └── tools/
│       ├── get-context.ts
│       ├── get-blockers.ts
│       ├── get-decisions.ts
│       ├── get-notes.ts
│       ├── get-scope.ts
│       ├── get-standup.ts
│       ├── prep-meeting.ts
│       ├── log-decision.ts
│       ├── log-note.ts
│       ├── check-scope.ts
│       ├── add-rule.ts
│       └── enforce-rules.ts
└── tests/
    └── tools.test.ts
```

---

## Quick Start

### 1. Install PM Agent

```bash
npm install -g pm-agent
```

Or install from source:

```bash
git clone https://github.com/acme-corp/pm-agent.git
cd pm-agent
npm install
npm run build --workspace=packages/mcp-server
```

### 2. Initialize a Project

```bash
cd my-project
pm init
```

This creates the SQLite database, default configuration, and default rules at `~/.config/pm-agent/`.

### 3. Configure Your MCP Client

**Claude Code** (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["-y", "pm-agent-mcp"],
      "env": {
        "PM_CONFIG_PATH": "~/.config/pm-agent/config.toml"
      }
    }
  }
}
```

If installed globally, use the direct path:

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "pm-mcp",
      "args": [],
      "env": {
        "PM_CONFIG_PATH": "~/.config/pm-agent/config.toml"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["-y", "pm-agent-mcp"],
      "env": {
        "PM_CONFIG_PATH": "~/.config/pm-agent/config.toml"
      }
    }
  }
}
```

**VS Code** (`settings.json`):

```json
{
  "mcp": {
    "servers": {
      "pm-agent": {
        "command": "npx",
        "args": ["-y", "pm-agent-mcp"],
        "env": {
          "PM_CONFIG_PATH": "~/.config/pm-agent/config.toml"
        }
      }
    }
  }
}
```

**Zed** (`~/.config/zed/settings.json`):

```json
{
  "mcp": {
    "pm-agent": {
      "command": "npx",
      "args": ["-y", "pm-agent-mcp"],
      "env": {
        "PM_CONFIG_PATH": "~/.config/pm-agent/config.toml"
      }
    }
  }
}
```

**OpenCode / Codex CLI** (`~/.config/opencode/settings.json` or similar):

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["-y", "pm-agent-mcp"],
      "env": {
        "PM_CONFIG_PATH": "~/.config/pm-agent/config.toml"
      }
    }
  }
}
```

### 4. Verify the Connection

In Claude Code, ask:

```
Do you have PM Agent tools available?
```

The AI should confirm it can see tools like `pm_get_context`, `pm_get_blockers`, etc.

---

## Tool Reference

Every tool follows the MCP standard: a named tool with an optional input schema, which returns a `content` array containing JSON results.

---

### PM Context Tools (Passive)

Passive tools are **read-only**. They query the memory layer and return data. They do **not** trigger the rules engine. Any MCP-compatible AI can call them freely.

---

#### `pm_get_context`

**Aggregated project state.** Returns all project context in one call: current decisions, blockers, notes, tasks, and the latest scope snapshot. This is the best first call when an AI needs to understand the project.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  // No input parameters required
  type: "object",
  properties: {},
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "pm_get_context",
    "arguments": {}
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"project\":\"auth-service\",\"sprint\":{\"name\":\"Sprint 14\",\"committed_days\":8,\"remaining_days\":4,\"risk\":\"MEDIUM\"},\"decisions\":[{\"id\":\"ADR-004\",\"title\":\"Drop OAuth, use magic links\",\"author\":\"alice\",\"made_at\":\"2026-07-21T14:30:00Z\",\"links\":[\"AUTH-91\",\"PR-442\"]}],\"blockers\":[{\"id\":\"BLK-004\",\"title\":\"RFC #18 unanswered\",\"age_hours\":72,\"blocked_by\":\"@design-lead\",\"status\":\"open\"},{\"id\":\"BLK-005\",\"title\":\"CI pipeline flaky on main\",\"age_hours\":5,\"blocked_by\":\"infra\",\"status\":\"open\"}],\"notes\":[{\"id\":\"NOTE-013\",\"content\":\"Stakeholder approved dark mode\",\"tags\":[\"stakeholder\",\"sprint-15\"],\"created_at\":\"2026-07-21T15:00:00Z\"}],\"tasks\":[{\"id\":\"TASK-007\",\"title\":\"Implement magic link flow\",\"status\":\"blocked\"},{\"id\":\"TASK-008\",\"title\":\"Update API docs\",\"status\":\"todo\"}],\"codebase\":{\"files_indexed\":1234,\"dependency_edges\":4321,\"circular_dependencies\":2,\"last_scanned\":\"2026-07-21T14:00:00Z\"},\"rules_active\":8}}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm status --json
```

**Rules enforcement:** None (passive)

---

#### `pm_get_blockers`

**Active blockers.** Returns all blockers currently marked open, with details on age, blocked-by, and linked entities. Supports optional filtering.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["open", "resolved", "all"],
      description: "Filter by status. Default: 'open'"
    },
    min_age: {
      type: "string",
      description: "Minimum age filter (e.g., '24h', '3d', '30m'). Only returns blockers at least this old."
    },
    limit: {
      type: "number",
      description: "Maximum number of blockers to return (default: 50)"
    }
  },
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "pm_get_blockers",
    "arguments": {
      "status": "open",
      "min_age": "24h"
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"blockers\":[{\"id\":\"BLK-004\",\"title\":\"RFC #18 unanswered\",\"age_hours\":72,\"blocked_by\":\"@design-lead\",\"status\":\"open\",\"linked_entities\":[\"RFC-18\"],\"created_at\":\"2026-07-18T14:00:00Z\"}],\"active_count\":1,\"total_count\":1,\"filter_applied\":{\"status\":\"open\",\"min_age\":\"24h\"}}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm blockers --json
pm blockers --age 24h --json
pm blockers --all --json
```

**Rules enforcement:** None (passive)

---

#### `pm_get_decisions`

**Decision records (ADRs).** Returns Architecture Decision Records ordered by date descending. Supports filtering by recency and author.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    limit: {
      type: "number",
      description: "Maximum number of decisions to return (default: 20)"
    },
    since: {
      type: "string",
      format: "date",
      description: "ISO date string filter (e.g., '2026-07-01'). Only returns decisions made on or after this date."
    },
    author: {
      type: "string",
      description: "Filter by author name"
    }
  },
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "pm_get_decisions",
    "arguments": {
      "limit": 5,
      "since": "2026-07-01"
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"decisions\":[{\"id\":\"ADR-004\",\"title\":\"Drop OAuth, use magic links\",\"body\":\"Magic links eliminate the password reset flow entirely. Reduces auth surface area.\",\"author\":\"alice\",\"made_at\":\"2026-07-21T14:30:00Z\",\"linked_entities\":[\"AUTH-91\",\"PR-442\"]},{\"id\":\"ADR-003\",\"title\":\"Adopt Vitest over Jest\",\"body\":\"Vitest is 3x faster, native ESM, and compatible with existing Jest plugins.\",\"author\":\"bob\",\"made_at\":\"2026-07-18T10:00:00Z\",\"linked_entities\":[\"RFC-18\",\"PR-448\"]}],\"total\":2,\"query\":{\"limit\":5,\"since\":\"2026-07-01\"}}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
# No direct CLI single-purpose command, but decisions appear in:
pm status --json       # Latest decision
```

The CLI `pm log` creates decisions, and `pm status` shows the latest.

**Rules enforcement:** None (passive)

---

#### `pm_get_scope`

**Latest scope snapshot.** Returns the current sprint scope or a specific sprint's snapshot from history.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    sprint_name: {
      type: "string",
      description: "Sprint name to look up (e.g., 'Sprint 14'). Omit for latest snapshot."
    }
  },
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "pm_get_scope",
    "arguments": {
      "sprint_name": "Sprint 14"
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"sprint_name\":\"Sprint 14\",\"committed_days\":8,\"remaining_days\":4,\"risk\":\"MEDIUM\",\"captured_at\":\"2026-07-21T10:00:00Z\",\"is_latest\":true}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm scope "check" --json           # Shows current scope context
pm scope "check" --sprint "Sprint 14" --json
```

**Rules enforcement:** None (passive)

---

#### `pm_get_notes`

**Notes.** Returns freeform notes with optional filtering by tag, search term, limit, or recency.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    tag: {
      type: "string",
      description: "Filter notes by tag (e.g., 'stakeholder', 'sprint-14')"
    },
    search: {
      type: "string",
      description: "Full-text search within note content"
    },
    limit: {
      type: "number",
      description: "Maximum notes to return (default: 50)"
    },
    since: {
      type: "string",
      format: "date",
      description: "ISO date string filter. Only notes created on or after this date."
    }
  },
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "pm_get_notes",
    "arguments": {
      "tag": "stakeholder",
      "limit": 10
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"notes\":[{\"id\":\"NOTE-013\",\"content\":\"Stakeholder approved the dark mode design. Moving to sprint 15.\",\"tags\":[\"stakeholder\",\"sprint-15\"],\"linked_entities\":[],\"created_at\":\"2026-07-21T15:00:00Z\"},{\"id\":\"NOTE-010\",\"content\":\"Stakeholder wants analytics dashboard by end of Q3\",\"tags\":[\"stakeholder\",\"roadmap\"],\"linked_entities\":[],\"created_at\":\"2026-07-15T09:00:00Z\"}],\"total\":2,\"filter_tag\":\"stakeholder\"}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
# No direct CLI equivalent for listing notes, but notes appear in:
pm standup --json     # Includes recent notes count
pm status --json      # Includes notes total
```

**Rules enforcement:** None (passive)

---

#### `pm_get_standup`

**Standup summary.** Generates a structured "yesterday / today / blockers" summary by querying recent decisions, resolved blockers, active blockers, notes, and sprint context.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    since: {
      type: "string",
      format: "date",
      description: "ISO date string for lookback (default: 24 hours ago). E.g., '2026-07-20' or ISO datetime."
    }
  },
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "pm_get_standup",
    "arguments": {}
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"date\":\"2026-07-21\",\"project\":\"auth-service\",\"sprint\":\"Sprint 14\",\"sprint_remaining_days\":4,\"sprint_risk\":\"MEDIUM\",\"yesterday\":{\"decisions\":[{\"id\":\"ADR-004\",\"title\":\"Drop OAuth, use magic links\"}],\"blockers_resolved\":[{\"id\":\"BLK-003\",\"title\":\"PR #442 needs review\"}],\"notes_count\":3},\"today\":[\"Implement magic link flow (AUTH-92)\",\"Review RFC #18 for GraphQL migration\",\"Follow up on CI flakiness (BLK-005)\"],\"blockers\":[{\"id\":\"BLK-004\",\"title\":\"RFC #18 unanswered\",\"age_hours\":72,\"blocked_by\":\"@design-lead\"},{\"id\":\"BLK-005\",\"title\":\"CI pipeline flaky on main\",\"age_hours\":5,\"blocked_by\":\"infra\"}]}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm standup --json
pm standup --yesterday 3d --json
```

**Rules enforcement:** None (passive)

---

#### `pm_prep_meeting`

**Meeting preparation brief.** Generates a structured meeting brief with agenda suggestions, recent decisions, open blockers, and linked context for specified tickets.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Meeting title (required)"
    },
    related_tickets: {
      type: "array",
      items: {
        type: "string"
      },
      description: "Array of ticket IDs to include in the brief (e.g., ['AUTH-91', 'AUTH-92'])"
    },
    duration_minutes: {
      type: "number",
      description: "Meeting duration in minutes (used for agenda time-boxing)"
    }
  },
  required: ["title"],
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "pm_prep_meeting",
    "arguments": {
      "title": "Sprint Review",
      "related_tickets": ["AUTH-91", "AUTH-92", "AUTH-93"],
      "duration_minutes": 30
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"title\":\"Sprint Review\",\"duration_minutes\":30,\"date\":\"2026-07-21\",\"sprint\":\"Sprint 14\",\"sprint_remaining_days\":4,\"sprint_risk\":\"MEDIUM\",\"agenda_suggestions\":[\"Review completed work (AUTH-93: in review)\",\"Discuss blocked items (AUTH-91: blocked on PR #442)\",\"Review in-progress work (AUTH-92: @bob)\",\"Capacity check: 4 days remaining, MEDIUM risk\",\"Sprint 15 planning preview\"],\"recent_decisions\":[{\"id\":\"ADR-004\",\"title\":\"Drop OAuth, use magic links\",\"author\":\"alice\",\"made_at\":\"2026-07-21T14:30:00Z\"}],\"open_blockers\":[{\"id\":\"BLK-004\",\"title\":\"RFC #18 unanswered\",\"age_hours\":72},{\"id\":\"BLK-005\",\"title\":\"CI pipeline flaky on main\",\"age_hours\":5}],\"ticket_context\":[{\"id\":\"AUTH-91\",\"status\":\"blocked\",\"note\":\"Blocked on PR #442 (BLK-003)\"},{\"id\":\"AUTH-92\",\"status\":\"in_progress\",\"owner\":\"bob\"},{\"id\":\"AUTH-93\",\"status\":\"in_review\"}]}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
# No direct CLI command, but this functionality exists via:
pm standup --json     # Partial overlap
pm status --json      # Sprint and blocker info
```

**Rules enforcement:** None (passive)

---

### PM Write Tools (Active)

Active tools **modify state** in the memory layer. They may trigger the **rules engine**, which can produce blocks, confirmations, notifications, or suggestions. The AI should handle these responses appropriately.

---

#### `pm_log_decision`

**Log a decision.** Creates an Architecture Decision Record (ADR) with an auto-generated ID. The decision is stored in the memory layer and linked to related entities via keyword matching in title/body.

**May trigger rules:** Yes — `decision-before-close` rule may fire if the decision is associated with closing a ticket.

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Short, descriptive title of the decision (required)"
    },
    body: {
      type: "string",
      description: "Detailed body text explaining context, rationale, and consequences"
    },
    author: {
      type: "string",
      description: "Who made the decision. Defaults to git config user.name if available"
    },
    links: {
      type: "array",
      items: {
        type: "string"
      },
      description: "Array of entity IDs to link (tickets, PRs, other ADRs). E.g., ['AUTH-91', 'PR-442']"
    }
  },
  required: ["title"],
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "pm_log_decision",
    "arguments": {
      "title": "Drop OAuth, use magic links",
      "body": "Magic links eliminate the password reset flow entirely. Reduces auth surface area.",
      "author": "alice",
      "links": ["AUTH-91", "PR-442"]
    }
  }
}
```

**Example response (no rule blocks):**

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"created\",\"id\":\"ADR-004\",\"title\":\"Drop OAuth, use magic links\",\"author\":\"alice\",\"made_at\":\"2026-07-21T14:30:00Z\",\"links\":[\"AUTH-91\",\"PR-442\"],\"linked_blockers\":[\"BLK-003: PR #442 unreviewed\"],\"linked_tasks\":[\"TASK-007: Implement magic link flow\"],\"linked_notes\":[],\"rules_evaluation\":{\"status\":\"completed\",\"triggered\":[],\"blocked\":false}}"
      }
    ]
  }
}
```

**Example response (rule blocks):**

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"rejected\",\"id\":null,\"error\":\"Rule 'decision-before-close' fired: hard block\",\"message\":\"Cannot close AUTH-91: no decision logged. Run `pm log` first.\",\"rules_evaluation\":{\"status\":\"rejected\",\"triggered\":[{\"rule\":\"decision-before-close\",\"severity\":\"hard\",\"action\":\"block\",\"message\":\"Cannot close AUTH-91: no decision logged. Run `pm log` first.\"}],\"blocked\":true}}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm log "Drop OAuth, use magic links" --body "..." --author alice --link AUTH-91 --link PR-442 --json
```

**Rules enforcement:** Active. The `decision-before-close` rule may fire if the decision is linked to ticket closure. Other PM-scoped rules may also evaluate.

---

#### `pm_log_note`

**Create a note.** Logs a freeform note with auto-tagging and auto-linking to related entities. The engine scans the note content for keywords matching ticket IDs, PR numbers, and ADR references, linking them automatically.

**Type:** Active (writes to DB, but rules evaluation is passive — no blocking rules typically fire)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    content: {
      type: "string",
      description: "The note content (required). Supports freeform text."
    },
    tags: {
      type: "array",
      items: {
        type: "string"
      },
      description: "Tags to apply (e.g., ['stakeholder', 'sprint-14'])"
    },
    links: {
      type: "array",
      items: {
        type: "string"
      },
      description: "Explicit entity links (e.g., ['AUTH-91', 'PR-442'])"
    }
  },
  required: ["content"],
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "tools/call",
  "params": {
    "name": "pm_log_note",
    "arguments": {
      "content": "Stakeholder approved the dark mode design. Moving to sprint 15.",
      "tags": ["stakeholder", "sprint-15"]
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"created\",\"id\":\"NOTE-013\",\"content\":\"Stakeholder approved the dark mode design. Moving to sprint 15.\",\"tags\":[\"stakeholder\",\"sprint-15\"],\"linked_entities\":[],\"created_at\":\"2026-07-21T15:00:00Z\"}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm note "Stakeholder approved the dark mode design. Moving to sprint 15." --tag stakeholder --tag sprint-15 --json
```

**Rules enforcement:** Minimal. Notes are writes, but no blocking rules target note creation directly. The `daily-blocker-check` and similar info rules may trigger if relevant context is available.

---

#### `pm_check_scope`

**Scope risk assessment.** Evaluates whether proposed work fits within the current sprint capacity. Returns a risk level (LOW / MEDIUM / HIGH) and recommendations.

**May trigger rules:** Yes — the `scope-check` rule may fire a confirmation prompt if the impact exceeds 50% of remaining capacity.

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    description: {
      type: "string",
      description: "Description of the proposed work (required). May include effort estimate."
    },
    impact_days: {
      type: "number",
      description: "Estimated effort in days (required)"
    },
    sprint_name: {
      type: "string",
      description: "Sprint name to check against (defaults to latest snapshot)"
    }
  },
  required: ["description", "impact_days"],
  additionalProperties: false
}
```

**Example request (LOW risk):**

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "pm_check_scope",
    "arguments": {
      "description": "Add tests for user model",
      "impact_days": 1
    }
  }
}
```

**Example response (LOW risk — passes through):**

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"approved\",\"sprint\":\"Sprint 14\",\"committed_days\":8,\"remaining_days\":4,\"impact_days\":1,\"risk\":\"LOW\",\"over_capacity\":false,\"recommendations\":[\"Fits within sprint capacity. No action needed.\"],\"rules_evaluation\":{\"status\":\"completed\",\"triggered\":[],\"blocked\":false,\"confirmation_required\":false}}"
      }
    ]
  }
}
```

**Example request (HIGH risk):**

```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "tools/call",
  "params": {
    "name": "pm_check_scope",
    "arguments": {
      "description": "Add dark mode support",
      "impact_days": 5
    }
  }
}
```

**Example response (HIGH risk — confirmation requested):**

```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"pending_confirmation\",\"sprint\":\"Sprint 14\",\"committed_days\":8,\"remaining_days\":4,\"impact_days\":5,\"risk\":\"HIGH\",\"over_capacity_days\":3,\"recommendations\":[\"Move lower-priority work to sprint 15\",\"Reduce scope to MVP (estimated 2 days)\",\"Or defer to sprint 15 (recommended)\"],\"rules_evaluation\":{\"status\":\"pending_confirmation\",\"triggered\":[{\"rule\":\"scope-check\",\"severity\":\"soft\",\"action\":\"confirm\",\"message\":\"Adding 'Add dark mode support' adds 5 days to a sprint with only 4 days remaining. This will push existing work and may cause spillover.\"}],\"blocked\":false,\"confirmation_required\":true,\"confirm_message\":\"Adding 'Add dark mode support' adds 5 days to a sprint with only 4 days remaining. This will push existing work and may cause spillover. Proceed?\"}}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm scope "Add dark mode" --impact 5 --json
pm scope "Add dark mode" --impact 5 --sprint "Sprint 14" --json
```

**Rules enforcement:** Active. The `scope-check` rule fires when `impact_days > remaining_days * 0.5`, requesting user confirmation.

---

#### `pm_add_rule`

**Create a new rule.** Adds a rule to the rules engine. The rule is immediately active and will be evaluated on matching triggers.

**Type:** Active (writes to `rules.toml`, no rules evaluate the act of adding a rule itself)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Unique kebab-case rule name (required, e.g., 'no-console-log')"
    },
    scope: {
      type: "string",
      enum: ["pm", "code", "all"],
      description: "Which context this rule applies to. Default: 'pm'"
    },
    trigger: {
      type: "string",
      description: "Trigger expression (required). What event or state triggers evaluation (e.g., 'file.saved', 'pr.age > 48h')"
    },
    condition: {
      type: "string",
      description: "Optional condition expression. Additional boolean check after trigger matches (e.g., 'file.path == \\'src/**/*.ts\\' && file.contains(\\'any\\')')"
    },
    action: {
      type: "string",
      description: "Action string in format 'type: message' (required). Types: block, confirm, notify, suggest, generate. E.g., 'suggest: Remove console.log before committing'"
    },
    severity: {
      type: "string",
      enum: ["hard", "soft", "info"],
      description: "How strictly to enforce. Default: 'info'"
    },
    description: {
      type: "string",
      description: "Human-readable explanation of why this rule exists"
    }
  },
  required: ["name", "trigger"],
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "method": "tools/call",
  "params": {
    "name": "pm_add_rule",
    "arguments": {
      "name": "no-console-log",
      "scope": "code",
      "trigger": "file.saved",
      "condition": "file.path == 'src/**/*.ts' && file.contains('console.log')",
      "action": "suggest: 'Remove console.log before committing. Use a logger instead.'",
      "severity": "soft",
      "description": "Remind developers to remove debugging console.log statements"
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"created\",\"rule\":\"no-console-log\",\"scope\":\"code\",\"severity\":\"soft\",\"message\":\"Rule 'no-console-log' added and enabled. It will be evaluated on matching triggers.\"}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm rules add "no-console-log" \
  --scope code \
  --trigger "file.saved" \
  --condition "file.path == 'src/**/*.ts' && file.contains('console.log')" \
  --action "suggest: 'Remove console.log before committing. Use a logger instead.'" \
  --severity soft \
  --description "Remind developers to remove debugging console.log statements"
```

**Rules enforcement:** None (creating a rule is not itself subject to rules evaluation).

---

#### `pm_enforce_rules`

**Evaluate rules against provided context.** Programmatically runs all matching rules against a given context object. This is the general-purpose enforcement entry point — useful for custom integrations, testing rules, or checking context that isn't covered by a specific tool.

**Type:** Active (evaluates rules and may return blocks/confirmations, but does not modify state)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    context: {
      type: "object",
      description: "Context object to evaluate rules against (required). Can include any properties that rules might reference (blockers, tickets, pr, file, etc.).",
      additionalProperties: true
    },
    scope: {
      type: "string",
      enum: ["pm", "code", "all"],
      description: "Optional scope filter. If omitted, evaluates all rules."
    }
  },
  required: ["context"],
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 13,
  "method": "tools/call",
  "params": {
    "name": "pm_enforce_rules",
    "arguments": {
      "context": {
        "blockers": {
          "count": 2,
          "list": "BLK-004: RFC #18 unanswered (3d), BLK-005: CI pipeline flaky on main (5h)"
        },
        "sprint": {
          "remaining_days": 4,
          "risk": "MEDIUM"
        }
      },
      "scope": "pm"
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 13,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"completed\",\"results\":[{\"rule\":\"decision-before-close\",\"severity\":\"hard\",\"action\":\"block\",\"message\":\"Cannot close ticket without a decision record\",\"triggered\":false,\"passed\":true},{\"rule\":\"scope-check\",\"severity\":\"soft\",\"action\":\"confirm\",\"message\":\"Sprint risk is MEDIUM with 4 days remaining\",\"triggered\":false,\"passed\":true},{\"rule\":\"daily-blocker-check\",\"severity\":\"info\",\"action\":\"notify\",\"message\":\"You have 2 active blockers today: BLK-004: RFC #18 unanswered (3d), BLK-005: CI pipeline flaky on main (5h)\",\"triggered\":true,\"passed\":true}],\"rules_evaluated\":5,\"rules_triggered\":1,\"rules_blocked\":0}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
# No direct CLI equivalent. The rules engine runs automatically during other commands.
# To see enforcement results:
pm scope "check" --json         # Scope check triggers rule evaluation
pm status --json                # Status includes some rule info
```

**Rules enforcement:** This tool IS the rules enforcement entry point. It evaluates all matching rules against the provided context.

---

### Codebase Intelligence Tools (Passive)

Codebase intelligence tools query the scanned codebase index. They are **read-only** and do **not** trigger the rules engine. They require a prior `pm_scan_codebase` or `pm scan` to build the index.

---

#### `pm_scan_codebase`

**Scan / index the project.** Walks the project tree, hashes every file, classifies types, builds the dependency graph, detects architecture patterns, and indexes documentation for full-text search. Supports full, incremental, and verify modes.

**Type:** Passive (read-only with respect to PM context — does not trigger PM rules)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    mode: {
      type: "string",
      enum: ["full", "incremental", "verify"],
      description: "Scan mode: 'full' for cold-start complete walk, 'incremental' for changed files only (default), 'verify' to check index consistency"
    },
    watch: {
      type: "boolean",
      description: "If true, watch for file changes and re-scan continuously"
    }
  },
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 14,
  "method": "tools/call",
  "params": {
    "name": "pm_scan_codebase",
    "arguments": {
      "mode": "full"
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 14,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"completed\",\"mode\":\"full\",\"total\":1234,\"new\":1234,\"modified\":0,\"deleted\":0,\"duration_seconds\":12.4,\"summary\":{\"source\":892,\"test\":187,\"doc\":34,\"config\":45,\"asset\":76},\"dependencies\":{\"total_edges\":4321,\"circular_count\":2},\"architecture\":{\"framework\":\"Express.js\",\"entry_points\":[\"src/main.ts\",\"src/api/index.ts\"]}}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm scan --full --json
pm scan --json                    # Incremental
pm scan --verify --json           # Verify
```

**Rules enforcement:** None (passive)

---

#### `pm_get_dependency_graph`

**Dependencies for a file.** Returns what a file imports and what imports it, as a tree. Supports configurable traversal depth and reverse-only mode.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "File path relative to project root (required). E.g., 'src/auth/service.ts'"
    },
    depth: {
      type: "number",
      description: "Traversal depth for transitive dependencies (default: 1)"
    },
    reverse: {
      type: "boolean",
      description: "If true, only show what imports this file (reverse dependencies)"
    }
  },
  required: ["path"],
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 15,
  "method": "tools/call",
  "params": {
    "name": "pm_get_dependency_graph",
    "arguments": {
      "path": "src/auth/service.ts",
      "depth": 2
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 15,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"file\":\"src/auth/service.ts\",\"imports\":[{\"path\":\"src/user/model.ts\",\"type\":\"static\"},{\"path\":\"src/db/client.ts\",\"type\":\"static\"},{\"path\":\"src/utils/jwt.ts\",\"type\":\"static\"}],\"imported_by\":[{\"path\":\"src/routes/login.ts\",\"type\":\"static\"},{\"path\":\"src/middleware/auth.ts\",\"type\":\"static\"},{\"path\":\"tests/auth/service.test.ts\",\"type\":\"static\"}]}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm depends src/auth/service.ts --depth 2 --json
pm depends src/auth/service.ts --reverse --json
```

**Rules enforcement:** None (passive)

---

#### `pm_analyze_impact`

**Impact analysis.** Shows everything that breaks if you change a file — direct dependents, transitive dependents, and linked PM context (decisions, blockers, tasks, notes that reference this file).

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "File path relative to project root (required). E.g., 'src/user/model.ts'"
    },
    depth: {
      type: "number",
      description: "Transitive traversal depth (default: 2)"
    }
  },
  required: ["path"],
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 16,
  "method": "tools/call",
  "params": {
    "name": "pm_analyze_impact",
    "arguments": {
      "path": "src/user/model.ts",
      "depth": 2
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 16,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"target\":\"src/user/model.ts\",\"direct_dependents\":[\"src/auth/service.ts\",\"src/profile/view.ts\",\"tests/user/model.test.ts\"],\"transitive_dependents\":[\"src/routes/login.ts\",\"src/middleware/auth.ts\",\"src/routes/profile.ts\",\"src/handlers/user.ts\",\"tests/auth/service.test.ts\",\"tests/e2e/login.test.ts\",\"tests/e2e/profile.test.ts\"],\"total_affected\":10,\"linked_context\":{\"decisions\":[{\"id\":\"ADR-004\",\"title\":\"Refactor user model next sprint\"}],\"blockers\":[{\"id\":\"BLK-003\",\"title\":\"PR #442 blocked on auth service\"}],\"tasks\":[{\"id\":\"TASK-007\",\"title\":\"Implement magic link flow\"}],\"notes\":[{\"id\":\"NOTE-013\",\"content\":\"Stakeholder approved dark mode\"}]}}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm impact src/user/model.ts --depth 2 --json
```

**Rules enforcement:** None (passive)

---

#### `pm_search_codebase`

**Full-text search.** Searches indexed code and documentation using SQLite FTS5. Returns results with path, line number, and snippet preview.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query (required). Supports plain text or FTS5 syntax."
    },
    scope: {
      type: "string",
      enum: ["code", "docs", "all"],
      description: "Search scope: 'code' for source/test files, 'docs' for documentation, 'all' for both (default: 'all')"
    },
    type: {
      type: "string",
      enum: ["source", "test", "doc", "config"],
      description: "Filter by file type classification"
    },
    max_results: {
      type: "number",
      description: "Maximum results to return (default: 20)"
    }
  },
  required: ["query"],
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 17,
  "method": "tools/call",
  "params": {
    "name": "pm_search_codebase",
    "arguments": {
      "query": "deleted_at",
      "scope": "all",
      "max_results": 10
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 17,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"query\":\"deleted_at\",\"total_results\":3,\"results\":[{\"path\":\"src/models/user.ts\",\"line\":42,\"type\":\"source\",\"snippet\":\"  deleted_at: DateTime | null;\"},{\"path\":\"src/migrations/003_add_deleted_at.sql\",\"line\":5,\"type\":\"source\",\"snippet\":\"ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;\"},{\"path\":\"README.md\",\"line\":143,\"type\":\"doc\",\"snippet\":\"Soft deletes use the `deleted_at` timestamp on each table.\"}]}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm search "deleted_at" --scope all --limit 10 --json
pm search "deleted_at" --scope code --json
pm search "deleted_at" --type source --json
```

**Rules enforcement:** None (passive)

---

#### `pm_get_architecture`

**Architecture overview.** Returns the project's detected architecture: framework, entry points, layer structure, file counts by type, circular dependencies, and index status.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {},
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 18,
  "method": "tools/call",
  "params": {
    "name": "pm_get_architecture",
    "arguments": {}
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"project\":\"auth-service\",\"framework\":\"Express.js\",\"entry_points\":[\"src/main.ts\",\"src/api/index.ts\"],\"layers\":[{\"from\":\"routes\",\"to\":\"controllers\",\"file_count\":7},{\"from\":\"controllers\",\"to\":\"services\",\"file_count\":5},{\"from\":\"services\",\"to\":\"models\",\"file_count\":4},{\"from\":\"models\",\"to\":\"db\",\"file_count\":3},{\"from\":\"middleware\",\"to\":\"routes\",\"file_count\":3}],\"files_by_type\":{\"source\":892,\"test\":187,\"doc\":34,\"config\":45,\"asset\":76,\"total\":1234},\"circular_dependencies\":2,\"circular_chains\":[\"src/utils/helpers.ts \\u2194 src/utils/format.ts\",\"src/middleware/auth.ts \\u2194 src/routes/auth.ts\"],\"indexed\":1234,\"last_scanned\":\"2026-07-21T14:00:00Z\",\"unindexed_files\":0}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
pm arch --json
```

**Rules enforcement:** None (passive)

---

#### `pm_get_file_context`

**PM context linked to a file.** Returns decisions, blockers, tasks, and notes that reference a specific file path. This links the codebase intelligence layer with the PM memory layer.

**Type:** Passive (read-only, no rules triggered)

**Input schema:**

```typescript
{
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "File path relative to project root (required). E.g., 'src/auth/service.ts'"
    }
  },
  required: ["path"],
  additionalProperties: false
}
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "pm_get_file_context",
    "arguments": {
      "path": "src/auth/service.ts"
    }
  }
}
```

**Example response:**

```json
{
  "jsonrpc": "2.0",
  "id": 19,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"path\":\"src/auth/service.ts\",\"decisions\":[{\"id\":\"ADR-004\",\"title\":\"Drop OAuth, use magic links\"}],\"blockers\":[{\"id\":\"BLK-003\",\"title\":\"PR #442 blocked on auth service\"}],\"tasks\":[{\"id\":\"TASK-007\",\"title\":\"Implement magic link flow\"}],\"notes\":[]}"
      }
    ]
  }
}
```

**CLI equivalent:**

```bash
# No direct CLI command, but `pm files` lists indexed files.
# File context is included in:
pm impact src/auth/service.ts --json   # Includes linked context
```

**Rules enforcement:** None (passive)

---

## Tool Response Format

All MCP tools return responses following the MCP standard format:

```typescript
{
  content: [
    {
      type: "text",
      text: JSON.stringify(result)
    }
  ],
  isError?: boolean  // Present only on error responses
}
```

### Success Response Structure

Every successful response contains a single `content` entry with `type: "text"`. The `text` field is always a JSON string (not a raw object — it must be parsed by the client).

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"created\",\"id\":\"ADR-004\",\"title\":\"Drop OAuth, use magic links\"}"
      }
    ]
  }
}
```

The AI client should parse the `text` field to access the structured result.

### Common Result Fields

Most tools return results with a consistent structure:

| Field                                    | Present In                    | Description                                                                      |
| ---------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `status`                                 | Write tools, `pm_check_scope` | `"created"`, `"approved"`, `"rejected"`, `"pending_confirmation"`, `"completed"` |
| `rules_evaluation`                       | Write tools, `pm_check_scope` | Nested object with enforcement results                                           |
| `rules_evaluation.status`                | —                             | `"completed"`, `"rejected"`, `"pending_confirmation"`                            |
| `rules_evaluation.triggered`             | —                             | Array of rules that matched                                                      |
| `rules_evaluation.blocked`               | —                             | Boolean, whether any hard rule blocked                                           |
| `rules_evaluation.confirmation_required` | —                             | Boolean, whether a soft rule needs confirmation                                  |

### Error Response Structure

Error responses follow JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": {
      "type": "config_error",
      "detail": "Configuration file not found at ~/.config/pm-agent/config.toml"
    }
  }
}
```

---

## Rules Enforcement in MCP

Rules enforcement in the MCP context works differently than in the CLI context. The key difference: **MCP cannot do interactive prompts**. The server must communicate enforcement state through the response, and the AI agent is responsible for handling it.

### How Severity Levels Map to MCP

| Severity         | CLI Behavior                    | MCP Behavior                                                                                                             |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `hard` (block)   | Red error + abort               | Returns `status: "rejected"` with block message. The AI should inform the user and not proceed                           |
| `soft` (confirm) | Yellow warning + `[Y/n]` prompt | Returns `status: "pending_confirmation"` with confirm message. The AI should ask the user, then either proceed or cancel |
| `info` (notify)  | Blue info message               | Returns info in the `rules_evaluation` array. The AI should inform the user                                              |

### Block: Hard Rule Fires

When a `hard` severity rule blocks an operation, the tool returns an error status with the block message:

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"rejected\",\"id\":null,\"error\":\"Rule 'decision-before-close' fired: hard block\",\"message\":\"Cannot close AUTH-91: no decision logged. Run `pm log` first.\",\"rules_evaluation\":{\"status\":\"rejected\",\"triggered\":[{\"rule\":\"decision-before-close\",\"severity\":\"hard\",\"action\":\"block\",\"message\":\"Cannot close AUTH-91: no decision logged. Run `pm log` first.\"}],\"blocked\":true}}"
      }
    ]
  }
}
```

**AI response when blocked:**

> I tried to log the decision, but the rules engine blocked it:
> **Cannot close AUTH-91: no decision logged.**
>
> Let me log a decision first using `pm_log_decision`, then we can proceed.

### Confirm: Soft Rule Fires

When a `soft` severity rule fires, the tool returns the confirmation request. The AI asks the user, and if confirmed, can re-invoke the tool with a confirmation flag:

```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"pending_confirmation\",\"risk\":\"HIGH\",\"rules_evaluation\":{\"status\":\"pending_confirmation\",\"triggered\":[{\"rule\":\"scope-check\",\"severity\":\"soft\",\"action\":\"confirm\",\"message\":\"Adding 'Add dark mode support' adds 5 days to a sprint with only 4 days remaining.\"}],\"confirmation_required\":true,\"confirm_message\":\"Adding 'Add dark mode support' adds 5 days to a sprint with only 4 days remaining. Proceed?\"}}"
      }
    ]
  }
}
```

**AI interaction:**

> **AI:** The scope check flagged a HIGH risk. Adding dark mode adds 5 days to a sprint with only 4 days remaining. Would you like to proceed, or should we defer?
>
> **User:** Yes, proceed.
>
> **AI:** (re-invokes `pm_check_scope` with a confirmation flag, or the user's confirmation is noted and the AI proceeds accordingly)

### Info: Info Rule Fires

Info rules never block. They append informational messages to the response:

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"date\":\"2026-07-21\",\"blockers\":[...],\"rules_evaluation\":{\"status\":\"completed\",\"triggered\":[{\"rule\":\"daily-blocker-check\",\"severity\":\"info\",\"action\":\"notify\",\"message\":\"You have 2 active blockers today\"}]}}"
      }
    ]
  }
}
```

The AI can choose to surface this to the user or not, depending on context.

---

## Error Handling

The MCP server handles errors gracefully and returns structured information.

### Configuration Missing

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "PM Agent config not found",
    "data": {
      "type": "config_error",
      "detail": "Configuration file not found at ~/.config/pm-agent/config.toml. Run `pm init` to create it.",
      "resolution": "Run `pm init` in your project directory to initialize PM Agent."
    }
  }
}
```

### Database Does Not Exist

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Project database not found",
    "data": {
      "type": "db_error",
      "detail": "Database file not found at ~/.local/share/pm-agent/auth-service.db. Run `pm init` to create it.",
      "resolution": "Run `pm init` from your project root, or specify --project to override."
    }
  }
}
```

### Rule Blocks an Action

This is **not** an error in the transport sense — it's a valid tool response with a `rejected` status:

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"rejected\",\"error\":\"Rule 'decision-before-close' fired: hard block\",\"message\":\"Cannot close AUTH-91: no decision logged.\",\"rules_evaluation\":{\"status\":\"rejected\",\"blocked\":true}}"
      }
    ]
  }
}
```

### Invalid Input

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "type": "validation_error",
      "detail": "Required parameter 'path' is missing for tool 'pm_get_dependency_graph'",
      "schema": {
        "required": ["path"]
      }
    }
  }
}
```

### Scanning a Non-Existent Path

```json
{
  "jsonrpc": "2.0",
  "id": 14,
  "error": {
    "code": -32603,
    "message": "Scan path does not exist",
    "data": {
      "type": "scan_error",
      "detail": "The configured project root does not exist: /Users/me/projects/missing-project",
      "resolution": "Check the 'root' field in your config.toml, or run `pm init` from the correct directory."
    }
  }
}
```

### Permission Error

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Permission denied",
    "data": {
      "type": "permission_error",
      "detail": "Cannot read configuration directory ~/.config/pm-agent/. Check file permissions.",
      "resolution": "Ensure ~/.config/pm-agent/ is readable and that PM Agent has been initialized."
    }
  }
}
```

### Unknown Tool

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": {
      "type": "unknown_tool",
      "detail": "Tool 'pm_unknown' is not registered. Available tools: pm_get_context, pm_get_blockers, ...",
      "resolution": "Call the tools/list method to list all available tools."
    }
  }
}
```

### Error Summary

| Scenario            | HTTP-style Code  | Response Type             | AI Action                               |
| ------------------- | :--------------: | ------------------------- | --------------------------------------- |
| Config missing      |      -32603      | Error                     | Suggest running `pm init`               |
| DB not found        |      -32603      | Error                     | Suggest running `pm init`               |
| Rule blocks         | — (valid result) | `status: "rejected"`      | Inform user, suggest resolution         |
| Invalid input       |      -32602      | Error                     | Fix the tool arguments and retry        |
| Path not found      |      -32603      | Error                     | Verify the path exists                  |
| Permission          |      -32603      | Error                     | Check file permissions                  |
| Unknown tool        |      -32601      | Error                     | Only call registered tools              |
| Integration offline | — (valid result) | Degraded data in response | Note that integration data may be stale |

---

## Integration Examples

### "What's blocking me today?"

**User:** What's blocking me today?

**AI actions:** Calls `pm_get_blockers` with no filters.

```json
// Request
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"pm_get_blockers","arguments":{}}}

// Response
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"blockers\":[{\"id\":\"BLK-004\",\"title\":\"RFC #18 unanswered\",\"age_hours\":72,\"blocked_by\":\"@design-lead\",\"status\":\"open\"},{\"id\":\"BLK-005\",\"title\":\"CI pipeline flaky on main\",\"age_hours\":5,\"blocked_by\":\"infra\",\"status\":\"open\"}],\"active_count\":2}"}]}}
```

**AI response:**

> You have **2 active blockers** today:
>
> 1. **BLK-004** — RFC #18 unanswered (3 days, blocked by @design-lead)
> 2. **BLK-005** — CI pipeline flaky on main (5 hours, blocked by infra)
>
> The RFC has been open for 3 days — consider pinging @design-lead. I can also log a note about the CI issue if you'd like.

---

### "Log that we dropped OAuth"

**User:** Log that we dropped OAuth, we're using magic links now. Link it to AUTH-91.

**AI actions:** Calls `pm_log_decision` with title, body, and links. No rule blocks.

```json
// Request
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pm_log_decision","arguments":{"title":"Drop OAuth, use magic links","body":"Magic links eliminate the password reset flow entirely. Reduces auth surface area.","links":["AUTH-91"]}}}

// Response
{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"status\":\"created\",\"id\":\"ADR-004\",\"title\":\"Drop OAuth, use magic links\",\"made_at\":\"2026-07-21T14:30:00Z\",\"links\":[\"AUTH-91\"],\"rules_evaluation\":{\"status\":\"completed\",\"triggered\":[],\"blocked\":false}}"}]}}
```

**AI response:**

> Logged as **ADR-004**: "Drop OAuth, use magic links"
> Linked to AUTH-91. The decision is now part of the project record.

---

### "Can we add dark mode to this sprint?"

**User:** Can we add dark mode to this sprint? It's about 5 days of work.

**AI actions:** Calls `pm_check_scope` to assess risk. Rule fires — confirmation requested.

```json
// Request
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pm_check_scope","arguments":{"description":"Add dark mode support","impact_days":5}}}

// Response
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"status\":\"pending_confirmation\",\"risk\":\"HIGH\",\"remaining_days\":4,\"impact_days\":5,\"recommendations\":[\"Move lower-priority work to sprint 15\",\"Reduce scope to MVP (estimated 2 days)\",\"Or defer to sprint 15 (recommended)\"],\"rules_evaluation\":{\"status\":\"pending_confirmation\",\"triggered\":[{\"rule\":\"scope-check\",\"severity\":\"soft\",\"action\":\"confirm\",\"message\":\"Adding 'Add dark mode support' adds 5 days to a sprint with only 4 days remaining.\"}],\"confirmation_required\":true}}]"}}
```

**AI response:**

> I checked the sprint capacity. Here's the assessment:
>
> **Sprint 14:** 8 days committed, 4 days remaining
> **Impact:** 5 days (125% of remaining capacity)
> **Risk:** HIGH — this will push existing work
>
> **Recommendations:**
>
> 1. Reduce dark mode to MVP (~2 days)
> 2. Move lower-priority work to sprint 15
> 3. Defer dark mode to sprint 15 (recommended)
>
> Would you like to proceed with the full scope, reduce it, or defer?

---

### "Scan the codebase and tell me about it"

**User:** Scan the codebase and tell me about it.

**AI actions:** Calls `pm_scan_codebase` (full), then `pm_get_architecture` to summarize.

```json
// Request 1: Scan
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"pm_scan_codebase","arguments":{"mode":"full"}}}

// Response 1
{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"{\"status\":\"completed\",\"total\":1234,\"duration_seconds\":12.4,\"summary\":{\"source\":892,\"test\":187},\"dependencies\":{\"total_edges\":4321,\"circular_count\":2},\"architecture\":{\"framework\":\"Express.js\"}}"}]}}

// Request 2: Architecture
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"pm_get_architecture","arguments":{}}}

// Response 2
{"jsonrpc":"2.0","id":5,"result":{"content":[{"type":"text","text":"{\"framework\":\"Express.js\",\"entry_points\":[\"src/main.ts\",\"src/api/index.ts\"],\"files_by_type\":{\"source\":892,\"test\":187,\"total\":1234},\"circular_dependencies\":2}"}]}}
```

**AI response:**

> I've scanned the codebase. Here's the architecture overview:
>
> **Project:** auth-service
> **Framework:** Express.js
> **Size:** 1,234 files (892 source, 187 tests, 34 docs, 45 config, 76 assets)
> **Entry Points:** `src/main.ts`, `src/api/index.ts`
> **Dependencies:** 4,321 edges, 2 circular dependencies detected
>
> The project follows a controller → service → model → db layer structure. There are two small circular dependencies I can show you if you're interested.

---

### "What breaks if I change src/auth/service.ts?"

**User:** What breaks if I change src/auth/service.ts?

**AI actions:** Calls `pm_analyze_impact` for the file.

```json
// Request
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"pm_analyze_impact","arguments":{"path":"src/auth/service.ts","depth":2}}}

// Response
{"jsonrpc":"2.0","id":6,"result":{"content":[{"type":"text","text":"{\"target\":\"src/auth/service.ts\",\"direct_dependents\":[\"src/routes/login.ts\",\"src/middleware/auth.ts\",\"tests/auth/service.test.ts\"],\"transitive_dependents\":[\"src/routes/oauth.ts\"],\"total_affected\":4,\"linked_context\":{\"decisions\":[{\"id\":\"ADR-004\",\"title\":\"Drop OAuth, use magic links\"}],\"blockers\":[{\"id\":\"BLK-003\",\"title\":\"PR #442 needs review\"}],\"tasks\":[{\"id\":\"TASK-007\",\"title\":\"Implement magic link flow\"}]}}"}]}}
```

**AI response:**

> Changing `src/auth/service.ts` affects **4 files**:
>
> **Direct dependents (3):**
>
> - `src/routes/login.ts` — login flow
> - `src/middleware/auth.ts` — auth middleware
> - `tests/auth/service.test.ts` — unit tests
>
> **Transitive dependents (1):**
>
> - `src/routes/oauth.ts` — via login.ts
>
> **Related PM context:**
>
> - **ADR-004**: "Drop OAuth, use magic links" — directly relevant
> - **BLK-003**: PR #442 needs review (2d old) — this file is related
> - **TASK-007**: "Implement magic link flow" — blocked on BLK-003
>
> Be careful — the auth service is central to the login flow and has an outstanding blocker.

---

### "I notice we don't enforce code reviews, want to add a rule?"

**User:** I notice we don't enforce code reviews. Can you add a rule that prevents merging without review?

**AI actions:** Calls `pm_add_rule` to create the rule.

```json
// Request
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"pm_add_rule","arguments":{"name":"review-before-merge","scope":"code","trigger":"pr.ready_for_review","condition":"pr.reviews == 0","action":"block: 'PR {pr.id} has no reviews. At least one approval is required before merge.'","severity":"hard","description":"No PR can be merged without at least one review"}}}

// Response
{"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"{\"status\":\"created\",\"rule\":\"review-before-merge\",\"scope\":\"code\",\"severity\":\"hard\",\"message\":\"Rule 'review-before-merge' added and enabled. It will be evaluated on matching triggers.\"}"}]}}
```

**AI response:**

> I've added the rule `review-before-merge`:
>
> **Scope:** code
> **Trigger:** When a PR is marked ready for review
> **Condition:** If it has zero reviews
> **Action:** Block the merge
> **Severity:** Hard
>
> From now on, any PR with no reviews will be blocked from merging. You can view all rules with `pm rules list` in the CLI, or I can show you the current state.

---

## Client Configuration

Add the PM Agent MCP server to your AI tool's configuration by following the instructions for your client below. No environment variables or API keys are needed — the server uses `stdio` transport and reads project files directly.

### Claude Code

**File:** `./.mcp.json` (project-level) or `~/.claude.json` (user-level)

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

### Cursor

**File:** `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global)

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

> Cursor v0.45+ auto-detects `.cursor/mcp.json` in your project root.

### VS Code

**File:** `.vscode/mcp.json` (project-level) or `~/.vscode/mcp.json` (global)

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

> VS Code uses `.vscode/mcp.json` (since VS Code 1.98+). The older `settings.json` `"mcp.servers"` format is deprecated.

### Zed

**File:** `~/.config/zed/settings.json`

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

> Note: Zed uses **snake_case** — `mcp_servers` not `mcpServers`.

### OpenCode

**File:** `opencode.json` or `opencode.jsonc` (project root)

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

> Note: OpenCode uses `"type": "local"` and `"command"` as an array (not a string).

### Continue.dev

**File:** `~/.continue/config.json` (or `.continue/config.yaml`)

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

> Note: Continue.dev uses an **array** (not an object) for `mcpServers`, with each server as a list item containing a `name` field.

### OpenAI Codex CLI

**File:** `codexrc.toml` or `config.toml` (project root)

```toml
[mcp_servers.pm-agent]
enabled = true

[mcp_servers.pm-agent.transport]
type = "stdio"
command = "npx"
args = ["-y", "@gida-concept/pm-agent-mcp-server"]
```

> Note: Codex CLI uses TOML format. The exact schema may evolve — check the [Codex CLI docs](https://github.com/openai/codex) for the latest reference.
```

### Direct stdio Usage

You can also interact with the MCP server directly by piping JSON-RPC messages:

```bash
# Start the server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx -y @gida-concept/pm-agent-mcp-server

# List available tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | npx -y @gida-concept/pm-agent-mcp-server

# Call a tool
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pm_get_context","arguments":{}}}' | npx -y @gida-concept/pm-agent-mcp-server
```

For a persistent session:

```bash
# Start the server (stays open waiting for JSON-RPC on stdin)
npx -y @gida-concept/pm-agent-mcp-server

# In another terminal, send a command
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' > /proc/$(pgrep -f pm-agent-mcp-server)/fd/0
```

---

## Server Transport

### Transport Protocol

PM Agent MCP Server uses **stdio transport** via the `@modelcontextprotocol/sdk`. The server is launched as a child process by the MCP client (Claude Code, Cursor, etc.) and communicates exclusively over stdin/stdout.

```
┌──────────────────────┐          stdin/stdout          ┌──────────────────────┐
│   MCP Client         │ ──────── JSON-RPC 2.0 ──────── │   PM Agent MCP       │
│   (Claude Code,      │ ◀═════════════════════════════▶ │   Server             │
│    Cursor, ...)       │                                │                      │
└──────────────────────┘                                └──────────────────────┘
       │                                                       │
       │ 1. Launch server as child process                     │
       │ 2. Send JSON-RPC requests via stdin                   │
       │ 3. Read JSON-RPC responses from stdout                │
       │ 4. Terminate server when client exits                 │
```

### Message Format

All communication uses **JSON-RPC 2.0**.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "pm_get_context",
    "arguments": {}
  }
}
```

**Successful response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"project\":\"auth-service\",\"blockers\":[...]}"
      }
    ]
  }
}
```

**Error response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Configuration not found",
    "data": {
      "type": "config_error",
      "detail": "Config file missing at ~/.config/pm-agent/config.toml"
    }
  }
}
```

### JSON-RPC Methods

The server supports the standard MCP methods:

| Method                      | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| `tools/list`                | Returns the list of all registered tools with their schemas |
| `tools/call`                | Invokes a tool by name with arguments                       |
| `notifications/initialized` | Standard MCP lifecycle notification                         |
| `initialize`                | Standard MCP handshake                                      |

### Starting the Server Manually

```bash
# Via npx (auto-downloads if needed)
npx -y pm-agent-mcp

# Via direct path (if built from source)
node packages/mcp-server/dist/index.js

# With custom config path
PM_CONFIG_PATH=/path/to/config.toml npx -y pm-agent-mcp
```

The server outputs a JSON-RPC endpoint message on startup:

```
PM Agent MCP Server running on stdio
```

Then it waits for JSON-RPC 2.0 messages on stdin. Each message must be a single line of JSON terminated by a newline. Responses are written to stdout, one per line.

### Notifications

The server can send JSON-RPC notifications (no `id` field) to the client for asynchronous events:

**Progress notification (long-running operations like full scans):**

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "scan-1742600000",
    "progress": 0.45,
    "message": "Scanning files... (556/1234)"
  }
}
```

**File change notification (watch mode):**

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "level": "info",
    "message": "File changed: src/auth/service.ts — re-indexed"
  }
}
```

### Lifecycle

1. **Startup:** Client spawns the server process. Server loads config and database, registers tools, prints ready message.
2. **Handshake:** Client sends `initialize`, server responds with protocol version and capabilities.
3. **Operation:** Client calls `tools/list` and `tools/call` as needed.
4. **Shutdown:** Client sends SIGTERM or closes stdin. Server closes database connections and exits.

---

## Security Notes

### What the MCP Server Can Do

- **Read and write** PM Agent's SQLite database at `~/.local/share/pm-agent/<project>.db`
- **Read and write** the rules TOML file at `~/.config/pm-agent/rules.toml`
- **Execute shell commands** for codebase scanning (ripgrep, tree, madge, git) within the project root only
- **Watch files** via `fs.watch` within the project root
- **Access configured integrations** (GitHub, Linear) using stored credentials from env vars or OS keychain

### What the MCP Server Cannot Do

- **Access arbitrary files** outside the project root and PM Agent data directories
- **Make network requests** that are not configured integrations (GitHub API, Linear API)
- **Execute arbitrary shell commands** — only predefined scanning tools (rg, tree, madge) with controlled arguments
- **Access OS keychain** without going through PM Agent's CLI
- **Modify project source code** — the server reads source code for indexing but never writes it
- **Open network ports** — the server uses stdio transport only; there is no HTTP server or TCP listener
- **Bypass the rules engine** — all write tools go through rule evaluation

### Credential Storage

| Secret           | Storage Method                                      | Access                                  |
| ---------------- | --------------------------------------------------- | --------------------------------------- |
| `GITHUB_TOKEN`   | Environment variable or OS keychain (via `pm init`) | Read-only, used for GitHub API calls    |
| `LINEAR_API_KEY` | Environment variable or OS keychain                 | Read-only, used for Linear API calls    |
| Config files     | `~/.config/pm-agent/` directory                     | User-owned, 600 permissions recommended |

### Runtime Permissions

The MCP server inherits the permissions of the parent process (the MCP client). It:

- Runs as the same user — respects OS-level file permissions
- Uses the same network access as the parent process
- Cannot escalate privileges

### Rule Safety

Rules defined in `rules.toml`:

- Are evaluated in a sandboxed expression parser — no code execution from rule expressions
- Cannot read files, make network calls, or execute commands
- Can only inspect context objects provided by the server
- Are limited to boolean expressions and template interpolation

### Integration Data Flow

```
Integration API (GitHub, Linear)
       │
       │ TLS 1.3 (encrypted)
       ▼
PM Agent MCP Server
       │
       │ Local SQLite (encrypted at rest — optional)
       ▼
MCP Client (your AI)
```

- All API calls to integrations use TLS
- Credentials are never exposed to the MCP client — the server proxies all API calls
- Cached integration data is stored in the local SQLite database

### Best Practices

1. **Run `pm init` to set up** — this creates the config directory with appropriate permissions
2. **Use environment variables** for API tokens rather than hardcoding in config files
3. **Review rules regularly** — hard rules can block legitimate work; monitor and adjust
4. **Keep the database backed up** — `~/.local/share/pm-agent/` contains project memory
5. **Version-control your rules** — share `rules.toml` with your team via your repository

---

## Quick Reference Card

```bash
# ── First Call ─────────────────────────────────────────────────
# When an AI first connects to a project, call pm_get_context
# to get the full project state in one shot.

# ── PM Context (passive) ──────────────────────────────────────
pm_get_context              # Aggregated project state
pm_get_blockers             # Active blockers with optional filters
pm_get_decisions            # Decision records (ADRs)
pm_get_scope                # Sprint scope snapshot
pm_get_notes                # Notes with tag/search filter
pm_get_standup              # Standup summary (yesterday/today/blockers)
pm_prep_meeting             # Meeting prep brief with agenda

# ── PM Write (active — may trigger rules) ─────────────────────
pm_log_decision             # Log a decision (ADR). May trigger decision-before-close
pm_log_note                 # Quick capture with auto-linking
pm_check_scope              # Scope risk assessment. May trigger scope-check
pm_add_rule                 # Create a new rule
pm_enforce_rules            # Evaluate rules against custom context

# ── Codebase Intelligence (passive) ───────────────────────────
pm_scan_codebase            # Scan/index the project (full/incremental/verify)
pm_get_dependency_graph     # Dependencies for a file (imports + imported by)
pm_analyze_impact           # Impact analysis — what breaks if you change a file
pm_search_codebase          # Full-text search across code + docs
pm_get_architecture         # Architecture overview (framework, layers, deps)
pm_get_file_context         # PM context linked to a specific file
```

---

## Changelog

| Version | Date    | Changes                                   |
| ------- | ------- | ----------------------------------------- |
| 1.0     | 2026-07 | Initial MCP tools reference specification |
