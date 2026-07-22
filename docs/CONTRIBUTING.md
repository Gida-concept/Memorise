# Contributing to PM Agent

First off, thank you for considering contributing to PM Agent. Every contribution — whether it's a bug fix, a new feature, a documentation improvement, or a rule example — makes this project better for everyone.

## Project Philosophy

Before diving in, it helps to understand what PM Agent is and what it isn't.

**Memory, not intelligence.** PM Agent doesn't replace human product thinking. It remembers what would otherwise fall through the cracks — decisions, blockers, scope changes, dependencies — and surfaces them at the right moment. The intelligence is still yours (or your AI's). PM Agent is the persistent context layer that makes that intelligence effective.

**Rules, not suggestions.** The rules engine is designed to enforce discipline, not recommend it. A `hard` rule blocks the operation. A `soft` rule requires confirmation. An `info` rule surfaces context. Every rule has teeth. This is intentional: the project is for teams that want their processes to be automatic, not optional.

**Ambient, not app.** PM Agent lives in the background — as an MCP server your AI talks to, as CLI commands you sprinkle into your workflow, as hooks that fire on file save or PR open. There's no dashboard to check, no inbox to clear. It works where you already work.

---

## Code of Conduct

This project follows a **Code of Conduct** that all contributors must adhere to. Please read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before contributing.

In short: be respectful, assume good intent, and create a welcoming environment for everyone. Harassment, trolling, and personal attacks are not tolerated.

---

## Getting Started

### Prerequisites

- **Node.js 18+** (LTS recommended). PM Agent uses modern JavaScript features and `fs.watch`, which are stable in Node 18.
- **npm 9+** (ships with Node 18).
- **Git** for version control.
- **Optional but recommended:** `ripgrep` (for codebase scanning), `tree` (for directory structure dumps), `madge` (for circular dependency detection). If missing, features degrade gracefully with a warning.

### Fork and Clone

1. Fork the repository on GitHub.
2. Clone your fork locally:

   ```bash
   git clone https://github.com/<your-username>/pm-agent.git
   cd pm-agent
   ```

3. Add the upstream remote:

   ```bash
   git remote add upstream https://github.com/pm-agent/pm-agent.git
   ```

### Install Dependencies

This is an npm workspaces monorepo. One install pulls everything:

```bash
npm install
```

This installs dependencies for all packages (`core`, `cli`, `mcp-server`) as well as root-level dev tools (TypeScript, ESLint, Prettier, Vitest).

### Build

```bash
npm run build
```

This runs `tsup` in each package, producing CJS, ESM, and declaration files in each package's `dist/` directory.

### Link the CLI (Development)

To use the `pm` CLI from your local build:

```bash
npm link
# or specifically:
npm link -w packages/cli
```

Now `pm` is available anywhere on your PATH, pointing at your development build. Re-link after rebuilding.

### Verify

```bash
npm test          # runs all tests
pm --version      # should show the current version
pm init           # scaffolds config in ~/.config/pm-agent/
```

---

## Project Structure

PM Agent is an npm workspaces monorepo.

```
pm-agent/
├── package.json              # npm workspaces root (core, cli, mcp-server)
├── tsconfig.json             # Base TypeScript config (strict mode)
├── .gitignore
├── rules.toml                # Default rules (shipped with package)
├── config.toml               # Default config (shipped with package)
│
├── packages/
│   ├── core/                 # Shared library — memory + rules + integrations
│   │   ├── src/
│   │   │   ├── index.ts      # Public API barrel export
│   │   │   ├── db.ts         # SQLite wrapper (better-sqlite3)
│   │   │   ├── config.ts     # TOML config reader
│   │   │   ├── memory/       # Memory layer — decisions, blockers, notes, tasks, scope
│   │   │   ├── scanner/      # Codebase intelligence — file registry, deps, arch detection
│   │   │   ├── rules/        # Rules engine — engine.ts, expression.ts, types.ts
│   │   │   └── integrations/ # External tool integrations — GitHub, Linear, types
│   │   └── tests/
│   │
│   ├── cli/                  # Terminal interface (Commander.js)
│   │   ├── src/
│   │   │   ├── index.ts      # Entry point — Commander program
│   │   │   ├── prompts.ts    # Inquirer.js interactive prompts
│   │   │   └── commands/     # init, blockers, log, note, scope, standup, rules, status
│   │   └── tests/
│   │
│   ├── mcp-server/           # MCP server (stdio transport, @modelcontextprotocol/sdk)
│   │   ├── src/
│   │   │   ├── index.ts      # Server setup + tool registration
│   │   │   └── tools/        # get-context, get-blockers, log-decision, etc.
│   │   └── tests/
│   │
│   ├── desktop/              # [Roadmap] Electron/Tauri desktop app
│   │   └── src/
│   │
│   └── vscode-ext/           # [Roadmap] VS Code extension
│       └── src/
│
├── README.md
├── architecture.md
├── CONTRIBUTING.md           # <- You are here
└── rules.md                  # Rules engine reference
```

