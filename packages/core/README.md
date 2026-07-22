# @pm-agent/core

> PM Agent core library — memory layer, rules engine, and codebase intelligence.

## Overview

`@pm-agent/core` is the backbone of PM Agent. It provides the SQLite-backed memory layer (decisions, blockers, notes, tasks, scope snapshots), the TOML-configured rules engine with expression parsing, the codebase scanner and impact analyzer, and GitHub/Linear integrations.

## Installation

```bash
npm install @pm-agent/core
```

## Key Interfaces

### Memory Layer

| Module         | Purpose                         | Key Functions                                                                 |
|----------------|---------------------------------|--------------------------------------------------------------------------------|
| `decisions.ts` | ADR-style decision records      | `createDecision`, `getDecision`, `listDecisions`, `linkEntityToDecision`       |
| `blockers.ts`  | Blocker tracking with age       | `createBlocker`, `getBlocker`, `resolveBlocker`, `getActiveBlockers`           |
| `notes.ts`     | Freeform note capture           | `createNote`, `getNote`, `searchNotes`, `getNotesByTag`                        |
| `tasks.ts`     | State machine (todo→in_progress→done) | `createTask`, `getTask`, `updateTaskStatus`, `getBlockedTasks`          |
| `scope.ts`     | Sprint scope snapshots          | `captureScope`, `getLatestScope`, `getScopeHistory`                            |
| `graph.ts`     | Cross-entity graph traversal    | `getRelatedEntities`, `expandGraph`, `getStandupData`                          |

### Rules Engine

The rules engine evaluates TOML-defined rules against context objects:

```typescript
import { loadRules, enforce } from '@pm-agent/core';

const rules = loadRules('/path/to/rules.toml');
const result = enforce('pm', rules, {
  ticket: { id: 'TASK-001', status_change: 'closed' },
});
// result → { results: [...], summary: { hard: 0, soft: 1, info: 0 } }
```

**Severity levels:**
- `hard` — blocks execution entirely
- `soft` — requests confirmation
- `info` — notification only

### Expression Parser

Safe expression evaluation with no `eval()`/`new Function()`:

- Property access: `blockers.count`, `ticket.status_change`
- Comparisons: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Glob matching: `file.path == 'src/**/*.ts'`
- String/array methods: `.contains()`, `.count`
- Duration normalization: `24h`, `3d`, `30m`
- Template interpolation: `'You have {blockers.count} blockers'`

### Scanner

```typescript
import { scan } from '@pm-agent/core';
const result = await scan({
  rootDir: '/path/to/project',
  db: database,
});
// result → { total: 150, indexed: 142, skipped: 8, ... }
```

### Shipped Defaults

```typescript
import { DEFAULT_CONFIG_TOML, DEFAULT_RULES_TOML } from '@pm-agent/core';

// Preconfigured defaults with 5 built-in rules:
// - decision-before-close (hard)
// - scope-check (soft)
// - daily-blocker-check (info)
// - no-console-log (soft)
// - no-direct-api-calls (hard)
```

## API Reference

### Database

```typescript
openDb(config: DbConfig): Database.Database
migrate(db: Database.Database): void
closeDb(db: Database.Database): void
generateId(prefix: string, db: Database.Database): string
```

### Configuration

```typescript
loadConfig(path?: string): PmAgentConfig
getDefaultConfigPath(): string
getDefaultDataDir(): string
```

### Rules

```typescript
loadRules(path: string): Rule[]
enforce(scope: string, rules: Rule[], context: Record<string, any>): EnforcementResult
evaluateRule(rule: Rule, context: Record<string, any>): RuleResult
parseAction(action: string): ParsedAction
addRule(path: string, rule: Rule): void
removeRule(path: string, name: string): boolean
toggleRule(path: string, name: string, enabled: boolean): boolean
```

### Integrations

```typescript
detectIntegrations(config: PmAgentConfig): Promise<Integration[]>
syncAllIntegrations(db: Database.Database, config: PmAgentConfig): Promise<SyncResult>
```

## License

MIT
