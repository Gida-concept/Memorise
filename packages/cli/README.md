# @gida-concept/pm-agent-cli

> PM Agent CLI — terminal interface for project memory and rules enforcement.

## Installation

```bash
npm install -g @gida-concept/pm-agent-cli
```

Or run directly:

```bash
npx @gida-concept/pm-agent-cli
```

## Usage

### Quick Start

```bash
# Initialize PM Agent in a project
pm init --name "my-project"

# Log a decision
pm log "Use SQLite for local storage" --body "We chose SQLite for its zero-config deployment and FTS5 search support"

# Capture a note
pm note "Discussed API design with team" --tag meeting --tag api

# List blockers
pm blockers

# Check sprint scope
pm scope "Add user authentication" --impact 3

# Daily standup
pm standup

# Project status overview
pm status

# Rule management
pm rules list
pm rules add --name "no-todo" --scope code --trigger "file.saved" --condition "file.contains('TODO')" --action "info: 'Found TODO in {file.path}'" --severity info

# Codebase scanning
pm scan
pm scan --full
pm depends src/index.ts
pm impact src/utils.ts
pm search "database"
pm arch
pm files --type source
```

## Command Reference

| Command          | Description                                                    | Key Flags                                    |
|------------------|----------------------------------------------------------------|----------------------------------------------|
| `init`           | First-time project setup                                       | `--name`, `--force`, `--scan`                |
| `log`            | Log an Architectural Decision Record (ADR)                     | `--body`, `--author`, `--json`               |
| `blockers`       | List active blockers                                           | `--json`, `--status`, `--min-age`            |
| `note`           | Quick capture a note                                           | `--tag`, `--json`                            |
| `scope`          | Sprint scope check with risk assessment                        | `--impact`, `--sprint`, `--json`             |
| `standup`        | Generate daily standup summary                                 | `--json`, `--since`                          |
| `status`         | Project state overview dashboard                               | `--json`                                     |
| `rules`          | List, add, remove, or toggle rules                             | `list`, `add`, `remove`, `toggle` subcommands|
| `scan`           | Scan codebase for file registry, deps, and architecture        | `--full`, `--watch`, `--verify`, `--json`    |
| `depends`        | Show dependency graph for a file                               | `--depth`, `--reverse`                       |
| `impact`         | Impact analysis for changes to a file                          | `--depth`                                    |
| `search`         | Full-text search across code and docs                          | `--scope`, `--type`                          |
| `arch`           | Show architecture overview                                     |                                              |
| `files`          | List indexed files                                             | `--type`, `--unindexed`                      |

## Global Flags

| Flag        | Description                      |
|-------------|----------------------------------|
| `--json`    | Output results as JSON           |
| `--help`    | Show help for any command        |
| `--version` | Show version number              |

## Exit Codes

| Code | Meaning                    |
|------|----------------------------|
| 0    | Success                    |
| 1    | General error              |
| 2    | Rule blocked the action    |
| 3    | Configuration error        |
| 4    | Database error             |
| 5    | Integration error          |

## Scripting

All commands support `--json` output for programmatic use:

```bash
# Get blocker count in CI
BLOCKERS=$(pm blockers --json | jq '.active_count')
if [ "$BLOCKERS" -gt 0 ]; then
  echo "Warning: $BLOCKERS active blockers"
fi
```

## Configuration

PM Agent stores configuration in `.pm-agent/config.toml` at your project root. Environment variables override config values:

- `PM_AGENT_CONFIG` — override config file path
- `PM_AGENT_HOME` — override data directory
- `GITHUB_TOKEN` — GitHub API token for integration
- `LINEAR_API_KEY` — Linear API key for integration

## License

MIT