**Dependency direction:** `packages/core` is the shared foundation. Both `packages/cli` and `packages/mcp-server` depend on it. There are no circular dependencies.

---

## Development Workflow

### Branch Naming

Use descriptive, kebab-case branch names with a conventional prefix:

```bash
feat/scanner-incremental-mode     # New feature
fix/expression-null-handling       # Bug fix
docs/api-readme-examples           # Documentation
refactor/rules-evaluator           # Refactoring
test/memory-graph-coverage         # Testing
chore/update-deps                  # Maintenance
```

### Commit Conventions

We use **Conventional Commits**. This isn't bureaucracy — it enables automatic changelog generation and semantic versioning.

```
<type>: <short description>

[optional body]

[optional footer]
```

Types:

| Type       | Usage                                   |
| ---------- | --------------------------------------- |
| `feat`     | A new feature                           |
| `fix`      | A bug fix                               |
| `docs`     | Documentation changes                   |
| `refactor` | Code change that neither fixes nor adds |
| `test`     | Adding or fixing tests                  |
| `chore`    | Maintenance, deps, tooling              |
| `style`    | Formatting, linting (no logic change)   |

Examples:

```
feat(core): add incremental scan mode to file registry
fix(cli): handle missing config.toml during pm init
docs: add example rules to rules.md
test(core): cover expression parser edge cases
```

### Pull Request Workflow

1. **Create a branch** from `main` with a descriptive name.
2. **Make your changes.** Keep commits small and focused.
3. **Write tests.** New features and bug fixes should include tests.
4. **Update docs** if your change affects the public API, CLI, or MCP tools.
5. **Run tests locally** before pushing:

   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```

6. **Push and create a PR** against the `main` branch.
7. **Respond to review feedback.** Address comments, push fixes.
8. **Merge** once you have at least one approval and CI is green.

---

## Coding Standards

### TypeScript

- **Strict mode is mandatory.** `strict: true` in all `tsconfig.json` files. No exceptions. This is enforced by a default rule.
- **Use explicit types for public APIs.** Let inference work internally, but export types explicitly.
- **Prefer `unknown` over `any`.** If you genuinely don't know the type, use `unknown` and narrow with type guards. `any` is banned in shared packages.
- **Avoid `!` (non-null assertion).** If a value can be null, handle it. If it can't, prove it with a type guard.
- **Use `const` assertions** (`as const`) for literal types and configuration objects.

### Linting & Formatting

- **ESLint** enforces code quality rules. Run `npm run lint` before committing.
- **Prettier** handles formatting. There is a `.prettierrc` at the root. Format automatically:

  ```bash
  npm run format
  ```

  Or configure your editor to format on save with Prettier.

### Naming Conventions

| Category    | Convention          | Examples                             |
| ----------- | ------------------- | ------------------------------------ |
| Functions   | `camelCase`, verbs  | `getActiveBlockers()`, `enforce()`   |
| Interfaces  | `PascalCase`, nouns | `Integration`, `EnforcementResult`   |
| Types       | `PascalCase`        | `Rule`, `Blocker`, `ScopeSnapshot`   |
| Variables   | `camelCase`         | `config`, `activeRules`              |
| Constants   | `UPPER_SNAKE_CASE`  | `DEFAULT_RULES_PATH`                 |
| Files       | `kebab-case`        | `file-registry.ts`, `expression.ts`  |
| Test files  | `*.test.ts`         | `expression.test.ts`                 |
| Directories | `kebab-case`        | `memory/`, `integrations/`, `tools/` |

### File Organization

**One concern per file.** A file should export one primary thing (a class, function, or type). Utility functions that are only used by one module belong in the same file or a co-located `utils.ts`.

Within a package:

```
src/
├── index.ts          # Public API barrel — re-exports what consumers need
├── feature-a.ts      # Primary export
├── feature-b.ts      # Another primary export
└── utils.ts          # Shared utilities (only if used by >1 module)
```

---

## Testing

### Running Tests

```bash
# Run all tests across all packages
npm test

