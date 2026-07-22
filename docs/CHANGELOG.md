# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- SQLite memory layer with `better-sqlite3` — persistent project graph for decisions, blockers, notes, tasks, and scope snapshots
- Entity graph for cross-entity traversal via `linked_entities` JSON references
- TOML rules engine with trigger-condition-action evaluation, `pm`/`code`/`all` scopes, and `hard`/`soft`/`info` severity enforcement
- Lightweight expression parser for rule triggers and conditions (property access, comparisons, string containment, boolean logic, template interpolation)
- CLI (`pm` command) built with Commander.js — init, log, note, blockers, scope, standup, status, rules management
- Interactive CLI UX with Chalk (colors), Ora (spinners), and Inquirer (prompts)
- MCP server via `@modelcontextprotocol/sdk` with stdio transport — exposes 18 tools for AI-native project management
- GitHub integration — REST API for PRs and issues, auto-detection via `git remote`
- Linear integration — GraphQL API for tickets, teams, and projects
- Codebase intelligence scanner — recursive file walking, SHA-256 hashing, type classification
- Dependency graph mapper — shells to ripgrep and madge for import resolution and circular-dependency detection
- Architecture detector — recognizes entry points, frameworks, and project patterns
- Full-text search via SQLite FTS5 across documentation and code content
- Impact analysis — reverse-dependency traversal with transitive depth and linked PM context
- Change watcher — `fs.watch`-based incremental re-scanning
- Configuration via `~/.config/pm-agent/config.toml` — project settings, integration tokens, AI provider, rules path, memory retention
- Monorepo structure with npm workspaces (`core`, `cli`, `mcp-server`, `desktop`, `vscode-ext`)
- Build pipeline with tsup (CJS + ESM + type declarations)

### Changed

- Placeholder for future changes.

### Deprecated

- Placeholder for future deprecations.

### Removed

- Placeholder for future removals.

### Fixed

- Placeholder for future fixes.

### Security

- Placeholder for future security notes.

## [0.1.0] - 2025-01-09

### Added

- Initial project scaffolding — npm workspaces monorepo with `packages/core`, `packages/cli`, `packages/mcp-server`
- Shared TypeScript configuration (strict mode)
- SQLite database wrapper with schema migrations
- Core memory entities: decisions, blockers, notes, tasks, scope snapshots
- Entity graph module for cross-referencing linked entities
- TOML rules engine with full evaluation pipeline
- Expression parser for rule triggers and conditions
- CLI entry point with Commander.js command registration
- MCP server setup with tool registration pattern
- GitHub integration module (REST/GraphQL)
- Linear integration module (GraphQL)
- Codebase scanner: file registry, dependency mapper, architecture detector, change watcher, impact analyzer
- Full-text search with SQLite FTS5 and sync triggers
- Configuration and rules file loading from `~/.config/pm-agent/`
- `pm init` command for first-time setup and integration detection
- Test infrastructure with Vitest

[Unreleased]: https://github.com/pm-agent/pm-agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/pm-agent/pm-agent/releases/tag/v0.1.0
