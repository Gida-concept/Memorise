# PM Agent — Rules Engine Reference

> The complete guide to the rules engine: triggers, conditions, actions, expression language, and best practices.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Rule Structure](#rule-structure)
- [Scope System](#scope-system)
- [Expression Language](#expression-language)
- [Trigger Reference](#trigger-reference)
- [Condition Reference](#condition-reference)
- [Action Types](#action-types)
- [Severity Levels](#severity-levels)
- [Rule Evaluation Flow](#rule-evaluation-flow)
- [Complete Examples](#complete-examples)
- [PM Agent CLI for Rules](#pm-agent-cli-for-rules)
- [MCP for Rules](#mcp-for-rules)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

Rules are the heart of PM Agent. They make discipline **automatic, not optional** — whether that's PM discipline (log decisions, check scope before adding work, surface blockers before standup) or coding discipline (ban `any` types in shared packages, require tests before merge, enforce strict tsconfig).

The rules engine is a **single evaluator** that reads from a **single TOML file** (`~/.config/pm-agent/rules.toml`). A `scope` field on each rule tells the engine which context applies it. Same parser, same evaluator, one source of truth for everything.

### Design Principles

| Principle                    | What It Means                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| **One engine, scoped rules** | PM and code rules share the same evaluator. The `scope` field routes them           |
| **Enforced, not suggested**  | Rules block, warn, or notify automatically. The agent can't proceed until satisfied |
| **Lightweight expressions**  | No DSL to learn. Property access, comparisons, string containment, boolean logic    |
| **Human-readable TOML**      | Rules are plain text, version-controllable, team-shareable                          |
| **MCP-native**               | Your AI proposes and enforces rules via MCP tools. No manual config required        |

---

## Quick Start

Three ways to create rules, pick your style.

### 1. Write TOML Directly

Edit `~/.config/pm-agent/rules.toml` with any text editor:

```toml
# ~/.config/pm-agent/rules.toml

[[rule]]
scope = "pm"
name = "decision-before-close"
trigger = "ticket.status_change == 'closed'"
condition = "ticket.decisions.count == 0"
action = "block: 'Log a decision before closing {ticket.id}'"
severity = "hard"

[[rule]]
scope = "code"
name = "no-any-in-shared"
trigger = "file.saved"
condition = "file.path == 'packages/shared/**/*.ts' && file.contains('any')"
action = "block: 'Avoid `any` type in shared libraries — use generics or `unknown`'"
severity = "hard"
```

### 2. Use the CLI

Add rules without editing files:

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
```

### 3. Let Your AI Propose Them

Your AI agent can call `pm_add_rule` via MCP to suggest a rule:

```
You: "I keep accidentally pushing console.log to production"

Claude: "I can add a rule to catch that. Here's what I'd add:

  [[rule]]
  scope = "code"
  name = "no-console-log"
  trigger = "file.saved"
  condition = "file.path == 'src/**/*.ts' && file.contains('console.log')"
  action = "suggest: 'Remove console.log before committing. Use a logger instead.'"
  severity = "soft"

  Add this rule? [Y/n]"

You: "yes"
→ Rule 'no-console-log' added and enabled
```

---

## Rule Structure

Every rule is a `[[rule]]` entry in the TOML file with these fields:

```toml
[[rule]]
scope = "pm" | "code" | "all"      # Which context this rule applies in
name = "unique-kebab-case-name"     # Unique identifier for the rule
trigger = "event.expression"        # What event or state triggers evaluation
condition = "boolean_expression"    # (Optional) Additional condition to check
action = "action_type: 'message'"   # What to do when triggered
severity = "hard" | "soft" | "info" # How strictly to enforce
```

### Field Reference

| Field       | Required | Type                           | Description                                                                                                        |
| ----------- | -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `scope`     | Yes      | `"pm"` / `"code"` / `"all"`    | Determines which context evaluates this rule                                                                       |
| `name`      | Yes      | `string`                       | Unique kebab-case identifier. Used for CLI management (`pm rules disable <name>`)                                  |
| `trigger`   | Yes      | `string`                       | Expression that determines when to evaluate this rule. See [Trigger Reference](#trigger-reference)                 |
| `condition` | No       | `string`                       | Optional boolean expression checked **after** the trigger matches. See [Condition Reference](#condition-reference) |
| `action`    | Yes      | `string`                       | What to do when the rule fires. Format: `"type: 'message body'"`. See [Action Types](#action-types)                |
| `severity`  | Yes      | `"hard"` / `"soft"` / `"info"` | How strictly to enforce. See [Severity Levels](#severity-levels)                                                   |

### Optional Fields

```toml
# These fields are optional and not always present:

description = "Human-readable explanation of why this rule exists"
# Default: "" (empty)

enabled = true
# Default: true. Set to false to disable without deleting.
```

### Complete Minimal Rule

```toml
[[rule]]
scope = "all"
name = "stale-pr-alert"
trigger = "pr.age > 48h"
action = "notify: 'PR {pr.id} is over {pr.age} old'"
severity = "soft"
```

A rule with no `condition` fires every time the trigger matches.

---

## Scope System

The `scope` field determines which context evaluates a rule. This keeps PM discipline and coding discipline in the same file without cross-contamination.

| Scope  | Evaluated By                        | When It Runs                                                          | Example Rule                              |
| ------ | ----------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `pm`   | CLI commands, MCP tools             | `pm log`, `pm scope`, `pm blockers`, `pm standup`, `pm_enforce_rules` | "Must log decision before closing ticket" |
| `code` | File watchers, IDE hooks, PR checks | File save, commit, PR opened, file created                            | "No `any` types in shared packages"       |
| `all`  | Both                                | Every evaluation                                                      | "Surface blockers before standup"         |

### How Scope Filtering Works

```typescript
// The engine accepts an optional scope filter
function loadRules(path: string, scope?: 'pm' | 'code'): Rule[] {
  const allRules = parseToml(path);

  if (!scope) return allRules; // No filter → all rules
  if (scope === 'pm') {
    return allRules.filter((r) => r.scope === 'pm' || r.scope === 'all');
  }
  if (scope === 'code') {
    return allRules.filter((r) => r.scope === 'code' || r.scope === 'all');
  }
}
```

- A CLI command calls `loadRules(path, 'pm')` — only `pm` and `all` rules fire
- An IDE file watcher calls `loadRules(path, 'code')` — only `code` and `all` rules fire
- Rules with `scope = "all"` always fire regardless of context

### Why Not Separate Files?

Single file, single evaluator. The alternative would be two separate TOML files with duplicated parsing logic, duplicated utilities, and maintenance burden. The `scope` field keeps everything consistent while separating concerns cleanly.

### Migration Between Scopes

Rules can be re-scoped without changing their logic:

```toml
# Before: only fires in CLI context
[[rule]]
scope = "pm"
name = "tests-before-merge"
trigger = "pr.ready_for_review"
condition = "pr.new_code_without_tests > 0"
action = "block: 'All new code must have tests'"
severity = "hard"

# After: also fires in IDE/PR context
[[rule]]
scope = "all"
name = "tests-before-merge"
# ... same trigger, condition, action, severity
```

---

## Expression Language

Triggers and conditions use a built-in lightweight expression parser. It is not a general-purpose language — it is designed for the narrow domain of checking project state against rule definitions.

### Tokenizer → AST → Evaluation

The parser has three stages:

```
"ticket.decisions.count == 0 && ticket.status == 'closed'"
        │
        ▼
  Tokenizer
  ├─ Property: ticket
  ├─ Access: decisions
  ├─ Access: count
  ├─ Operator: ==
  ├─ Literal: 0
  ├─ Operator: &&
  ├─ Property: ticket
  ├─ Access: status
  ├─ Operator: ==
  └─ Literal: "closed"
        │
        ▼
  AST (Abstract Syntax Tree)
  ├─ BinaryExpression (&&)
  │   ├─ BinaryExpression (==)
  │   │   ├─ PropertyAccess (ticket.decisions.count)
  │   │   └─ Literal (0)
  │   └─ BinaryExpression (==)
  │       ├─ PropertyAccess (ticket.status)
  │       └─ Literal ("closed")
        │
        ▼
  Evaluation against context object
  → true or false
```

### Operators and Syntax

| Feature            | Syntax        | Example                         | Matches When                          |
| ------------------ | ------------- | ------------------------------- | ------------------------------------- |
| Property access    | `.`           | `pr.age`, `ticket.status`       | Navigates into nested context objects |
| Equality           | `==`          | `ticket.status == 'closed'`     | Left equals right                     |
| Inequality         | `!=`          | `file.type != 'test'`           | Left does not equal right             |
| Greater than       | `>`           | `pr.age > 48h`                  | Left is greater than right            |
| Less than          | `<`           | `sprint.remaining_days < 3`     | Left is less than right               |
| Greater or equal   | `>=`          | `blockers.count >= 1`           | Left is greater or equal              |
| Less or equal      | `<=`          | `pr.reviews <= 0`               | Left is less or equal                 |
| String containment | `.contains()` | `file.contains('debugger')`     | File content contains substring       |
| Array length       | `.count`      | `blockers.count > 0`            | Array has more than 0 elements        |
| Boolean AND        | `&&`          | `x > 0 && y == 'active'`        | Both expressions are true             |
| Boolean OR         | `\|\|`        | `x == 'bug' \|\| x == 'hotfix'` | Either expression is true             |

### Template Interpolation

Action messages can reference context values using `{expr}` syntax:

```toml
action = "block: 'Cannot close {ticket.id}: no decision logged'"
action = "notify: 'PR {pr.id} has been open {pr.age} with no reviews'"
action = "suggest: 'Ping {pr.author} about {pr.id}'"
```

The expression inside `{}` follows the same property access rules: `{ticket.id}`, `{pr.author}`, `{blockers.count}`.

### Literal Types

| Type          | Examples                                | Notes                                                  |
| ------------- | --------------------------------------- | ------------------------------------------------------ |
| String        | `'closed'`, `'packages/shared/**/*.ts'` | Single quotes only                                     |
| Number        | `0`, `48`, `3.5`                        | Integers and floats                                    |
| Time duration | `48h`, `2d`, `30m`                      | Hours, days, minutes — compared against context values |
| Boolean       | `true`, `false`                         | Result of conditions, not literal in expressions       |
| Null          | —                                       | Unset or missing context properties evaluate to `null` |

### Duration Comparison

Time durations in triggers and conditions use compact notation:

```
48h    → 48 hours
2d     → 2 days (48 hours)
30m    → 30 minutes
7d     → 7 days
1.5h   → 1.5 hours (90 minutes)
```

Internally, both the literal and the context value are normalized to hours for comparison:

```
pr.age > 48h        → pr.age_hours > 48
pr.age > 2d         → pr.age_hours > 48 (same)
calendar.event.starting_in < 15m  → event_starting_in_minutes < 15
```

### Glob Matching in File Paths

When a condition uses a file path comparison, the engine supports glob patterns:

```toml
# Any TypeScript file in the src directory
condition = "file.path == 'src/**/*.ts'"

# Any test file
condition = "file.path == '**/*.test.ts' || file.path == '**/*.spec.ts'"

# Any file in the shared package
condition = "file.path == 'packages/shared/**/*'"
```

Glob matching uses standard `**` (recursive) and `*` (single-segment) wildcards. The engine matches the glob against the file path using `minimatch` or equivalent.

### Expression Truthiness

The condition expression evaluates to a boolean:

| Value                     | Truthy?                     |
| ------------------------- | --------------------------- |
| `true`                    | Yes                         |
| `false`                   | No                          |
| Number `> 0`              | Yes (in comparison context) |
| Number `0`                | No                          |
| Non-empty string          | Yes                         |
| Empty string              | No                          |
| `null` (missing property) | No                          |
| `.count > 0`              | Depends on count            |
| `.contains('x')`          | Depends on match            |

### Edge Cases

| Expression                     | Evaluates | Explanation                                                    |
| ------------------------------ | --------- | -------------------------------------------------------------- |
| `missing.property == 'x'`      | `false`   | Undefined properties evaluate to `null`, comparison is `false` |
| `ticket.nonexistent.count > 0` | `false`   | Undefined nested path evaluates to `null`, not an error        |
| `'' == ''`                     | `true`    | Empty strings compare correctly                                |
| `pr.age > 9999d`               | Depends   | If no PR is that old, evaluates to `false`                     |

---

## Trigger Reference

A trigger defines **when** a rule should be evaluated. Triggers are either **event-based** (something happened) or **state-based** (a condition is true about current state).

### PM Triggers

These triggers fire in `pm` and `all` scope contexts — during CLI commands, MCP tool calls, or background checks.

| Trigger                  | Expression Pattern                      | Description                                    | Context Available                                                                     |
| ------------------------ | --------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Ticket status change     | `ticket.status_change == 'VALUE'`       | A ticket changed to a specific status          | `ticket.id`, `ticket.status`, `ticket.decisions`, `ticket.has_decision`               |
| Sprint proposed addition | `sprint.proposed_addition`              | Someone is proposing to add work to the sprint | `sprint.impact_days`, `sprint.remaining_days`, `sprint.committed_days`, `sprint.risk` |
| Time-based               | `time == 'HH:MM'`                       | The system clock matches the specified time    | `blockers`, `tasks`, `sprint`                                                         |
| Calendar event           | `calendar.event.starting_in < DURATION` | A calendar event starts within the duration    | `event.title`, `event.starting_in`, `event.has_prep`, `event.related_tickets`         |
| Meeting prep             | `calendar.event.starting_in < 15m`      | Convenience shorthand for event-based trigger  | Same as above                                                                         |
| Command invoked          | `command == 'COMMAND_NAME'`             | A specific CLI command was invoked             | `command.name`, `command.args`                                                        |

### Code Triggers

These triggers fire in `code` and `all` scope contexts — during file operations, IDE hooks, or PR events.

| Trigger             | Expression Pattern    | Description                               | Context Available                                                                                         |
| ------------------- | --------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| File saved          | `file.saved`          | Any file was saved in the editor          | `file.path`, `file.type`, `file.content`, `file.contains()`                                               |
| File created        | `file.created`        | A new file was created                    | `file.path`, `file.type`, `file.content`                                                                  |
| File deleted        | `file.deleted`        | A file was deleted                        | `file.path`, `file.type`                                                                                  |
| File renamed        | `file.renamed`        | A file was renamed                        | `file.old_path`, `file.new_path`, `file.type`                                                             |
| PR ready for review | `pr.ready_for_review` | A pull request was opened or marked ready | `pr.id`, `pr.author`, `pr.age`, `pr.reviews`, `pr.new_code_without_tests`, `pr.additions`, `pr.deletions` |
| PR age threshold    | `pr.age > DURATION`   | A PR has been open past a time threshold  | `pr.id`, `pr.author`, `pr.age`, `pr.reviews`, `pr.status`                                                 |
| Branch pushed       | `branch.pushed`       | Code was pushed to a branch               | `branch.name`, `branch.commits`, `branch.files_changed`                                                   |
| Commit created      | `commit.created`      | A commit was created                      | `commit.message`, `commit.files`, `commit.author`                                                         |

### Custom MCP Triggers

Advanced: rules can be triggered by custom MCP tools that call `pm_enforce_rules` with specific context. This is how third-party integrations create custom triggers.

```
[Custom Integration] ──calls──► pm_enforce_rules(context) ──► Rules Engine
                                     │
                                     └─ Context object includes custom properties
                                        visible to trigger expressions
```

The `pm_enforce_rules` MCP tool accepts a freeform context object. Any property passed in becomes available to trigger and condition expressions:

```json
{
  "custom_event": "deploy_failed",
  "deploy": {
    "environment": "production",
    "service": "auth-service",
    "failed_at": "2026-07-21T14:30:00Z",
    "retry_count": 3
  }
}
```

A rule could then trigger on:

```toml
[[rule]]
scope = "all"
name = "deploy-fail-block"
trigger = "custom_event == 'deploy_failed'"
condition = "deploy.retry_count > 2"
action = "notify: 'Deploy to {deploy.environment} failed {deploy.retry_count} times. Escalating.'"
severity = "hard"
```

### Trigger Resolution Order

When multiple triggers fire simultaneously (e.g., a `pm enforce_rules` call with rich context), rules are evaluated in this order:

1. Rules with `severity = "hard"` first (in order of definition)
2. Rules with `severity = "soft"` second
3. Rules with `severity = "info"` last

This ensures blocking rules surface before informational ones.

---

## Condition Reference

A condition is an **optional** boolean expression that the engine evaluates **after** the trigger matches. It acts as a secondary gate — the trigger says "when to check," the condition says "whether to act."

### How Conditions Work

```
Trigger matches?
  ├─ No  → Skip rule (nothing happens)
  └─ Yes → Condition present?
              ├─ No  → Execute action immediately
              └─ Yes → Evaluate condition expression
                          ├─ true  → Execute action
                          └─ false → Skip rule (nothing happens)
```

### Condition vs Trigger

Fields are separated by concern, not by syntax:

| Aspect      | Trigger         | Condition        |
| ----------- | --------------- | ---------------- |
| Role        | "When to check" | "Whether to act" |
| Required?   | Yes             | No               |
| Expression  | Any expression  | Any expression   |
| Typical use | Event detection | State validation |

### Combining Conditions

Conditions support `&&` (AND) and `||` (OR) for combining multiple checks:

```toml
# AND: both must be true
condition = "file.path == 'packages/shared/**/*.ts' && file.contains('any')"

# OR: either can be true
condition = "pr.age > 48h || pr.reviews == 0"

# Mixed: parentheses are not supported, use explicit chaining
condition = "file.path == 'src/**/*.ts' && file.contains('console.log') && file.type == 'source'"
```

Parentheses are **not supported** in the expression language. Express complex logic by chaining `&&` and `||` with careful ordering — `&&` has higher precedence than `||`.

### Common Condition Patterns

```toml
# File-level conditions
condition = "file.path == 'src/**/*.ts'"             # Only .ts files in src/
condition = "file.path == '**/*.test.ts'"             # Only test files
condition = "file.path != '**/*.d.ts'"                # Exclude declaration files
condition = "file.type == 'source'"                   # Only source files
condition = "file.size > 5000"                        # Files larger than 5KB

# Content conditions
condition = "file.contains('TODO')"                   # Files containing "TODO"
condition = "file.contains('debugger')"               # Files containing "debugger"
condition = "file.contains('any')"                    # Files containing "any"

# State conditions
condition = "blockers.count > 0"                      # At least one blocker
condition = "pr.reviews == 0"                         # No reviews on PR
condition = "ticket.decisions.count == 0"             # No decisions on ticket
condition = "sprint.risk == 'HIGH'"                   # High-risk sprint

# Time conditions
condition = "pr.age > 24h"                            # PR older than 24 hours
condition = "blockers.age_hours > 72"                 # Blocker older than 3 days
```

### When to Omit the Condition

Omit the condition entirely when the trigger is specific enough:

```toml
# Trigger alone is sufficient — no extra condition needed
[[rule]]
scope = "pm"
name = "daily-standup-reminder"
trigger = "time == '09:00'"
action = "notify: 'Time for standup! Type `pm standup` to generate your summary.'"
severity = "info"
```

---

## Action Types

The action field determines what happens when a rule fires. Format: `"action_type: 'message body'"` where `message` can include template interpolation (`{expr}`).

### Action Reference

| Action     | Behavior                                                                       | UX                                                                              | Use When                                                         |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `block`    | Prevents the operation. Returns a rejection message. The caller cannot proceed | CLI: red error + abort. MCP: error response                                     | "This must never happen" — no exceptions                         |
| `confirm`  | Surfaces a warning, asks user to confirm before proceeding                     | CLI: yellow warning + `[Y/n/details]` prompt. MCP: returns confirmation request | "This should usually not happen, but there are valid exceptions" |
| `notify`   | Shows an informational message, doesn't block                                  | CLI: blue/cyan message. MCP: info in response                                   | "The user should know this, but no action required"              |
| `suggest`  | Suggests an action without blocking                                            | CLI: green suggestion. MCP: suggestion in response                              | "Here's something helpful the user might want to do"             |
| `generate` | Auto-generates content (standup prep, meeting brief)                           | CLI: prints generated content. MCP: returns generated content                   | "Automatically prepare context the user needs"                   |

### block

Prevents the operation entirely. Hard stop.

```toml
action = "block: 'Cannot close {ticket.id}: no decision logged. Run `pm log` first.'"
action = "block: 'Avoid `any` type in shared libraries. Use generics or `unknown`.'"
action = "block: 'All new code in {pr.id} must have accompanying tests before merge.'"
action = "block: 'tsconfig.json must use strict mode. Set \"strict\": true.'"
action = "block: 'Cannot add {sprint.proposed_feature}: sprint capacity exceeded by {sprint.overage_days} days.'"
```

**UX (CLI):**

```
$ pm log "drop OAuth" --close-ticket AUTH-91

  [ERROR] Rule 'decision-before-close' fired: hard block
  → Cannot close AUTH-91: no decision logged. Run `pm log` first.

  Action aborted.
```

**UX (MCP return):**

```json
{
  "enforcement": [
    {
      "rule": "decision-before-close",
      "severity": "hard",
      "action": "block",
      "message": "Cannot close AUTH-91: no decision logged. Run `pm log` first."
    }
  ],
  "status": "rejected"
}
```

### confirm

Surfaces a warning and requires explicit confirmation. The user can proceed, but must actively choose to.

```toml
action = "confirm: 'Adding {sprint.proposed_feature} adds {sprint.impact_days} days to a sprint with {sprint.remaining_days} days remaining. This changes scope. Proceed?'"
action = "confirm: 'PR {pr.id} has no reviews after {pr.age}. Mark as ready for review anyway?'"
action = "confirm: 'File {file.path} contains console.log statements. Commit anyway?'"
action = "confirm: 'Sprint risk is {sprint.risk}. Adding more work may cause spillover. Continue?'"
```

**UX (CLI):**

```
$ pm scope "add dark mode"

  ⚠ Rule 'scope-check' fired: soft confirmation
  → Adding "dark mode" adds +5 days to a sprint with 4 days remaining. Proceed?

  Confirm? [Y/n/details] > n
  Action cancelled.
```

### notify

Shows information to the user without blocking. No confirmation required.

```toml
action = "notify: 'You have {blockers.count} active blockers today: {blockers.list}'"
action = "notify: 'PR {pr.id} has been open {pr.age} without review'"
action = "notify: 'Sprint {sprint.name}: {sprint.remaining_days} days left, risk is {sprint.risk}'"
action = "notify: 'Stakeholder meeting at 2pm — {event.related_tickets} tickets to discuss'"
```

**UX (CLI):**

```
$ pm standup
  → [INFO] daily-blocker-check: You have 2 active blockers today:
            BLK-003: PR #442 needs review (2d)
            BLK-004: RFC #18 unanswered (3d)
  → Standup summary generated...
```

### suggest

Offers a recommendation. Less urgent than notify — the user can act on it or ignore.

```toml
action = "suggest: 'Remove console.log before committing. Use a logger instead.'"
action = "suggest: 'PR {pr.id} has been open {pr.age} with no reviews. Ping {pr.author}?'"
action = "suggest: 'This file contains TODO comments. Consider creating tickets for them.'"
action = "suggest: 'You have {tasks.count} tasks in progress. Focus on completing before starting new work.'"
```

**UX (CLI):**

```
$ pm note "need to fix the console.log in auth"
  → [SUGGEST] no-console-log:
    Consider: PR #442 has been open 2d with no reviews. Ping @backend-lead?
```

### generate

Automatically produces content — meeting briefs, standup summaries, impact reports.

```toml
action = "generate: 'Prep brief for {event.title} — compile decisions, blockers, and open questions from {event.related_tickets}'"
action = "generate: 'Standup summary for {sprint.name} — recent decisions, active blockers, task status'"
action = "generate: 'Impact report for changing {file.path} — reverse dependencies and linked PM context'"
```

**UX (CLI):**

```
$ pm prep-meeting "Sprint Review"
  → [GENERATE] meeting-prep:
    ┌─ Meeting Brief: Sprint Review
    │  Date: 2026-07-21
    │  Sprint: 14 (4 days remaining, 8 committed)
    │  Risk: HIGH
    │
    │  Key Decisions:
    │    ADR-004: Drop OAuth, use magic links
    │
    │  Active Blockers:
    │    BLK-003: PR #442 needs review (2d, @backend-lead)
    │
    │  Items to Discuss:
    │    - AUTH-91: blocked on PR #442
    │    - AUTH-92: in progress (@bob)
    │    - AUTH-93: ready for review
    │
    │  Open Questions:
    │    - Is the sprint delay acceptable?
    └─
```

---

## Severity Levels

Severity determines how strictly a rule is enforced — from hard blocks to passive info.

| Severity | Behavior                                                                       | Stops the action? | Requires confirmation? | Surfaces message? |
| -------- | ------------------------------------------------------------------------------ | :---------------: | :--------------------: | :---------------: |
| `hard`   | Prevents the operation. Returns an error. The caller must handle the rejection |        Yes        |          N/A           |        Yes        |
| `soft`   | Warns the user, requires explicit confirmation to proceed                      |        No         |          Yes           |        Yes        |
| `info`   | Surfaces context information, never blocks                                     |        No         |           No           |        Yes        |

### hard — "This Must Never Happen"

Use `hard` for rules that enforce **non-negotiable standards**.

```toml
# No exceptions: you can't close a ticket without a decision
[[rule]]
scope = "pm"
name = "decision-before-close"
trigger = "ticket.status_change == 'closed'"
condition = "ticket.decisions.count == 0"
action = "block: 'Log a decision before closing {ticket.id}'"
severity = "hard"

# No exceptions: shared library code must not use `any`
[[rule]]
scope = "code"
name = "no-any-in-shared"
trigger = "file.saved"
condition = "file.path == 'packages/shared/**/*.ts' && file.contains('any')"
action = "block: 'Avoid `any` type in shared libraries'"
severity = "hard"
```

Hard rules are evaluated **first**, before any soft or info rules. If a hard rule blocks, the operation stops immediately — remaining rules are not evaluated.

### soft — "This Should Usually Not Happen"

Use `soft` for rules that have valid exceptions. The user can proceed after confirming.

```toml
# Usually you shouldn't add scope mid-sprint, but sometimes it's necessary
[[rule]]
scope = "pm"
name = "scope-check"
trigger = "sprint.proposed_addition"
condition = "sprint.impact_days > sprint.remaining_days * 0.5"
action = "confirm: 'This adds {sprint.impact_days} days to a sprint with {sprint.remaining_days} days left. Proceed?'"
severity = "soft"

# Console.log is usually a mistake, but sometimes it's intentional during dev
[[rule]]
scope = "code"
name = "no-console-log"
trigger = "file.saved"
condition = "file.path == 'src/**/*.ts' && file.contains('console.log')"
action = "confirm: 'Remove console.log before committing?'"
severity = "soft"
```

Soft rules are evaluated **after** all hard rules pass. If a soft rule triggers, the engine pauses and waits for user confirmation before continuing.

### info — "Just So You Know"

Use `info` for context that should be surfaced but never blocks.

```toml
# Always helpful to know about blockers
[[rule]]
scope = "all"
name = "daily-blocker-check"
trigger = "time == '09:00'"
condition = "blockers.count > 0"
action = "notify: 'You have {blockers.count} blockers today: {blockers.list}'"
severity = "info"

# Helpful reminder for meeting prep
[[rule]]
scope = "all"
name = "meeting-prep"
trigger = "calendar.event.starting_in < 15m"
condition = "event.has_prep == false"
action = "generate: 'Prep brief for {event.title}'"
severity = "info"
```

Info rules are evaluated **last**, after all hard and soft rules pass. They never interrupt flow — the message is appended to the response.

### Choosing a Severity

| Scenario                        | Use                 | Reasoning                                                  |
| ------------------------------- | ------------------- | ---------------------------------------------------------- |
| Security, compliance, data loss | `hard`              | These are non-negotiable. The operation must be prevented  |
| Team standards, best practices  | `hard`              | If the standard is established, enforce it. No exceptions  |
| Situational judgement calls     | `soft`              | The rule flags the concern, but context matters            |
| Temporary or experimental rules | `soft`              | You're testing a rule — don't block until you're confident |
| Awareness, reminders, context   | `info`              | The user should know, but shouldn't be interrupted         |
| Auto-generated content          | `info` + `generate` | Produce the content, don't block                           |

---

## Rule Evaluation Flow

Rules are evaluated programmatically — every time a CLI command runs, an MCP tool is called, a file is saved, or `pm_enforce_rules` is invoked.

### The Complete Flow

```
Event occurs (CLI command, file save, MCP call, time trigger, custom trigger)
        │
        ▼
  1. Load rules from ~/.config/pm-agent/rules.toml
        │
        ▼
  2. Filter by scope
     ├─ CLI/MCP context  → scope = 'pm'
     ├─ IDE/file context → scope = 'code'
     │  (rules with scope='all' are always included)
        │
        ▼
  3. Build context object
     ├─ Gather current state from memory layer (decisions, blockers, tasks, scope)
     ├─ Gather current state from integrations (GitHub PRs, Linear tickets)
     ├─ Gather event-specific context (file path, pr id, trigger details)
        │
        ▼
  4. Evaluate rules (ordered by severity: hard → soft → info)
     For each rule:
       │
       ├─ 4a. Evaluate trigger expression
       │     └─ Match? → continue
       │     └─ No match? → skip (next rule)
       │
       ├─ 4b. Evaluate condition expression (if present)
       │     └─ true? → continue
       │     └─ false? → skip (next rule)
       │
       └─ 4c. Execute action
             ├─ hard   → Block the operation, return EnforcementResult
             │            🛑 STOP — return immediately, don't evaluate further
             ├─ soft   → Return EnforcementResult with confirm prompt
             │            ⏸ PAUSE — wait for user confirmation
             │              → confirmed: continue to next rule
             │              → rejected: stop, return
             └─ info   → Append to info collection
                          Continue to next rule
        │
        ▼
  5. Collect and return results
     ├── Rejected (if any hard rule blocked)
     ├── Confirmed (if all soft rules were confirmed)
     └── Completed (if no rules blocked and all confirmations passed)
```

### Pseudocode

```typescript
function enforce(rules: Rule[], context: Context): EnforcementResult[] {
  // 1. Sort by severity: hard first, then soft, then info
  const sorted = sortBySeverity(rules);

  // 2. Build context object from memory + integrations + event
  const ctx = buildContext(context);

  const results: EnforcementResult[] = [];

  for (const rule of sorted) {
    // 3. Check trigger
    if (!evaluate(rule.trigger, ctx)) continue;

    // 4. Check condition (if present)
    if (rule.condition && !evaluate(rule.condition, ctx)) continue;

    // 5. Execute action
    const result = applyAction(rule, ctx);
    results.push(result);

    if (rule.severity === 'hard') {
      // Hard block — stop immediately
      return { status: 'rejected', results };
    }

    if (rule.severity === 'soft' && !result.confirmed) {
      // Soft confirmation — wait for user
      return { status: 'pending_confirmation', results };
    }

    // Info — continue
  }

  return { status: 'completed', results };
}
```

### Evaluation Order

| Step | What Happens                 |             Can Stop?             |
| ---- | ---------------------------- | :-------------------------------: |
| 1    | Load rules from TOML         |                No                 |
| 2    | Filter by scope              |    No (fatal if file missing)     |
| 3    | Build context from DB + APIs |     No (fatal if DB missing)      |
| 4a   | Evaluate trigger             |            Yes — skip             |
| 4b   | Evaluate condition           |            Yes — skip             |
| 4c   | Execute action               | Yes — hard blocks stop everything |
| 5    | Return results               |                N/A                |

### What Happens on Error

| Failure                  | Behavior                                                     |
| ------------------------ | ------------------------------------------------------------ |
| Missing TOML file        | Fatal — rules engine returns error                           |
| Malformed TOML           | Fatal — parser error with location                           |
| Invalid expression       | Rule is skipped with a warning (graceful degradation)        |
| Missing context property | Expression evaluates to `false` (never crashes)              |
| Integration API down     | Context property is `null` (expression evaluates to `false`) |

---

## Complete Examples

### Decision Discipline

**Rule: decision-before-close**

Forces the user to log a decision before closing a ticket. This ensures every status change is documented.

```toml
[[rule]]
scope = "pm"
name = "decision-before-close"
trigger = "ticket.status_change == 'closed'"
condition = "ticket.decisions.count == 0"
action = "block: 'Cannot close {ticket.id} without a decision record. Run `pm log \"<decision>\" --link {ticket.id}` first.'"
severity = "hard"
description = "Every closed ticket must have at least one linked decision record explaining why it was closed"
```

**Scenario:**

```
$ pm scope "close ticket AUTH-91"

  [ERROR] Rule 'decision-before-close' fired: hard block
  → Cannot close AUTH-91 without a decision record.
    Run `pm log "Drop OAuth, use magic links" --link AUTH-91` first.

$ pm log "Drop OAuth, use magic links" --link AUTH-91
  → Decision logged as ADR-004
  → Linked to: AUTH-91, PR-442

$ pm scope "close ticket AUTH-91"
  → Rule satisfied: proceeding
```

---

### Scope Discipline

**Rule: scope-check**

Prevents scope creep by flagging additions that exceed sprint capacity.

```toml
[[rule]]
scope = "pm"
name = "scope-check"
trigger = "sprint.proposed_addition"
condition = "sprint.impact_days > sprint.remaining_days * 0.5"
action = "confirm: 'Adding \"{sprint.proposed_feature}\" adds {sprint.impact_days} days to a sprint with only {sprint.remaining_days} days remaining. This will push existing work. Proceed?'"
severity = "soft"
description = "Warn when proposed work exceeds 50% of remaining sprint capacity"
```

**Scenario:**

```
$ pm scope "add dark mode - 5 days impact"

  ⚠ Rule 'scope-check' fired: soft confirmation
  → Adding "dark mode" adds 5 days to a sprint with only 4 days remaining.
    This will push existing work.

  Confirm? [Y/n/details] > n
  Action cancelled.
```

---

### Blocker Discipline

**Rule: daily-blocker-check**

Surfaces active blockers every morning so nothing slips through the cracks.

```toml
[[rule]]
scope = "pm"
name = "daily-blocker-check"
trigger = "time == '09:00'"
condition = "blockers.count > 0"
action = "notify: 'Good morning! You have {blockers.count} active blocker(s) today:\n{blockers.list}\n\nRun `pm blockers` for details.'"
severity = "info"
description = "Daily reminder to check and resolve blockers"
```

**Scenario:**

```
  [INFO] daily-blocker-check:
  → Good morning! You have 2 active blocker(s) today:
      BLK-003: PR #442 needs review (2d, @backend-lead)
      BLK-004: RFC #18 unanswered (3d, @design-lead)

    Run `pm blockers` for details.
```

---

### Code Discipline

**Rule: no-any-in-shared**

Bans `any` type in shared library packages. Shared code must have proper types.

```toml
[[rule]]
scope = "code"
name = "no-any-in-shared"
trigger = "file.saved"
condition = "file.path == 'packages/shared/**/*.ts' && file.contains('any')"
action = "block: 'Avoid `any` type in shared libraries. These types are consumed by every package. Use generics, `unknown`, or a proper interface.'"
severity = "hard"
description = "Shared library code must not use the `any` type"
```

**Scenario:**

User saves `packages/shared/src/types.ts` containing `export type Data = any;`.

```
  [ERROR] Rule 'no-any-in-shared' fired: hard block
  → Avoid `any` type in shared libraries. These types are consumed by every
    package. Use generics, `unknown`, or a proper interface.

  File was not saved.
```

---

**Rule: tests-before-merge**

Ensures all new code has accompanying tests before a PR can be merged.

```toml
[[rule]]
scope = "code"
name = "tests-before-merge"
trigger = "pr.ready_for_review"
condition = "pr.new_code_without_tests > 0"
action = "block: 'PR {pr.id} has {pr.additions} lines of new code but no corresponding test files. All production code must have tests. Create test files before marking ready for review.'"
severity = "hard"
description = "Every PR must include tests for new code"
```

**Scenario:**

```
$ gh pr create --title "Add auth middleware" --body "..."

  [ERROR] Rule 'tests-before-merge' fired: hard block
  → PR #448 has 120 lines of new code but no corresponding test files.
    All production code must have tests before merge.

  PR creation blocked by PM Agent rules.
```

---

**Rule: strict-tsconfig**

Enforces strict mode in TypeScript configuration.

```toml
[[rule]]
scope = "code"
name = "strict-tsconfig"
trigger = "file.saved"
condition = "file.path == 'tsconfig.json' && file.contains('\"strict\": false')"
action = "block: 'tsconfig.json must use strict mode. Remove the \"strict\": false setting or change it to \"strict\": true. See https://www.typescriptlang.org/tsconfig#strict'"
severity = "hard"
description = "All TypeScript projects must use strict mode"
```

**Scenario:**

User saves `tsconfig.json` with `"strict": false`.

```
  [ERROR] Rule 'strict-tsconfig' fired: hard block
  → tsconfig.json must use strict mode.
    Remove the "strict": false setting or change it to "strict": true.
```

---

**Rule: no-console-log**

Catches debugging artifacts before they reach production.

```toml
[[rule]]
scope = "code"
name = "no-console-log"
trigger = "file.saved"
condition = "file.path == 'src/**/*.ts' && file.contains('console.log')"
action = "suggest: 'Remove console.log from {file.path} before committing. Use the project logger (import { logger } from \"@app/logger\") for production logging.'"
severity = "soft"
description = "Remind developers to remove debugging console.log statements"
```

**Scenario:**

User saves `src/auth/service.ts` containing `console.log('login attempt')`.

```
  [SUGGEST] no-console-log:
  → Remove console.log from src/auth/service.ts before committing.
    Use the project logger instead.
```

---

### Review Discipline

**Rule: stale-pr**

Flags pull requests that have been open too long without review.

```toml
[[rule]]
scope = "all"
name = "stale-pr"
trigger = "pr.age > 48h"
condition = "pr.reviews == 0"
action = "suggest: 'PR {pr.id} ({pr.title}) has been open {pr.age} with no reviews. Consider pinging {pr.author} or the team in #code-review.'"
severity = "soft"
description = "Alert when a PR has been open for 48+ hours without any review"
```

**Scenario:**

```
$ pm status
  → [SUGGEST] stale-pr:
    PR #442 (OAuth backend) has been open 2d with no reviews.
    Consider pinging @backend-lead or the team in #code-review.
```

---

**Rule: review-before-merge**

Prevents merging PRs that haven't been reviewed.

```toml
[[rule]]
scope = "code"
name = "review-before-merge"
trigger = "pr.ready_for_review"
condition = "pr.reviews == 0"
action = "block: 'PR {pr.id} has no reviews. At least one approval is required before merge. Request a review from your team.'"
severity = "hard"
description = "No PR can be merged without at least one review"
```

---

### Meeting Discipline

**Rule: meeting-prep**

Automatically generates a meeting prep brief when a calendar event is about to start.

```toml
[[rule]]
scope = "all"
name = "meeting-prep"
trigger = "calendar.event.starting_in < 15m"
condition = "event.has_prep == false"
action = "generate: 'Prep brief for \"{event.title}\" (starting in {event.starting_in}) — compile context from linked tickets {event.related_tickets}: decisions, blockers, open questions'
severity = "info"
description = "Auto-generate meeting prep briefs 15 minutes before events"
```

**Scenario:**

```
  [GENERATE] meeting-prep:
  ┌─ Prep Brief for "Sprint Review" (starting in 12m)
  │
  │  Tickets to Discuss:
  │    AUTH-91 (blocked), AUTH-92 (in progress), AUTH-93 (review)
  │
  │  Recent Decisions:
  │    ADR-004: Drop OAuth, use magic links
  │
  │  Active Blockers:
  │    BLK-003: PR #442 needs review (2d)
  │
  │  Open Questions:
  │    - Can we push AUTH-93 to sprint 15?
  │    - Is the stakeholder delay on AUTH-91 still acceptable?
  └─
```

---

## PM Agent CLI for Rules

The `pm rules` command group manages rules without editing TOML files directly.

### Commands

```bash
# List all rules
pm rules list

# List rules filtered by scope
pm rules list --scope pm
pm rules list --scope code
pm rules list --scope all

# List rules with detailed info (including source file lines)
pm rules list --verbose

# Add a new rule
pm rules add <name> \
  --scope pm | code | all \
  --trigger "<expression>" \
  --condition "<expression>" \
  --action "<type>: '<message>'" \
  --severity hard | soft | info \
  [--description "<text>"] \
  [--enabled true | false]

# Remove a rule
pm rules remove <name>

# Disable a rule (keep in file, don't evaluate)
pm rules disable <name>

# Enable a disabled rule
pm rules enable <name>

# Toggle a rule's enabled state
pm rules toggle <name>

# Show details for a specific rule
pm rules show <name>

# Reload rules from disk (pick up manual edits)
pm rules reload
```

### Examples

```bash
# List everything
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

# List only code rules
$ pm rules list --scope code
  ┌─────────────────────┬────────┬──────────┬──────────┐
  │ Name                │ Scope  │ Severity │ Enabled  │
  ├─────────────────────┼────────┼──────────┼──────────┤
  │ no-any-in-shared    │ code   │ hard     │ ✓        │
  │ tests-before-merge  │ code   │ hard     │ ✓        │
  │ strict-tsconfig     │ code   │ hard     │ ✓        │
  │ no-console-log      │ code   │ soft     │ ✓        │
  │ review-before-merge │ code   │ hard     │ ✗        │
  └─────────────────────┴────────┴──────────┴──────────┘

# Add a rule (interactive mode)
$ pm rules add
  → Name: enforce-import-order
  → Scope: code
  → Trigger: file.saved
  → Condition: file.path == 'src/**/*.ts'
  → Action: suggest: 'Sort imports in {file.path} according to project convention'
  → Severity: soft
  → Rule 'enforce-import-order' added and enabled.

# Disable a rule
$ pm rules disable no-console-log
  → Rule 'no-console-log' disabled. It will not be evaluated until re-enabled.

# Show a rule's details
$ pm rules show stale-pr
  ┌─────────────┬──────────────────────────────────────────┐
  │ Name        │ stale-pr                                 │
  │ Scope       │ all                                      │
  │ Trigger     │ pr.age > 48h                             │
  │ Condition   │ pr.reviews == 0                          │
  │ Action      │ suggest                                  │
  │ Message     │ PR {pr.id} has been open {pr.age}...     │
  │ Severity    │ soft                                     │
  │ Enabled     │ yes                                      │
  │ Description │ Alert when PR open 48h+ with no reviews  │
  │ Source      │ rules.toml:42                            │
  └─────────────┴──────────────────────────────────────────┘
```

### Interactive Add Flow

When calling `pm rules add` without flags, an interactive prompt walks through each field:

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
  ┌─────────────────────┬────────┬──────────┬──────────┐
  │ Name                │ Scope  │ Severity │ Enabled  │
  ├─────────────────────┼────────┼──────────┼──────────┤
  │ enforce-import-order│ code   │ soft     │ ✓        │
  └─────────────────────┴────────┴──────────┴──────────┘

  Add this rule? [Y/n] > y
  → Rule 'enforce-import-order' added and enabled.
```

---

## MCP for Rules

PM Agent exposes two MCP tools for AI-driven rule management and enforcement.

### pm_add_rule

Lets the AI propose and create rules based on conversation context.

**Tool definition:**

```typescript
server.tool(
  'pm_add_rule',
  'Add a new rule to the rules engine',
  {
    name: z.string().describe('Unique kebab-case rule name'),
    scope: z.enum(['pm', 'code', 'all']).describe('Which context this rule applies to'),
    trigger: z.string().describe("Trigger expression (e.g., 'file.saved', 'pr.age > 48h')"),
    condition: z.string().optional().describe('Optional condition expression'),
    action: z.string().describe("Action: 'type: message' (e.g., 'block: No console.log')"),
    severity: z.enum(['hard', 'soft', 'info']).describe('How strictly to enforce'),
    description: z.string().optional().describe('Human-readable explanation'),
  },
  async (args) => {
    // 1. Validate rule structure
    // 2. Append to rules.toml
    // 3. Return confirmation
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'created',
            rule: args.name,
            message: `Rule '${args.name}' added and enabled`,
          }),
        },
      ],
    };
  },
);
```

**Example AI interaction:**

```
You: "We keep finding bugs because PRs are merged without any review.
      Can you add a rule to block that?"

Claude: "Absolutely. I'll add a rule to require at least one review before merge."

  [Adding rule via pm_add_rule...]
  → Rule 'review-before-merge' added and enabled.

  Scope: code
  Trigger: pr.ready_for_review
  Condition: pr.reviews == 0
  Action: block
  Severity: hard

  From now on, any PR marked ready for review without a review will be blocked.
```

### pm_enforce_rules

Lets the AI explicitly run all matching rules against a given context. This is the programmatic entry point for custom triggering.

**Tool definition:**

```typescript
server.tool(
  'pm_enforce_rules',
  'Run all matching rules against the provided context',
  {
    context: z.record(z.any()).describe('Context object to evaluate rules against'),
    scope: z.enum(['pm', 'code', 'all']).optional().describe('Optional scope filter'),
  },
  async (args) => {
    const rules = loadRules(config.rules.path, args.scope);
    const ctx = buildContext(args.context);
    const results = enforce(rules, ctx);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results),
        },
      ],
    };
  },
);
```

**Example AI interaction:**

```
You: "Check if any of our rules are being violated right now"

Claude: [calls pm_enforce_rules with current context]

  → Enforcement Results:
    ✗ review-before-merge (hard): PR #442 has 0 reviews
    ⚠ stale-pr (soft): PR #442 open 2d without review
    ✓ no-any-in-shared: passed
    ✓ tests-before-merge: passed
    ✓ strict-tsconfig: passed
    ℹ daily-blocker-check: 2 active blockers

  Summary: 1 hard block, 1 soft warning, 3 passed, 1 info message
```

### Enforcement Result Format

```json
{
  "status": "completed",
  "results": [
    {
      "rule": "no-any-in-shared",
      "severity": "hard",
      "action": "block",
      "message": "Avoid `any` type in shared libraries",
      "triggered": false,
      "passed": true
    },
    {
      "rule": "stale-pr",
      "severity": "soft",
      "action": "suggest",
      "message": "PR #442 has been open 2d with no reviews. Ping @backend-lead?",
      "triggered": true,
      "passed": false
    },
    {
      "rule": "daily-blocker-check",
      "severity": "info",
      "action": "notify",
      "message": "You have 2 blockers today",
      "triggered": true,
      "passed": true
    }
  ]
}
```

| Field                 | Type                                                              | Description                                                               |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `status`              | `"completed"` / `"rejected"` / `"pending_confirmation"`           | Overall enforcement outcome                                               |
| `results[].rule`      | `string`                                                          | Rule name                                                                 |
| `results[].severity`  | `"hard"` / `"soft"` / `"info"`                                    | Rule severity                                                             |
| `results[].action`    | `"block"` / `"confirm"` / `"notify"` / `"suggest"` / `"generate"` | Action type                                                               |
| `results[].message`   | `string`                                                          | Interpolated action message                                               |
| `results[].triggered` | `boolean`                                                         | Whether the trigger matched                                               |
| `results[].passed`    | `boolean`                                                         | Whether the rule was satisfied (hard/soft: no block, info: always passes) |

---

## Best Practices

### Naming Conventions

```
# Use kebab-case, descriptive, and short
name = "decision-before-close"       # ✓ Good: clear intent
name = "scope-check"                 # ✓ Good: clear and short
name = "must-log-decision-before-closing-ticket"  # ✗ Too long
name = "rule1"                       # ✗ Meaningless
name = "D-Before-Close"              # ✗ Mixed case
```

| Convention | Rule                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| Case       | kebab-case only (lowercase, hyphens)                                    |
| Length     | 5-30 characters                                                         |
| Prefix     | Not required, but can group: `blocker-*`, `scope-*`, `pr-*`             |
| Groups     | Use consistent prefixes for related rules: `pr-*`, `file-*`, `ticket-*` |

### When to Use hard vs soft vs info

| Severity | When to Use                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| `hard`   | The action must be prevented. No exceptions. Security, data integrity, compliance, team-agreed standards       |
| `soft`   | The action should be questioned but can proceed with explicit override. Scope changes, debug code, workarounds |
| `info`   | The user should be informed but never interrupted. Daily reminders, context surfacing, auto-generated content  |

Rule of thumb: start at **soft**, escalate to **hard** if the behavior keeps happening. Start experimental rules at **info**, move to **soft** when confident.

### Grouping Rules by Scope

Organize your `rules.toml` file with clear section headers:

```toml
# ── PM Discipline (CLI + MCP) ──────────────────────────────────

[[rule]]
# ... pm rules here

# ── Code Discipline (IDE + file watchers) ───────────────────────

[[rule]]
# ... code rules here

# ── Cross-cutting (everywhere) ─────────────────────────────────

[[rule]]
# ... all-scope rules here
```

### Keeping Conditions Simple

```toml
# ✓ Good: one clear condition
condition = "file.path == 'packages/shared/**/*.ts' && file.contains('any')"

# ✓ Good: two checks with OR
condition = "pr.age > 48h || pr.reviews == 0"

# ✗ Avoid: complex chaining
condition = "a > 0 && b < 5 && c == 'x' || d.count > 0 && e.contains('y')"

# ✓ Better: split into two rules with different triggers
[[rule]]
name = "stale-pr-no-reviews"
trigger = "pr.age > 48h"
condition = "pr.reviews == 0"
# ...

[[rule]]
name = "large-pr"
trigger = "pr.ready_for_review"
condition = "pr.additions > 500"
# ...
```

**Guidelines:**

- One or two conditions per rule max
- If a condition needs more than two `&&` or `||` operators, split the rule
- Use `.contains()` for string matching, not regex-like patterns
- Use `.count` for array length checks

### Rule Lifecycle

```
Write → Test (soft/info) → Evaluate → Promote (hard) → Monitor → Iterate
  │         │                 │           │              │
  └─ Start  └─ Observe       └─ Check    └─ Escalate   └─ Adjust or retire
```

1. **Write**: Draft the rule with a descriptive name and clear trigger
2. **Test**: Start at `soft` or `info` severity. Run it for a few days
3. **Evaluate**: Check false positives. Did it trigger when it shouldn't have?
4. **Promote**: If the rule is reliable with no false positives, promote to `hard`
5. **Monitor**: Hard rules block work — watch for complaints. Adjust if needed
6. **Iterate**: Tweak conditions, triggers, or retire if the behavior is no longer a problem

### Rule Count Guidelines

| Project Size                        | Recommended Rule Count | Notes                                                                            |
| ----------------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| Small (1-2 devs, simple project)    | 3-6 rules              | Focus on essentials: decision discipline, scope check, basic code quality        |
| Medium (3-8 devs, standard project) | 8-15 rules             | Cover PM + code discipline, review workflow, meeting prep                        |
| Large (8+ devs, complex project)    | 15-25 rules            | Full coverage including code patterns, architecture enforcement, custom triggers |

Too many rules creates noise. If you have more than 25 rules, review and prune — some are probably redundant or no longer relevant.

### Sharing Rules with Your Team

Rules files are plain TOML — commit them to your repository:

```bash
# Store canonical rules in your repo
cp ~/.config/pm-agent/rules.toml ./pm-agent-rules.toml

# Team members copy and use
cp ./pm-agent-rules.toml ~/.config/pm-agent/rules.toml
```

Consider adding `pm-agent-rules.toml` to your project's `docs/` or root directory as a reference.

---

## Troubleshooting

### Rule Not Triggering

**The rule exists and is enabled, but never fires.**

Possible causes and checks:

| Cause                            | Check                                                           | Fix                                                   |
| -------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Rule is disabled                 | `pm rules list` — check enabled column                          | `pm rules enable <name>`                              |
| Wrong scope                      | Is the context correct? CLI uses `pm`, IDE uses `code`          | Change `scope` or check which context you're in       |
| Trigger expression doesn't match | Test the trigger with `pm enforce_rules`                        | Verify the context property names match               |
| Context object is empty          | Is the integration connected? Are there tickets, PRs, blockers? | Run `pm status` to see available context              |
| Expression parsing issue         | Watch for typos in property names                               | Check expression against available context properties |
| TOML file not found              | Is the path correct in `config.toml`?                           | `pm rules list` will show an error if file is missing |

**Debug steps:**

```bash
# 1. Is the rule visible and enabled?
pm rules list

# 2. Does the rule show correctly?
pm rules show stale-pr

# 3. What context is available right now?
pm status

# 4. Manually trigger enforcement
# (MCP): call pm_enforce_rules with the expected context
```

### Condition Always False

**The trigger fires, but the condition never passes.**

| Cause                     | Check                                        | Fix                                          |
| ------------------------- | -------------------------------------------- | -------------------------------------------- |
| Property name typo        | `ticket.decisions` vs `ticket.decision`      | Verify property names from context           |
| Wrong comparison value    | `status == 'closed'` vs `status == 'Closed'` | Comparisons are case-sensitive               |
| `.count` on non-array     | `ticket.decisions` is `null`, not `[]`       | Verify the context object shape              |
| Missing optional property | `sprint.risk` is `undefined`, not `'HIGH'`   | Use `sprint.risk == 'HIGH'` (handles `null`) |
| Logic inversion           | `==` vs `!=`, `>` vs `<`                     | Double-check the comparison direction        |
| Duration format           | `48h` vs `48` (raw number)                   | Durations are compared in hours              |

**Test a condition directly:**

```bash
# Temporarily remove or comment out the condition
# to see if the trigger alone fires correctly

# Or, temporarily change severity to "info" to see
# what context values are available
```

### Severity Too Aggressive

**A hard rule is blocking legitimate work.**

| Cause                        | Fix                                                                         |
| ---------------------------- | --------------------------------------------------------------------------- |
| New rule, unknown edge cases | Downgrade to `soft` for a trial period                                      |
| Condition too broad          | Tighten the condition to exclude valid cases                                |
| Trigger too broad            | Narrow the trigger (e.g., `file.saved` → `file.saved` + specific path glob) |
| False positive               | Add an exclusion condition                                                  |

**Quick fixes:**

```bash
# Immediate: downgrade severity
pm rules remove <name>
pm rules add <name> ... --severity soft

# Or: disable until you can fix
pm rules disable <name>
```

### Rule Not Listed in pm rules

**The rule exists in the TOML file but doesn't appear.**

| Cause                       | Check                                   | Fix                                                |
| --------------------------- | --------------------------------------- | -------------------------------------------------- |
| TOML syntax error           | `pm rules list` will show a parse error | Check TOML formatting near the rule                |
| Duplicate `[[rule]]` header | Missing or extra brackets               | Each rule needs exactly `[[rule]]` on its own line |
| Field name typo             | `severity` vs `severity`                | Field names must match exactly                     |

### Expression Parse Error

**The engine reports an error evaluating a trigger or condition.**

Common mistakes:

```toml
# ✗ Wrong: double quotes inside string
condition = "file.path == "src/**/*.ts""    # Syntax error

# ✗ Wrong: single equals instead of double
trigger = "ticket.status = 'closed'"         # Should be ==

# ✗ Wrong: no quotes around string literal
condition = "file.path == src/**/*.ts"       # Should be 'src/**/*.ts'

# ✓ Correct
condition = "file.path == 'src/**/*.ts'"
trigger = "ticket.status == 'closed'"
```

### Rules Not Loading

**The engine can't find or parse the rules file.**

```bash
# Check the configured path
pm config show rules.path
# → ~/.config/pm-agent/rules.toml

# Does the file exist?
ls -la ~/.config/pm-agent/rules.toml

# Does it have valid TOML?
pm rules list  # Parse errors are shown here
```

### Enforcement Results Unexpected

**Rules are firing but producing unexpected results.**

Enable verbose mode to see the evaluation trace:

```bash
pm rules list --verbose
# Shows source file line numbers for each rule

pm enforce --verbose
# Shows each rule evaluation step with context values
```

### Quick Reference: Common Problems

| Symptom                  | Most Likely Cause               | Quick Fix                              |
| ------------------------ | ------------------------------- | -------------------------------------- |
| Rule never fires         | Wrong scope for current context | Change `scope` or check context        |
| Rule fires too often     | Condition too broad             | Add a more specific condition          |
| Hard block on valid work | Severity too aggressive         | Downgrade to `soft`                    |
| Condition always false   | Property name typo              | Verify context property names          |
| Parse error on save      | Single vs double quotes         | Use single quotes for string literals  |
| No context available     | Integration disconnected        | Run `pm status` to check connectivity  |
| Empty rules list         | Wrong config path               | Verify `config.toml` `[rules]` section |

---

## Reference: Default rules.toml

When you run `pm init`, this default `rules.toml` is created:

```toml
# ── Default Rules — PM Agent ────────────────────────────────────
# Created by `pm init`
# Edit at: ~/.config/pm-agent/rules.toml

# ── PM Discipline ───────────────────────────────────────────────

[[rule]]
scope = "pm"
name = "decision-before-close"
trigger = "ticket.status_change == 'closed'"
condition = "ticket.decisions.count == 0"
action = "block: 'Cannot close {ticket.id} without a decision record. Run `pm log` first.'"
severity = "hard"

[[rule]]
scope = "pm"
name = "scope-check"
trigger = "sprint.proposed_addition"
condition = "sprint.impact_days > sprint.remaining_days * 0.5"
action = "confirm: 'This adds {sprint.impact_days} days to a sprint with {sprint.remaining_days} days remaining. Proceed?'"
severity = "soft"

[[rule]]
scope = "pm"
name = "daily-blocker-check"
trigger = "time == '09:00'"
condition = "blockers.count > 0"
action = "notify: 'You have {blockers.count} active blockers today'"
severity = "info"

# ── Code Discipline ──────────────────────────────────────────────

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
condition = "file.path == 'tsconfig.json' && file.contains('\"strict\": false')"
action = "block: 'tsconfig must use strict mode. Set \"strict\": true'"
severity = "hard"

[[rule]]
scope = "code"
name = "no-console-log"
trigger = "file.saved"
condition = "file.path == 'src/**/*.ts' && file.contains('console.log')"
action = "suggest: 'Remove console.log before committing. Use a logger instead.'"
severity = "soft"

# ── Cross-cutting ────────────────────────────────────────────────

[[rule]]
scope = "all"
name = "stale-pr"
trigger = "pr.age > 48h"
condition = "pr.reviews == 0"
action = "suggest: 'PR {pr.id} has been open {pr.age} with no reviews. Ping {pr.author}?'"
severity = "soft"

[[rule]]
scope = "all"
name = "meeting-prep"
trigger = "calendar.event.starting_in < 15m"
condition = "event.has_prep == false"
action = "generate: 'Prep brief for {event.title} with context from {event.related_tickets}'"
severity = "info"
```

---

## How Rules Differ from Configuration

Rules are **not** configuration — they are **enforceable policies**. This distinction matters:

| Aspect      | Config (`config.toml`)         | Rules (`rules.toml`)          |
| ----------- | ------------------------------ | ----------------------------- |
| Purpose     | How PM Agent operates          | What PM Agent enforces        |
| Changes     | Project-specific settings      | Team-level discipline         |
| Evaluation  | Always active                  | Evaluated per trigger         |
| Enforcement | Passive (read at startup)      | Active (blocks/confirms)      |
| Sharing     | ~/.config/pm-agent/ (per-user) | Committed to repo (team-wide) |

---

## Expression Language Grammar

For implementers: the formal grammar of the expression language.

```
expression     → comparison ( ("&&" | "||") comparison )*
comparison     → unary ( ("==" | "!=" | ">" | "<" | ">=" | "<=" ) unary )*
unary          → ( "!" )? primary
primary        → property_access
               | string_literal
               | number_literal
               | duration_literal
               | function_call
               | "(" expression ")"

property_access → IDENTIFIER ("." IDENTIFIER)* ("." "count")?
function_call  → IDENTIFIER "." IDENTIFIER "(" string_literal ")"
string_literal → "'" [^']* "'"
number_literal → [0-9]+ ("." [0-9]+)?
duration_literal → number_literal ("h" | "d" | "m")
```

---

## Changelog

| Version | Date    | Changes                            |
| ------- | ------- | ---------------------------------- |
| 1.0     | 2026-07 | Initial rules engine specification |
