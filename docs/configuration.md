# PM Agent — Configuration Reference

> The complete reference for configuring PM Agent: all sections, fields, defaults, environment variables, path overrides, multi-project setup, and precedence rules.

---

## Table of Contents

- [Overview](#overview)
- [File Location](#file-location)
- [Complete Config Reference](#complete-config-reference)
  - [`[project]`](#project)
  - [`[integrations.github]`](#integrationsgithub)
  - [`[integrations.linear]`](#integrationslinear)
  - [`[integrations.slack]`](#integrationsslack)
  - [`[ai]`](#ai)
  - [`[rules]`](#rules)
  - [`[memory]`](#memory)
  - [`[sync]`](#sync)
  - [`[scan]`](#scan)
- [Default Config](#default-config)
- [Environment Variables](#environment-variables)
- [Path Overrides](#path-overrides)
- [Multi-Project Setup](#multi-project-setup)
- [Configuration Precedence](#configuration-precedence)

---

## Overview

PM Agent is configured through a single **TOML** file at `~/.config/pm-agent/config.toml`. This file is created automatically the first time you run `pm init` and contains all project-specific settings: integrations, AI provider, rules path, memory storage, and sync configuration.

Key design decisions:

| Decision                               | Why                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **TOML format**                        | Human-readable, comment-friendly, version-controllable. Same format as the rules engine                        |
| **Environment variable interpolation** | Secrets like API tokens go in env vars (`${GITHUB_TOKEN}`), not the file. PM Agent substitutes them at runtime |
| **Single file per project**            | One `config.toml` governs one project. Switch projects by switching configs (or using the `--project` flag)    |
| **Created by `pm init`**               | You never write config from scratch. `pm init` detects your git remote, integrations, and scaffolds everything |

### How Env Var Interpolation Works

Any string value in `config.toml` can reference an environment variable using `${VAR_NAME}` syntax:

```toml
[integrations.github]
token = "${GITHUB_TOKEN}"

[integrations.linear]
api_key = "${LINEAR_API_KEY}"

[ai]
api_key = "${ANTHROPIC_API_KEY}"
```

PM Agent resolves these at startup. If a referenced variable is unset, PM Agent **warns but does not crash** — integrations relying on that token will simply fail to connect.

You can mix literal text with env vars:

```toml
# Static hostname, dynamic token
host = "github.acme-corp.internal"
token = "${GITHUB_TOKEN}"
```

---

## File Location

### Default Path

```
~/.config/pm-agent/config.toml
```

This follows the **XDG Base Directory Specification** on Linux. On other platforms:

| Platform            | Default Config Path                                  |
| ------------------- | ---------------------------------------------------- |
| Linux / macOS       | `~/.config/pm-agent/config.toml`                     |
| macOS (alternative) | `~/Library/Application Support/pm-agent/config.toml` |
| Windows             | `%APPDATA%\pm-agent\config.toml`                     |

### Override with `--config` Flag

```bash
# Use a different config file entirely
pm --config ~/projects/auth-service/pm-agent-config.toml status
pm --config /etc/pm-agent/team-config.toml scan --full
```

When `--config` is provided, PM Agent reads only that file. It ignores the default path entirely.

### Override with `PM_AGENT_CONFIG` Environment Variable

```bash
# Set once in your shell profile
export PM_AGENT_CONFIG="$HOME/projects/auth-service/pm-agent-config.toml"

# PM Agent uses this path from now on
pm status
```

### Detection Order

1. `--config` CLI flag (highest priority)
2. `PM_AGENT_CONFIG` environment variable
3. Default path (`~/.config/pm-agent/config.toml`)

If none of these resolve to an existing file, PM Agent shows a setup prompt or error, depending on the command.

---

## Complete Config Reference

### `[project]`

Identifies the project PM Agent manages. This section is required.

| Field         | Type     | Default                   | Description                                                             |
| ------------- | -------- | ------------------------- | ----------------------------------------------------------------------- |
| `name`        | `string` | (detected from directory) | Short project name. Used in database filename, MCP context, and display |
| `root`        | `string` | (current directory)       | Absolute path to the project root on disk                               |
| `description` | `string` | `""`                      | Optional human-readable description of the project                      |

```toml
[project]
name = "auth-service"
root = "/Users/you/projects/auth-service"
description = "Authentication microservice — OAuth, magic links, session management"
```

**Notes:**

- `name` is used to generate the database path: `~/.local/share/pm-agent/<name>.db`
- `root` is where `pm scan` walks to build the file registry
- If `name` is omitted during `pm init`, it's inferred from the directory name
- `description` is surfaced in `pm status` and MCP context responses

---

### `[integrations.github]`

GitHub integration for PRs, issues, reviews, and repository context.

| Field   | Type     | Default                      | Description                                                                            |
| ------- | -------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| `repo`  | `string` | (detected from `git remote`) | GitHub repository in `owner/repo` format                                               |
| `token` | `string` | `"${GITHUB_TOKEN}"`          | GitHub personal access token (classic or fine-grained). Supports env var interpolation |
| `host`  | `string` | `"github.com"`               | GitHub hostname. Required for GitHub Enterprise Server                                 |

```toml
[integrations.github]
repo = "acme-corp/auth-service"
token = "${GITHUB_TOKEN}"

# GitHub Enterprise Server
[integrations.github]
repo = "acme-corp/auth-service"
token = "${GITHUB_TOKEN}"
host = "github.acme-corp.internal"
```

**Token requirements:**

- Minimum scopes: `repo` (private repos) or `public_repo` (public repos)
- For GHES: personal access token with same scopes, plus valid hostname
- Token is read at startup and never stored in the config file when using `${GITHUB_TOKEN}`

**Auto-detection during `pm init`:**
PM Agent reads `git remote -v` to detect the repository. If the remote URL is `git@github.com:acme-corp/auth-service.git`, it infers:

- `repo = "acme-corp/auth-service"`
- `host = "github.com"`

---

### `[integrations.linear]`

Linear integration for ticket tracking, sprint management, and team workflow.

| Field       | Type     | Default                | Description                                    |
| ----------- | -------- | ---------------------- | ---------------------------------------------- |
| `workspace` | `string` | (prompted during init) | Linear workspace slug (e.g., `"ACME"`)         |
| `api_key`   | `string` | `"${LINEAR_API_KEY}"`  | Linear API key. Supports env var interpolation |

```toml
[integrations.linear]
workspace = "ACME"
api_key = "${LINEAR_API_KEY}"
```

**Notes:**

- API key is created in Linear under Settings > API > Personal API Keys
- The workspace slug is the subdomain in your Linear URL: `https://linear.app/ACME/`
- PM Agent queries Linear for: teams, projects, issues (status, assignee, sprint), and maps them to tasks and blockers in the memory graph

---

### `[integrations.slack]`

Slack integration for blocker alerts, standup summaries, and decision detection.

| Field       | Type               | Default            | Description                                            |
| ----------- | ------------------ | ------------------ | ------------------------------------------------------ |
| `workspace` | `string`           | `""`               | Slack workspace name or ID                             |
| `token`     | `string`           | `"${SLACK_TOKEN}"` | Slack bot token. Supports env var interpolation        |
| `channels`  | `array of strings` | `[]`               | Slack channels to monitor for decision/blocker context |

```toml
[integrations.slack]
workspace = "acme"
token = "${SLACK_TOKEN}"
channels = ["#product", "#engineering", "#standup"]
```

**Token requirements:**

- Slack app with `channels:history`, `channels:read`, `chat:write` scopes
- Bot token starts with `xoxb-`
- User token starts with `xoxp-`

**Notes:**

- `channels` is optional. If empty, PM Agent only posts to the default channel configured in the Slack app
- This integration is planned (roadmap) — the config section is forward-compatible

---

### `[ai]`

AI provider configuration. PM Agent never calls the AI directly — this is used for optional features like generating meeting briefs and standup summaries when no MCP client is available, or for providing context to the AI client.

| Field      | Type     | Default                     | Description                                                                  |
| ---------- | -------- | --------------------------- | ---------------------------------------------------------------------------- |
| `provider` | `string` | `"anthropic"`               | AI provider: `"anthropic"`, `"openai"`, `"google"`, or `"local"`             |
| `api_key`  | `string` | `""`                        | API key for the provider. Supports env var interpolation                     |
| `model`    | `string` | (provider-specific default) | Model identifier                                                             |
| `base_url` | `string` | `""`                        | Base URL override. Required for `provider = "local"` with Ollama, vLLM, etc. |

```toml
# Anthropic (default)
[ai]
provider = "anthropic"
api_key = "${ANTHROPIC_API_KEY}"
model = "claude-sonnet-4-20250514"

# OpenAI
[ai]
provider = "openai"
api_key = "${OPENAI_API_KEY}"
model = "gpt-4o"

# Google
[ai]
provider = "google"
api_key = "${GOOGLE_API_KEY}"
model = "gemini-2.0-flash"

# Local (Ollama, vLLM, LM Studio, etc.)
[ai]
provider = "local"
model = "codellama:34b"
base_url = "http://localhost:11434/v1"

# Local with OpenAI-compatible server
[ai]
provider = "local"
model = "deepseek-coder-v2"
base_url = "https://inference.mycompany.com/v1"
api_key = "${INTERNAL_INFERENCE_KEY}"
```

**Provider-specific defaults:**

| Provider    | Default Model              | Notes                                                          |
| ----------- | -------------------------- | -------------------------------------------------------------- |
| `anthropic` | `claude-sonnet-4-20250514` | Uses Anthropic API at `api.anthropic.com`                      |
| `openai`    | `gpt-4o`                   | Uses OpenAI API at `api.openai.com`                            |
| `google`    | `gemini-2.0-flash`         | Uses Google AI API at `generativelanguage.googleapis.com`      |
| `local`     | (none, must specify)       | Uses `base_url` as the API endpoint. Must be OpenAI-compatible |

**Important:** PM Agent does **not** call the AI provider during normal operation. The AI config is only used for:

1. Optional "suggest" features when no MCP client is connected
2. Reporting the configured AI provider in MCP context responses so your AI knows what model it should use
3. Future roadmap features (automatic meeting brief generation, standup summaries)

---

### `[rules]`

Controls the rules engine: where to find rules, whether they're active.

| Field         | Type      | Default                           | Description                                                              |
| ------------- | --------- | --------------------------------- | ------------------------------------------------------------------------ |
| `config_path` | `string`  | `"~/.config/pm-agent/rules.toml"` | Path to the rules TOML file. Supports `~` expansion                      |
| `enabled`     | `boolean` | `true`                            | Master switch for the rules engine. `false` disables all rule evaluation |

```toml
[rules]
config_path = "~/.config/pm-agent/rules.toml"
enabled = true
```

**Notes:**

- `config_path` can point to a file in your project repository for team-shared rules: `config_path = "./pm-agent-rules.toml"`
- When `enabled = false`, all rules are skipped. No triggers fire, no actions execute. The rules file is not even read
- You can temporarily disable rules via CLI: `pm rules disable --all` — this is equivalent to setting `enabled = false`
- See the [rules reference](rules.md) for the complete rules engine documentation

---

### `[memory]`

Controls how PM Agent stores and retains project state.

| Field            | Type      | Default                                       | Description                                                                                 |
| ---------------- | --------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `storage`        | `string`  | `"sqlite"`                                    | Storage backend. Currently only `"sqlite"` is supported                                     |
| `path`           | `string`  | `"~/.local/share/pm-agent/<project-name>.db"` | Path to the SQLite database file                                                            |
| `retention_days` | `integer` | `365`                                         | Number of days to retain old data. Records older than this may be pruned during maintenance |

```toml
[memory]
storage = "sqlite"
path = "~/.local/share/pm-agent/auth-service.db"
retention_days = 365
```

**Notes:**

- `path` defaults to `~/.local/share/pm-agent/<project-name>.db` based on the `[project].name` value
- You can override `path` to store the database alongside your project: `path = "./.pm-agent/project.db"`
- `retention_days` affects cleanup of: old scope snapshots, stale notes, outdated dependency edges. Decision records (ADRs) are **never** pruned regardless of this setting
- The database is created automatically on first `pm init`. Schema migrations run on version bumps

---

### `[sync]`

Team sync configuration (roadmap feature — currently non-functional but reserved for forward compatibility).

| Field      | Type      | Default | Description                                               |
| ---------- | --------- | ------- | --------------------------------------------------------- |
| `enabled`  | `boolean` | `false` | Enable encrypted team sync. Opt-in for privacy            |
| `encrypt`  | `boolean` | `true`  | Encrypt data at rest during sync using AES-256-GCM        |
| `endpoint` | `string`  | `""`    | Custom sync server endpoint (for self-hosted deployments) |

```toml
# Default: disabled
[sync]
enabled = false
encrypt = true

# Future: enabled with custom endpoint
[sync]
enabled = true
encrypt = true
endpoint = "https://sync.pm-agent.dev/team/acme-corp"
```

**Notes:**

- Sync is opt-in. When `enabled = false`, all data stays local — nothing leaves your machine
- When encrypt is `true` (default), data is encrypted client-side before transmission. The sync server never sees plaintext
- The default endpoint is PM Agent's managed sync service. Self-hosted users can set a custom `endpoint`
- This section is reserved for roadmap use. Setting it now won't break anything, but sync isn't active yet

---

### `[scan]`

Controls codebase scanning behavior — file discovery, resource limits, and incremental watching.

| Field              | Type               | Default                                                                                                                    | Description                                            |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `exclude_patterns` | `array of strings` | `["node_modules/**", ".git/**", "dist/**", "build/**", ".next/**", "vendor/**", "target/**", "__pycache__/**", "*.min.*"]` | Glob patterns to exclude from scanning                 |
| `max_file_size_mb` | `integer`          | `10`                                                                                                                       | Skip files larger than this many megabytes             |
| `follow_symlinks`  | `boolean`          | `false`                                                                                                                    | Whether to follow symbolic links during directory walk |
| `watch_enabled`    | `boolean`          | `true`                                                                                                                     | Enable the file watcher for incremental re-scans       |

```toml
[scan]
exclude_patterns = [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    ".next/**",
    "vendor/**",
    "target/**",
    "__pycache__/**",
    "*.min.*",
    "coverage/**",
    ".venv/**",
    "*.generated.*",
]
max_file_size_mb = 10
follow_symlinks = false
watch_enabled = true
```

**Notes:**

- `exclude_patterns` are combined with `.gitignore` patterns. A file excluded by either is skipped
- `max_file_size_mb` prevents large binary files, vendored assets, or generated files from bloating the file registry
- `follow_symlinks = false` prevents infinite loops and duplicate indexing of linked directories
- `watch_enabled = false` disables the `fs.watch`-based incremental scanner. You can still run `pm scan` manually, it just won't auto-detect changes

**Adding custom exclude patterns:**

```bash
# Via CLI flag (overrides config for this run)
pm scan --full --exclude "docs/generated/**" --exclude "tmp/**"

# Or add to config.toml permanently
[scan]
exclude_patterns = [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "docs/generated/**",
    "tmp/**",
]
```

---

## Default Config

When you run `pm init`, PM Agent creates this default `config.toml` with auto-detected values:

```toml
# ── PM Agent Configuration ──────────────────────────────────────
# Created by `pm init`
# Edit at: ~/.config/pm-agent/config.toml
#
# This file uses TOML format.
# Secrets use environment variable interpolation: ${VAR_NAME}
#   → GITHUB_TOKEN, LINEAR_API_KEY, SLACK_TOKEN, ANTHROPIC_API_KEY, etc.
#
# Run `pm config show` to view the resolved configuration
# (with env vars expanded, secrets masked).

# ── Project ─────────────────────────────────────────────────────

[project]
# Short project name. Used for database filename and display.
name = "auth-service"

# Absolute path to project root. `pm scan` walks this directory.
root = "/Users/you/projects/auth-service"

# Optional description — surfaced in `pm status` and MCP context.
description = ""

# ── Integrations ────────────────────────────────────────────────

[integrations.github]
# GitHub repository in owner/repo format.
# Auto-detected from `git remote -v` during init.
repo = "acme-corp/auth-service"

# GitHub personal access token. Uses env var by default.
# Minimum scopes: repo (private) or public_repo (public).
token = "${GITHUB_TOKEN}"

# GitHub hostname. Change for GitHub Enterprise Server.
# host = "github.acme-corp.internal"

[integrations.linear]
# Linear workspace slug (subdomain from linear.app/<workspace>).
workspace = "ACME"

# Linear API key from Settings > API > Personal API Keys.
api_key = "${LINEAR_API_KEY}"

# ── AI Provider ─────────────────────────────────────────────────

[ai]
# Provider: "anthropic", "openai", "google", or "local".
provider = "anthropic"

# API key for the selected provider.
api_key = "${ANTHROPIC_API_KEY}"

# Model identifier. Defaults to provider's current recommended model.
model = "claude-sonnet-4-20250514"

# Base URL override. Required for `provider = "local"` (Ollama, vLLM, etc.).
# base_url = "http://localhost:11434/v1"

# ── Rules Engine ────────────────────────────────────────────────

[rules]
# Path to the rules TOML file.
config_path = "~/.config/pm-agent/rules.toml"

# Master switch. Set to false to disable all rule evaluation.
enabled = true

# ── Memory / Storage ───────────────────────────────────────────

[memory]
# Storage backend. Currently only "sqlite" is supported.
storage = "sqlite"

# Path to the SQLite database.
# Defaults to: ~/.local/share/pm-agent/<project-name>.db
path = "~/.local/share/pm-agent/auth-service.db"

# Retention period in days. Records older than this may be pruned.
# Decision records (ADRs) are never pruned regardless of this setting.
retention_days = 365

# ── Team Sync (Roadmap) ────────────────────────────────────────

[sync]
# Opt-in encrypted team sync. Data stays local when disabled.
enabled = false

# AES-256-GCM encryption at rest during sync.
encrypt = true

# Custom sync server endpoint (self-hosted deployments).
# endpoint = "https://sync.pm-agent.dev/team/acme-corp"

# ── Codebase Scanner ───────────────────────────────────────────

[scan]
# Glob patterns to exclude from scanning.
exclude_patterns = [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    ".next/**",
    "vendor/**",
    "target/**",
    "__pycache__/**",
    "*.min.*",
]

# Skip files larger than this many megabytes.
max_file_size_mb = 10

# Follow symbolic links during directory walk.
follow_symlinks = false

# Enable file watcher for incremental re-scans.
watch_enabled = true
```

---

## Environment Variables

PM Agent recognizes the following environment variables. All are optional — PM Agent works without any of them set, though integrations obviously won't connect without their respective tokens.

| Variable            | Description                                           | Used In                              | Default                          |
| ------------------- | ----------------------------------------------------- | ------------------------------------ | -------------------------------- |
| `PM_AGENT_CONFIG`   | Override path to config file                          | Config loader                        | `~/.config/pm-agent/config.toml` |
| `PM_AGENT_HOME`     | Override base config directory                        | Config loader, rules path, data path | `~/.config/pm-agent/`            |
| `PM_AGENT_PROJECT`  | Select active project name (for multi-project setups) | Config loader, project detection     | (none)                           |
| `GITHUB_TOKEN`      | GitHub personal access token                          | GitHub integration                   | (none)                           |
| `LINEAR_API_KEY`    | Linear personal API key                               | Linear integration                   | (none)                           |
| `SLACK_TOKEN`       | Slack bot or user token                               | Slack integration                    | (none)                           |
| `ANTHROPIC_API_KEY` | Anthropic API key                                     | AI provider (optional)               | (none)                           |
| `OPENAI_API_KEY`    | OpenAI API key                                        | AI provider (optional)               | (none)                           |
| `GOOGLE_API_KEY`    | Google AI API key                                     | AI provider (optional)               | (none)                           |

### Usage Examples

```bash
# Set temporarily for a single command
GITHUB_TOKEN=ghp_abc123 LINEAR_API_KEY=lin_abc123 pm init

# Set in shell profile (recommended)
echo 'export GITHUB_TOKEN="ghp_abc123"' >> ~/.bashrc
echo 'export LINEAR_API_KEY="lin_abc123"' >> ~/.bashrc
echo 'export ANTHROPIC_API_KEY="sk-ant-abc123"' >> ~/.bashrc

# Override config path inline
PM_AGENT_CONFIG=~/projects/other-project/config.toml pm status

# Select a different project by name
PM_AGENT_PROJECT=docs-site pm status
```

### OS Keychain Integration

Beyond environment variables, PM Agent can read tokens from the OS keychain:

| Platform | Backend            | Command                                                     |
| -------- | ------------------ | ----------------------------------------------------------- |
| macOS    | Keychain           | `security find-internet-password -s github.com -a pm-agent` |
| Linux    | libsecret          | `secret-tool lookup service pm-agent key github_token`      |
| Windows  | Credential Manager | (via `keytar` or `vault` modules)                           |

This is used as a fallback when the env var is not set. The keychain is never written to by PM Agent — you manage tokens there with your system's credential tools.

---

## Path Overrides

PM Agent uses these directories by default:

| Purpose          | Default Path                                |
| ---------------- | ------------------------------------------- |
| Config file      | `~/.config/pm-agent/config.toml`            |
| Rules file       | `~/.config/pm-agent/rules.toml`             |
| Data directory   | `~/.local/share/pm-agent/`                  |
| Project database | `~/.local/share/pm-agent/<project-name>.db` |

You can override any of these independently.

### Change Config Directory with `PM_AGENT_HOME`

Setting `PM_AGENT_HOME` changes the base directory for both the config file and the rules file:

```bash
export PM_AGENT_HOME="$HOME/projects/auth-service/.pm-agent"
```

With this set, PM Agent looks for:

- `$PM_AGENT_HOME/config.toml` (instead of `~/.config/pm-agent/config.toml`)
- `$PM_AGENT_HOME/rules.toml` (if `[rules].config_path` is not explicitly set)

This is useful for:

- **Per-project config**: Keep config alongside the project in version control
- **Team-shared configuration**: Point to a team directory with shared rules
- **CI/CD environments**: Isolate config in the workspace

### Override Rules Path Independently

The `[rules].config_path` field can point anywhere:

```toml
[rules]
# Path relative to project root
config_path = "./pm-agent-rules.toml"

# Absolute path to team-shared rules
config_path = "/etc/pm-agent/team-rules.toml"

# Another config directory
config_path = "~/.config/pm-agent/custom-rules.toml"
```

The rules path supports:

- `~` expansion for home directory
- Absolute paths (`/etc/...`, `C:\Users\...`)
- Relative paths (resolved against the project root)
- Environment variables (`${PM_AGENT_HOME}/rules.toml`)

### Override Database Path Independently

The `[memory].path` field controls where the SQLite database lives:

```toml
[memory]
# Store DB alongside project (useful for backups)
path = "./.pm-agent/project.db"

# Custom data directory
path = "/data/pm-agent/auth-service.db"

# Ephemeral path (discard after CI run)
path = "/tmp/pm-agent-ci.db"
```

### Examples of Complete Override Patterns

```bash
# 1. Fully isolated per-project setup
export PM_AGENT_HOME="$PWD/.pm-agent"
pm init

# Creates:
#   .pm-agent/
#   ├── config.toml
#   └── rules.toml
# And database at:
#   .pm-agent/project.db  (if [memory].path is also overridden)
# Or at default:
#   ~/.local/share/pm-agent/<name>.db

# 2. Shared config, local data
export PM_AGENT_HOME="/etc/pm-agent"
# Config + rules come from /etc/pm-agent/
# Database stays in ~/.local/share/pm-agent/

# 3. Full custom layout
export PM_AGENT_CONFIG="$HOME/projects/auth-service/.pm/config.toml"
# Edit config.toml to set:
#   [rules]
#   config_path = "../.pm/rules.toml"
#   [memory]
#   path = "../.pm/data/project.db"
```

---

## Multi-Project Setup

PM Agent supports multiple projects on the same machine. Each project has its own config file, rules, and database.

### How Multi-Project Works

Each project is identified by its `[project].name`. The name determines:

- The default database path: `~/.local/share/pm-agent/<name>.db`
- The project label in MCP context responses
- The selection key for `--project` and `PM_AGENT_PROJECT`

### Methods to Switch Projects

**Method 1: Separate config files**

Create a config file for each project and use `--config`:

```bash
# Switch to project A
pm --config ~/projects/api-service/.pm-agent/config.toml status

# Switch to project B
pm --config ~/projects/web-app/.pm-agent/config.toml status
```

**Method 2: Environment variable**

```bash
# Set once per terminal session
export PM_AGENT_CONFIG=~/projects/api-service/.pm-agent/config.toml
pm status
pm blockers
```

**Method 3: `--project` flag**

When you have multiple config files, you can switch by name:

```bash
# List known projects (configs in standard locations)
pm config list-projects
# → auth-service (~/.config/pm-agent/projects/auth-service.toml)
# → web-app     (~/.config/pm-agent/projects/web-app.toml)

# Switch by name
pm --project auth-service status
pm --project web-app scan --full
```

The `--project` flag searches known locations for a matching config. This is configured by placing project-specific configs in `~/.config/pm-agent/projects/<name>.toml`.

**Method 4: Per-directory detection**

PM Agent can auto-detect the project based on the current directory:

```toml
# In each project's config, set the root:
[project]
name = "auth-service"
root = "/Users/you/projects/auth-service"
```

When you `cd` into a project directory and run `pm`, PM Agent checks if the current directory (or any parent) matches a configured `[project].root` path and loads that config automatically.

### Per-Project Config Overrides

You can place a `.pm-agent.toml` file in your project root for localized overrides:

```bash
# ~/projects/auth-service/.pm-agent.toml
```

This file uses the same format as `config.toml` but only needs to specify the fields that differ from the base config:

```toml
# .pm-agent.toml — per-project overrides
# These merge on top of the global config.toml

[project]
name = "auth-service"
root = "/Users/you/projects/auth-service"
description = "Authentication microservice"

[scan]
exclude_patterns = ["node_modules/**", ".git/**", "dist/**", "generated/**"]
```

The per-project file is automatically detected when you run `pm` from within or beneath that directory. No flag needed.

### Project Switching Workflow

```bash
# Set up a new project
cd ~/projects/mobile-app
pm init
# → Creates ~/.config/pm-agent/projects/mobile-app.toml (--project compatible)
# → Creates ~/.local/share/pm-agent/mobile-app.db
# → Prompts for integrations

# Switch to it later
cd ~/projects/mobile-app
pm status
# → Auto-detected: "mobile-app" (from .pm-agent.toml or git remote)

# Or explicitly
pm --project mobile-app status

# Quick switch in scripts
PM_AGENT_PROJECT=mobile-app pm blockers
```

---

## Configuration Precedence

When multiple sources provide the same configuration value, PM Agent resolves them in a strict order:

```
 Highest Priority
       │
       │  1. CLI flags (--config, --project, etc.)
       │  2. Environment variables (PM_AGENT_CONFIG, PM_AGENT_PROJECT)
       │  3. Per-project override file (.pm-agent.toml in project root)
       │  4. Main config file (~/.config/pm-agent/config.toml)
       │  5. Built-in defaults (compiled into PM Agent)
       │
       ▼
 Lowest Priority
```

### Detailed Precedence Rules

| Setting          | CLI Flag           | Env Var            | Override File                 | Config File                   | Default                          |
| ---------------- | ------------------ | ------------------ | ----------------------------- | ----------------------------- | -------------------------------- |
| Config file path | `--config <path>`  | `PM_AGENT_CONFIG`  | —                             | —                             | `~/.config/pm-agent/config.toml` |
| Config home      | —                  | `PM_AGENT_HOME`    | —                             | —                             | `~/.config/pm-agent/`            |
| Project name     | `--project <name>` | `PM_AGENT_PROJECT` | `[project].name`              | `[project].name`              | (current directory name)         |
| Project root     | —                  | —                  | `[project].root`              | `[project].root`              | (current directory)              |
| GitHub token     | —                  | `GITHUB_TOKEN`     | `[integrations.github].token` | `[integrations.github].token` | `""`                             |
| AI provider      | —                  | —                  | `[ai].provider`               | `[ai].provider`               | `"anthropic"`                    |
| Rules enabled    | —                  | —                  | `[rules].enabled`             | `[rules].enabled`             | `true`                           |
| Max file size    | `--max-size`       | —                  | `[scan].max_file_size_mb`     | `[scan].max_file_size_mb`     | `10`                             |

### Resolution Logic

```typescript
// Pseudocode for config resolution
function resolveConfig(): Config {
  // 1. Start with built-in defaults
  let config = DEFAULTS;

  // 2. Load main config file (default path or overridden)
  const configPath = resolveConfigPath(); // CLI > ENV > default
  if (fileExists(configPath)) {
    config = merge(config, parseToml(configPath));
  }

  // 3. Load per-project override file (if exists)
  const projectOverridePath = findProjectOverride(); // .pm-agent.toml
  if (projectOverridePath) {
    config = merge(config, parseToml(projectOverridePath));
  }

  // 4. Apply environment variables (override file values)
  if (process.env.GITHUB_TOKEN) {
    config.integrations.github.token = process.env.GITHUB_TOKEN;
  }
  if (process.env.PM_AGENT_PROJECT) {
    config.project.name = process.env.PM_AGENT_PROJECT;
  }

  // 5. Apply CLI flags (override everything)
  if (cliFlags.project) {
    config.project.name = cliFlags.project;
  }
  if (cliFlags.maxSize) {
    config.scan.max_file_size_mb = cliFlags.maxSize;
  }

  // 6. Resolve env var references in string values
  config = interpolateEnvVars(config);

  return config;
}
```

### Precedence Examples

**Example 1: Env var beats config file**

```toml
# config.toml
[integrations.github]
token = "${GITHUB_TOKEN}"  # falls back to env var at runtime
```

```bash
# At runtime:
export GITHUB_TOKEN="ghp_production_token"

# Config reads "${GITHUB_TOKEN}", resolves to "ghp_production_token"
```

**Example 2: CLI flag beats env var**

```bash
# Force a specific config regardless of environment
pm --config ~/projects/emergency-fix/config.toml status

# Even if PM_AGENT_CONFIG is set, --config wins
export PM_AGENT_CONFIG=~/projects/main/config.toml
pm --config ~/projects/emergency-fix/config.toml status
# → Uses ~/projects/emergency-fix/config.toml
```

**Example 3: Per-project override merges on top of base config**

```toml
# ~/.config/pm-agent/config.toml (base config)
[project]
name = "default-project"

[integrations.github]
token = "${GITHUB_TOKEN}"

[scan]
max_file_size_mb = 10
```

```toml
# ~/projects/auth-service/.pm-agent.toml (per-project override)
[project]
name = "auth-service"      # overrides "default-project"
root = "/Users/you/projects/auth-service"  # adds root

[scan]
max_file_size_mb = 5        # overrides 10 → 5
# integrations.github section is inherited from base config
```

**Result:**

```toml
# Resolved config for this project
[project]
name = "auth-service"                    # from override
root = "/Users/you/projects/auth-service" # from override

[integrations.github]
token = "${GITHUB_TOKEN}"                 # inherited from base

[scan]
max_file_size_mb = 5                      # from override
```

### Viewing Resolved Config

```bash
# Show the fully resolved config (all sources merged, env vars expanded)
pm config show

# Show resolved config with secrets masked
pm config show --mask-secrets
# → token = "ghp_****1234"

# Show what source each value came from
pm config show --verbose
# → project.name        = "auth-service"  (source: .pm-agent.toml:3)
# → integrations.github.token = "ghp_..." (source: env var GITHUB_TOKEN)
# → scan.max_file_size_mb = 10            (source: default)
```

---

## Config Validation

PM Agent validates your config file on load. Here are the common issues and how to fix them:

| Issue                 | Error Message                                             | Fix                                                                     |
| --------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Invalid TOML syntax   | `Parse error at line 12: unexpected character`            | Check TOML syntax — strings in double quotes, tables in `[brackets]`    |
| Unknown section       | `Unknown config section: [foo]`                           | Remove the section or check for typos                                   |
| Invalid field type    | `Expected string for [project].name, got number`          | Check the field type from the reference above                           |
| Config file not found | `Config file not found at ~/.config/pm-agent/config.toml` | Run `pm init` to create it, or set `PM_AGENT_CONFIG`                    |
| Unresolvable env var  | `Warning: GITHUB_TOKEN is not set (referenced in config)` | Set the env var or remove the `token` field from config                 |
| Rules file missing    | `Rules file not found at ~/.config/pm-agent/rules.toml`   | Run `pm init` or create the rules file, or update `[rules].config_path` |

---

## Quick Reference

### Minimal Config

The absolute minimum to start a project:

```toml
[project]
name = "my-project"
root = "/Users/you/projects/my-project"
```

### Config with Integrations

```toml
[project]
name = "my-project"
root = "/Users/you/projects/my-project"

[integrations.github]
repo = "you/my-project"
token = "${GITHUB_TOKEN}"

[integrations.linear]
workspace = "MYTEAM"
api_key = "${LINEAR_API_KEY}"
```

### Config with Custom Paths

```toml
[project]
name = "my-project"
root = "/Users/you/projects/my-project"

[rules]
config_path = "./.pm-agent/rules.toml"

[memory]
path = "./.pm-agent/data.db"

[scan]
exclude_patterns = ["node_modules/**", ".git/**", "dist/**", "generated/**"]
```

### CI/CD Config (Ephemeral)

```toml
[project]
name = "ci-project"
root = "/workspace"

[scan]
exclude_patterns = ["node_modules/**", ".git/**"]
max_file_size_mb = 20

[rules]
enabled = false

[sync]
enabled = false
```