# Run tests for a specific package
npm test -w packages/core
npm test -w packages/cli
npm test -w packages/mcp-server

# Run in watch mode during development
npm run test:watch -w packages/core

# Run a specific test file
npx vitest packages/core/tests/expression.test.ts
```

### Testing Patterns

| Scenario            | Approach                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database operations | Use an in-memory SQLite database (`:memory:`) that is created and destroyed per test. See `tests/db.test.ts` for the pattern.                       |
| Rules engine        | Test the expression parser with known inputs and expected ASTs. Test rule evaluation with mock context objects.                                     |
| CLI commands        | Test command handlers with mocked core functions. Test argument parsing with Commander's built-in test utilities.                                   |
| MCP tools           | Test tool handlers with mock `server.tool` registration. Test response formatting with known inputs.                                                |
| Scanner             | Test against a fixture directory with known file structure. Mock external tools (ripgrep, madge) for deterministic results.                         |
| Integrations        | Mock HTTP/fetch for API calls. Test that `detect()`, `connect()`, `fetchBlockers()` handle success and failure paths.                               |
| Expression parser   | Test tokenization, AST construction, and evaluation separately. Include edge cases: missing properties, null values, empty strings, invalid syntax. |

**Example — in-memory SQLite for core tests:**

```typescript
import Database from 'better-sqlite3';
import { migrate } from '../src/db';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';

