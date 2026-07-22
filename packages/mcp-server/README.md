# @gida-concept/pm-agent-mcp-server

> PM Agent MCP server — expose project memory, rules, and codebase intelligence to AI agents via the [Model Context Protocol](https://modelcontextprotocol.io).

## Installation

```bash
npm install -g @gida-concept/pm-agent-mcp-server
```

Or run directly:

```bash
npx @gida-concept/pm-agent-mcp-server
```

## Overview

This MCP server provides AI agents with structured access to a project's PM context: decisions, blockers, notes, tasks, scope snapshots, rules enforcement, codebase scanning, dependency analysis, and impact assessment.

It communicates over **stdio transport** and is compatible with any MCP client (Claude Code, Cursor, VS Code via extension, Zed, etc.).

## Tools

### Project Context

| Tool                | Description                                           |
|---------------------|-------------------------------------------------------|
| `pm_get_context`    | Aggregated project memory snapshot (decisions + blockers + notes + tasks) |
| `pm_get_blockers`   | Active/resolved blockers with age/status filters       |
| `pm_get_decisions`  | Decision records (ADRs) with author and date filters   |
| `pm_get_notes`      | Notes with tag and text search                         |
| `pm_get_scope`      | Latest scope snapshot or sprint history                |
| `pm_get_standup`    | Daily standup summary from recent state                |
| `pm_prep_meeting`   | Meeting brief with context and related tickets         |

### Decision & Rules

| Tool                | Description                                           |
|---------------------|-------------------------------------------------------|
| `pm_log_decision`   | Create a new decision record (ADR)                     |
| `pm_log_note`       | Quick capture a note with auto-linking                 |
| `pm_add_rule`       | Add a rule from AI suggestion                          |
| `pm_enforce_rules`  | Evaluate matching rules against a context object       |
| `pm_check_scope`    | Sprint scope impact + risk + rules enforcement         |

### Codebase Intelligence

| Tool                     | Description                                     |
|---------------------------|-------------------------------------------------|
| `pm_scan_codebase`        | Full/incremental/verify codebase scan            |
| `pm_get_dependency_graph` | Dependency graph for a file                      |
| `pm_analyze_impact`       | Impact analysis with PM context linking           |
| `pm_search_codebase`      | Full-text search across code and docs             |
| `pm_get_architecture`     | Architecture overview (entry points, layers)      |
| `pm_get_file_context`     | Context for a specific file                       |

## Client Configuration

### Claude Code

Add to your `CLAUDE.md`:

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["@gida-concept/pm-agent-mcp-server"]
    }
  }
}
```

### Cursor

Add in Cursor settings → MCP Servers:

- **Name:** `pm-agent`
- **Type:** `command`
- **Command:** `npx @gida-concept/pm-agent-mcp-server`

### VS Code

With the [MCP extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-mcp) installed, add to your VS Code settings (`settings.json`):

```json
{
  "mcp.servers": {
    "pm-agent": {
      "command": "npx",
      "args": ["@gida-concept/pm-agent-mcp-server"]
    }
  }
}
```

### Zed

Add to `~/.config/zed/settings.json`:

```json
{
  "mcp": {
    "pm-agent": {
      "command": "npx",
      "args": ["@gida-concept/pm-agent-mcp-server"]
    }
  }
}
```

## Environment Variables

| Variable         | Purpose                              |
|------------------|--------------------------------------|
| `PM_AGENT_CONFIG`| Path to `config.toml`                |
| `GITHUB_TOKEN`   | GitHub API token for integration      |
| `LINEAR_API_KEY` | Linear API key for integration        |

## Security

- The MCP server uses stdio transport only — no network ports are exposed
- API tokens (GitHub, Linear) are read from environment variables, not config files
- Rules enforcement returns `status: "rejected"` in the response body (not MCP errors)
- No postinstall scripts

## Error Handling

Tool calls return structured JSON responses:

```json
{
  "status": "rejected",
  "message": "Cannot close TASK-001: no decision logged. Run `pm log` first.",
  "rule": "decision-before-close"
}
```

Configuration errors return `-32603` (Internal Error) with a descriptive message.

## License

MIT