describe('decisions', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a decision record', () => {
    db.prepare(`INSERT INTO decisions (id, title, body) VALUES (?, ?, ?)`).run(
      'ADR-001',
      'Drop OAuth',
      'Use magic links instead',
    );
    const row = db.prepare('SELECT * FROM decisions WHERE id = ?').get('ADR-001');
    expect(row).toBeDefined();
  });
});
```

### Coverage Expectations

- **Core package:** Aim for 90%+ coverage. The core memory layer, rules engine, and expression parser are the foundation everything else builds on.
- **CLI package:** 80%+ coverage. Focus on command handlers and prompt flows. Integration-style tests that mock the core layer.
- **MCP server:** 80%+ coverage. Focus on tool handlers and error paths.

Run coverage locally:

```bash
npm test -- --coverage
```

---

## Documentation

### How to Write Docs

- **Match the existing style.** Read an existing doc before writing a new one. Note the tone (friendly but technical), the heading hierarchy, the use of tables for reference data, and the extensive use of examples.
- **Use examples heavily.** Every concept should have a runnable or copyable example. Rules docs show the TOML, the CLI command, and the expected output. Architecture docs show the data flow. MCP tool docs show the call and response.
- **Be precise.** Avoid "it may" or "it might." If something is uncertain, say what determines the outcome. Prefer "evaluates to `false` when the property is missing" over "might not work if the property isn't there."
- **Include code blocks** with language annotations. Use `bash`, `typescript`, `toml`, `json`, `sql` as appropriate.
- **Document the why.** The code says what happens. The docs should say why it happens that way and when you'd reach for it.

### Where Documentation Lives

| Doc              | Location           | Content                                                                                       |
| ---------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| Product overview | `README.md`        | What PM Agent is, quick install, quick start                                                  |
| Architecture     | `architecture.md`  | Full architecture — project structure, layers                                                 |
| Database schema  | `architecture.md`  | Inline in the architecture doc (SQL schema)                                                   |
| Rules engine     | `rules.md`         | Complete rules reference — triggers, conditions, actions, expression language, best practices |
| CLI reference    | `cli.md`           | Every CLI command, argument, flag, and example                                                |
| MCP tools        | `mcp-tools.md`     | Every MCP tool, input schema, output format                                                   |
| Configuration    | `configuration.md` | Config file reference, env vars, data locations                                               |
| Contributing     | `CONTRIBUTING.md`  | This file                                                                                     |

### Doc Review Process

Documentation changes follow the same PR process as code changes:

1. Include doc updates in the same PR as the feature or fix (not a separate PR).
2. Ask a maintainer to review the docs for accuracy and clarity.
3. If you're adding a new doc file, update the table above in this file.

---

## Pull Request Process

Here is the step-by-step process for every PR.

**Step 1: Create a branch.**

```bash
git checkout main
git pull upstream main
git checkout -b feat/my-feature
```

**Step 2: Make your changes.**

Keep commits focused. One commit per logical change.

```bash
git add packages/core/src/rules/expression.ts
git commit -m "feat(core): add duration literal support to expression parser"
```

**Step 3: Write tests.**

- If you added a feature, test the feature.
- If you fixed a bug, add a test that catches the bug (so it never regresses).
- If you refactored, the existing tests should still pass.

**Step 4: Update docs.**

- If you added a new CLI command, update `cli.md`.
- If you added a new MCP tool, update `mcp-tools.md`.
- If you added a new rule feature, update `rules.md`.
- If you changed the architecture, update `architecture.md`.

**Step 5: Run tests and linting.**

```bash
npm run typecheck    # TypeScript strict mode check
npm run lint         # ESLint
npm run format       # Prettier
npm test             # All tests
```

**Step 6: Create a pull request.**

Push your branch to your fork and open a PR against `main` on the main repository.

- Use a clear PR title (Conventional Commits format).
- Describe what the PR does and why.
- Reference any related issues (e.g., "Closes #42").
- Check the box if your PR includes breaking changes.

**Step 7: Wait for review.**

A maintainer will review your PR. They may ask questions or request changes. This is normal — don't take it personally.

**Step 8: Address feedback.**

Push additional commits to address review comments. Avoid force-pushing — it makes it harder to see what changed between review rounds.

**Step 9: Merge.**

Once approved and CI is green, a maintainer will merge your PR. If you have write access, squash-merge into `main` with a clean commit message.

---

## Adding a New Rule

The rules engine is in `packages/core/src/rules/`. It has three files:

| File            | Purpose                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| `types.ts`      | Type definitions: `Rule`, `Trigger`, `Action`, `Severity`, `EnforcementResult` |
| `expression.ts` | Tokenizer, parser, and evaluator for the expression language                   |
| `engine.ts`     | `loadRules()`, `enforce()`, `applyAction()` — the evaluation pipeline          |

### Adding a New Trigger Type

Suppose you want to add a `deploy.failed` trigger.

1. **Add the trigger type** to a context type in `types.ts`:

   ```typescript
   export interface DeployContext {
     environment: string;
     service: string;
     failed_at: string;
     retry_count: number;
   }

   export interface RuleContext {
     // ... existing contexts
     deploy?: DeployContext;
   }
   ```

2. **Register the trigger** in `expression.ts`. Triggers are matched by property path — if the expression starts with `deploy.`, it maps to the deploy context. No changes needed to the parser itself since it's property-access based.

3. **Add tests** in `tests/rules.test.ts` and/or `tests/expression.test.ts`:

   ```typescript
   it('should evaluate deploy.failed trigger', () => {
     const result = evaluate("deploy.environment == 'production'", {
       deploy: { environment: 'production', retry_count: 3 },
     });
     expect(result).toBe(true);
   });
   ```

4. **Add an example** to `rules.md` in the trigger reference section.

### Adding a New Action Type

1. Add the action to the `ActionType` union in `types.ts`:

   ```typescript
   export type ActionType =
     'block' | 'confirm' | 'notify' | 'suggest' | 'generate' | 'your-new-type';
   ```

2. Implement the handler in `engine.ts` inside `applyAction()`.

3. Update the action reference table in `rules.md`.

### Adding a New Condition Operator

The expression parser is in `expression.ts`. The three stages are:

- **Tokenizer** — breaks the expression string into tokens.
- **Parser** — builds an AST from tokens.
- **Evaluator** — walks the AST and produces a boolean.

To add a new operator:

1. Add the token type to the tokenizer.
2. Add the AST node type.
3. Add the parser rule.
4. Add the evaluation logic.
5. Add tests in `tests/expression.test.ts` for the new operator.
6. Add the operator to the reference table in `rules.md`.

---

## Adding a New MCP Tool

MCP tools are how AI agents interact with PM Agent. Each tool is a single file in `packages/mcp-server/src/tools/`.

### Step-by-Step

1. **Create the handler file.**

   ```bash
   touch packages/mcp-server/src/tools/my-new-tool.ts
   ```

2. **Implement the tool handler.**

   ```typescript
   import { server } from '../index';

   server.tool(
     'pm_my_new_tool',
     'Description of what this tool does',
     {
       // Input schema using zod or raw JSON Schema
       param1: z.string().describe('What this parameter is'),
       param2: z.number().optional().describe('Optional parameter'),
     },
     async (args) => {
       // 1. Load config and DB
       // 2. Call core functions
       // 3. Run rules engine if needed (active tools)
       // 4. Return result
       return {
         content: [
           {
             type: 'text',
             text: JSON.stringify({ result: 'success' }),
           },
         ],
       };
     },
   );
   ```

3. **Register the tool in the server.**

   If your file self-registers (imports and calls `server.tool()`), ensure it's imported in `packages/mcp-server/src/index.ts`:

   ```typescript
   import './tools/my-new-tool';
   ```

4. **Categorize the tool as passive or active.**

   | Type    | Runs rules engine? | Example                             |
   | ------- | ------------------ | ----------------------------------- |
   | Passive | No                 | `pm_get_blockers`, `pm_get_notes`   |
   | Active  | Yes                | `pm_log_decision`, `pm_check_scope` |

   Passive tools read data and return it. Active tools write data and run through the rules engine. Add the rules check if active.

5. **Add tests.**

   Create or update `packages/mcp-server/tests/tools.test.ts`:

   ```typescript
   describe('pm_my_new_tool', () => {
     it('should return expected output', async () => {
       // Mock server.tool, call handler, assert response
     });
   });
   ```

6. **Document the tool in `mcp-tools.md`.**

   Add an entry to the tool table and a usage example:

   ```markdown
   ### pm_my_new_tool

   **Description:** What it does.
   **Type:** passive | active
   **Inputs:** param1 (string, required), param2 (number, optional)
   **Enforcement:** none | runs rules before write
   ```

---

## Adding a New CLI Command

CLI commands live in `packages/cli/src/commands/`.

### Step-by-Step

1. **Create the command file.**

   ```bash
   touch packages/cli/src/commands/my-command.ts
   ```

2. **Implement using Commander.js patterns.**

   ```typescript
   import { Command } from 'commander';

   export function registerMyCommand(program: Command): void {
     program
       .command('my-command')
       .description('What this command does')
       .argument('<required-arg>', 'Description')
       .option('--flag <value>', 'Optional flag')
       .action(async (requiredArg, options) => {
         // 1. Load config
         // 2. Do the work
         // 3. Output result
         console.log(chalk.green('Done:'), result);
       });
   }
   ```

3. **Register in the program.**

   Add the import and registration call in `packages/cli/src/index.ts`:

   ```typescript
   import { registerMyCommand } from './commands/my-command';
   registerMyCommand(program);
   ```

4. **Add tests.**

   Update `packages/cli/tests/commands.test.ts`:

   ```typescript
   describe('my-command', () => {
     it('should handle valid input', async () => {
       // Mock Commander program, invoke handler, assert output
     });
   });
   ```

5. **Document in `cli.md`.**

   Add an entry to the command reference table and include usage examples.

---

## Adding a New Integration

Integrations connect PM Agent to external tools (GitHub, Linear, etc.). They live in `packages/core/src/integrations/`.

### Integration Interface

Every integration implements this interface (defined in `packages/core/src/integrations/types.ts`):

```typescript
interface Integration {
  name: string; // Human-readable name, e.g. "GitHub"
  detect(): Promise<boolean>; // Can we auto-detect this integration?
  connect(config: any): Promise<void>; // Set up auth and verify connection
  fetchBlockers(): Promise<Blocker[]>; // Pull open PRs, issues, etc.
  fetchDecisions(): Promise<Decision[]>; // Pull ADRs or equivalent
  fetchTasks(): Promise<Task[]>; // Pull task/ticket state
}
```

### Step-by-Step

1. **Create the integration file.**

   ```bash
   touch packages/core/src/integrations/my-tool.ts
   ```

2. **Implement the interface.**

   ```typescript
   import { Integration, Blocker, Decision, Task } from './types';

   export class MyToolIntegration implements Integration {
     name = 'MyTool';

     async detect(): Promise<boolean> {
       // Check for config file, env var, or CLI tool
       return !!process.env.MYTOOL_API_KEY;
     }

     async connect(config: any): Promise<void> {
       // Validate API key, test connection
     }

     async fetchBlockers(): Promise<Blocker[]> {
       // Call API, map response to Blocker type
     }

     async fetchDecisions(): Promise<Decision[]> {
       // Call API, map response to Decision type
     }

     async fetchTasks(): Promise<Task[]> {
       // Call API, map response to Task type
     }
   }
   ```

3. **Register in the init flow.**

   Add detection and setup logic in the `pm init` flow (in `packages/cli/src/commands/init.ts` or wherever initialization is orchestrated). Include the new integration in the auto-detection step so `pm init` offers to configure it.

4. **Add tests.**

   Create `packages/core/tests/integrations.test.ts` or extend the existing test file:

   ```typescript
   describe('MyTool integration', () => {
     it('should detect when API key is set', async () => {
       process.env.MYTOOL_API_KEY = 'test-key';
       const integration = new MyToolIntegration();
       await expect(integration.detect()).resolves.toBe(true);
       delete process.env.MYTOOL_API_KEY;
     });

     it('should handle API errors gracefully', async () => {
       // Mock fetch to return 401, verify error handling
     });
   });
   ```

5. **Update the config schema** in `packages/core/src/config.ts` if the integration needs new configuration fields.

---

## Release Process

PM Agent follows **semantic versioning** (`major.minor.patch`).

### Version Scheme

| Increment | When                                            |
| --------- | ----------------------------------------------- |
| `major`   | Breaking changes to the public API, CLI, or MCP |
| `minor`   | New features, new tools, new commands           |
| `patch`   | Bug fixes, performance improvements, docs       |

### How a Release Works

1. **Review the changelog.** The `CHANGELOG.md` file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Make sure all unreleased changes are captured under the correct heading (`Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, `Security`).

2. **Create a release branch.**

   ```bash
   git checkout main
   git pull upstream main
   git checkout -b release/v1.2.3
   ```

3. **Update version across packages.** npm workspaces makes this straightforward:

   ```bash
   npm version 1.2.3 --workspaces --include-workspace-root
   ```

   This updates `package.json` in every package and the root, creating a version commit and tag.

4. **Finalize the changelog.** Move unreleased entries under the new version header and add the date.

5. **Push and create a PR.** Open a PR from `release/v1.2.3` to `main`.

6. **Once merged, publish to npm.**

   ```bash
   # Build all packages
   npm run build

   # Publish each package
   npm publish -w packages/core
   npm publish -w packages/cli
   npm publish -w packages/mcp-server
   ```

   Each package can be versioned independently, though in practice they are released together.

7. **Create a GitHub release.** Tag the release commit with the version number and copy the changelog entry into the release notes.

---

## Questions & Community

### Where to Ask Questions

- **GitHub Discussions** — For questions, ideas, and general conversation. Use the "Q&A" category for questions and "Ideas" for feature proposals.
- **Discord** — For real-time chat with maintainers and other contributors. Link available in the README.

### Reporting Bugs

Open a GitHub issue with the "bug" label. Include:

- PM Agent version (`pm --version`)
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected behavior vs actual behavior
- Relevant config, rules, or error output

### Requesting Features

Open a GitHub issue with the "enhancement" label. Include:

- What you want to do
- Why the current tools can't do it
- How you imagine the feature working (a sketch is fine)
- Whether you'd be willing to contribute it

---

**Thank you for contributing to PM Agent. Every commit, every doc edit, and every bug report makes the project better for the teams that rely on it.**
