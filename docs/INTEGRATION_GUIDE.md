# PM Agent Integration Guide

Connect the PM Agent's MCP server and CLI to your AI coding environment. Below you'll find config examples for **18 platforms** that support the Model Context Protocol (MCP).

---

## Common Setup

The PM Agent's MCP server (`@pm-agent/mcp-server`) runs as a local stdio process. Install it once:

```bash
npm install -g @pm-agent/mcp-server
# or via npx (no install needed):
npx @pm-agent/mcp-server
```

When used as an MCP server, it exposes **18 tools** covering blocker tracking, decision records, task management, sprint scope, notes, dependency graphs, impact analysis, and rules enforcement.

---

## By Platform

### 1. Claude Code

**Config files:**
- Project scope: `.mcp.json` in project root (checked into repo)
- User scope: `~/.claude.json` or `~/.claude/mcp.json`

**CLI setup (recommended):**
```bash
cd your-project
claude mcp add pm-agent -e npx -- @pm-agent/mcp-server
```

**Manual JSON — `.mcp.json`:**
```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "env": {}
    }
  }
}
```

**Transport options:** stdio, HTTP, SSE, WebSocket  
**Scopes:** local (`.mcp.json`), project (`~/.claude/mcp.json`), user (`~/.claude.json`)  
**Reconnection:** auto-reconnects on process exit  
**Source:** [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)

---

### 2. Cursor

**Config files:**
- Project scope: `.cursor/mcp.json` (in project root)
- Global scope: `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "env": {}
    }
  }
}
```

**Env file support:**
```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "envFile": ".env"
    }
  }
}
```

**Variable interpolation** (supported in `command`, `args`, `env`, `url`, `headers`):

| Syntax | Resolves to |
|--------|-------------|
| `${env:NAME}` | Environment variable |
| `${userHome}` | Home folder |
| `${workspaceFolder}` | Project root |
| `${pathSeparator}` | OS path separator |

**Remote/HTTP servers:** use `url` + `headers` + optional `auth` (OAuth) instead of `command`.  
**Source:** [Cursor MCP docs](https://cursor.com/docs/mcp)

---

### 3. OpenCode

**Config file:** `opencode.json` or `opencode.jsonc` (in project root)

```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "local",
      "command": ["npx", "@pm-agent/mcp-server"],
      "enabled": true
    }
  }
}
```

**With environment variables:**
```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "local",
      "command": ["npx", "@pm-agent/mcp-server"],
      "enabled": true,
      "cwd": ".",
      "timeout": 30000,
      "env": {
        "PM_AGENT_CONFIG": "./pm-agent.toml"
      }
    }
  }
}
```

**Remote server:**
```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "remote",
      "url": "https://your-server.com/mcp"
    }
  }
}
```

**Source:** [OpenCode MCP docs](https://opencode.ai/docs/mcp-servers)

---

### 4. GitHub Copilot CLI

**Config file:** `~/.copilot/mcp-config.json`

```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "local",
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "env": {},
      "tools": ["*"]
    }
  }
}
```

**Remote HTTP server:**
```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "http",
      "url": "https://your-server.com/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      },
      "tools": ["*"]
    }
  }
}
```

The `tools` field limits which tools are exposed; `["*"]` means all tools. When omitted, defaults to `["*"]`.  
**Source:** [GitHub Copilot MCP docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)

---

### 5. Zed Editor

**Config file:** `settings.json`
- macOS/Linux: `~/.config/zed/settings.json`
- Windows: `%APPDATA%\Zed\settings.json`

```json
{
  "context_servers": {
    "pm-agent": {
      "source": "custom",
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "env": {}
    }
  }
}
```

> ⚠️ The `"source": "custom"` field is **required** — Zed treats entries without it as malformed and silently skips them.

**Tool permissions** (optional — controls auto-approval):
```json
{
  "tool_permissions": {
    "mcp:pm-agent:list_blockers": "allow",
    "mcp:pm-agent:log_decision": "confirm"
  }
}
```

Values: `"allow"` (no prompt), `"confirm"` (ask each time).  
**Source:** [Zed MCP docs](https://zed.dev/docs/ai/mcp)

---

### 6. Cline (VS Code Extension)

**Config file:** `~/.cline/mcp.json`

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "env": {},
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Remote (Streamable HTTP):**
```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "streamableHttp",
      "url": "https://your-server.com/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `command` | Executable for stdio servers |
| `args` | Arguments for command |
| `url` | Endpoint for remote servers |
| `type` | Transport: `"streamableHttp"`, `"sse"`, or omit (stdio) |
| `headers` | HTTP headers for remote servers |
| `env` | Environment variables for local servers |
| `disabled` | Toggle on/off without deleting (`false` = enabled) |
| `autoApprove` | Tools to auto-run without user approval |

**CLI management:** `cline mcp` (interactive wizard)  
**Source:** [Cline MCP docs](https://docs.cline.bot/mcp/mcp-overview)

---

### 7. Continue.dev

**Config file:** `config.yaml` in your Continue config directory

**Inline configuration:**
```yaml
mcpServers:
  - name: PM Agent
    command: npx
    args:
      - "@pm-agent/mcp-server"
```

**Standalone file:** `.continue/mcpServers/pm-agent.yaml`
```yaml
name: PM Agent mcpServer
version: 0.1.0
schema: v1
mcpServers:
  - name: PM Agent
    command: npx
    args:
      - "@pm-agent/mcp-server"
```

**With secrets/env vars:**
```yaml
mcpServers:
  - name: PM Agent
    command: npx
    args:
      - "@pm-agent/mcp-server"
    env:
      PM_AGENT_CONFIG: ${{ secrets.PM_AGENT_CONFIG }}
```

**SSE / Streamable HTTP:**
```yaml
mcpServers:
  - name: PM Agent
    type: streamable-http
    url: https://your-server.com/mcp
```

> 💡 Continue also supports importing configs from Claude Desktop, Cursor, or Cline JSON files directly into `.continue/mcpServers/`.

**Source:** [Continue MCP docs](https://docs.continue.dev/customize/deep-dives/mcp)

---

### 8. Windsurf

**Config file:** `~/.codeium/windsurf/mcp_config.json`
- macOS/Linux: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "env": {}
    }
  }
}
```

**Remote server:**
```json
{
  "mcpServers": {
    "pm-agent": {
      "url": "https://your-server.com/mcp"
    }
  }
}
```

> ⚠️ Windsurf uses the **same format as Claude Desktop** (`claude_desktop_config.json`). If you already have a Cursor or Claude working config, the `mcpServers` block can be copied directly. A **full restart** of Windsurf is required after changes.

**Source:** [Windsurf MCP guide](https://webmcpguide.com/articles/windsurf-mcp-server-setup-2026)

---

### 9. Goose

**Configuration:** UI-based (no config file)

1. Open Goose → **Settings > MCP Servers**
2. Click **Add Server**
3. For local: enter `npx @pm-agent/mcp-server` as the URL, select **stdio** transport
4. For remote: enter `https://your-server.com/mcp`, select **HTTP** transport

Supported transports: HTTP, SSE, stdio. Goose auto-discovers available tools.

**Source:** [Goose MCP docs](https://docs.gooseworks.ai/concepts/mcp-servers)

---

### 10. VS Code (Native)

**Config file:** `.vscode/mcp.json` (workspace)

```json
{
  "servers": {
    "pm-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "env": {}
    }
  }
}
```

**Alternative — in VS Code `settings.json`:**
```json
{
  "mcp.servers": {
    "pm-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["@pm-agent/mcp-server"]
    }
  }
}
```

**Source:** [VS Code MCP config reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)

---

### 11. Kilo Code

**Config files:**
- Global: `~/.config/kilo/kilo.json` or `~/.config/kilo/kilo.jsonc`
- Project: `kilo.json` / `kilo.jsonc`, or `.kilo/kilo.json` / `.kilo/kilo.jsonc`

Project-level config takes precedence over global.

> ⚠️ Note the key: Kilo Code uses `"mcp"` (singular), **not** `"mcpServers"`.

```json
{
  "mcp": {
    "pm-agent": {
      "type": "local",
      "command": ["npx", "@pm-agent/mcp-server"],
      "environment": {},
      "enabled": true,
      "timeout": 10000
    }
  }
}
```

**Remote server:**
```json
{
  "mcp": {
    "pm-agent": {
      "type": "remote",
      "url": "https://your-server.com/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      },
      "enabled": true,
      "timeout": 15000
    }
  }
}
```

**Auto-approval (top-level `permission` key):**
```json
{
  "mcp": {
    "pm-agent": {
      "type": "local",
      "command": ["npx", "@pm-agent/mcp-server"]
    }
  },
  "permission": {
    "pm_agent_*": "allow"
  }
}
```

| Field | Type | Details |
|-------|------|---------|
| `type` | string | Required — `"local"` or `"remote"` |
| `command` | string[] | Required for local — executable + args (array form) |
| `url` | string | Required for remote — HTTP/HTTPS endpoint |
| `environment` | object | Optional — env vars (note: `environment`, not `env`) |
| `headers` | object | Optional — HTTP headers for remote servers |
| `enabled` | boolean | Optional — toggle without deleting config |
| `timeout` | number | Optional — connection timeout in ms |
| `oauth` | boolean | Optional — set `false` to disable OAuth 2.0 flow |

Also supports `{env:VARIABLE_NAME}` syntax to reference environment variables in config values.  
**Source:** [Kilo Code MCP docs](https://kilo.ai/docs/automate/mcp/using-in-kilo-code)

---

### 12. Android Studio (Gemini)

**Config file:** Configured via **File > Settings > Tools > AI > MCP Servers**.  
Enable the toggle and paste JSON in the provided field.

Persisted in Android Studio's internal `mcp.json` within the config directory.

Android Studio supports **Streamable HTTP** and **SSE** transports only — **no stdio support**.

```json
{
  "mcpServers": {
    "pm-agent": {
      "httpUrl": "https://your-server.com/mcp",
      "headers": {
        "Authorization": "Bearer your-token-here"
      },
      "timeout": 30000,
      "enabled": true
    }
  }
}
```

**SSE endpoint (uses `url` instead of `httpUrl`):**
```json
{
  "mcpServers": {
    "pm-agent": {
      "url": "https://your-server.com/mcp/sse",
      "headers": {
        "Authorization": "Bearer your-token"
      }
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `httpUrl` | string | Yes (Streamable HTTP) | Full URL of the streaming HTTP endpoint |
| `url` | string | Yes (SSE) | SSE endpoint URL (typically with `/sse` path) |
| `headers` | object | No | Custom HTTP headers |
| `timeout` | number | No | Connection timeout in ms; `-1` = no timeout |
| `enabled` | boolean | No | Whether the server is active; defaults to `true` |

> ⚠️ Since there's no stdio, you need to either run the PM Agent as a remote HTTP server or use a relay. Use `/mcp` in Gemini chat to see available tools.

**Source:** [Android Studio MCP docs](https://developer.android.com/studio/gemini/add-mcp-server)

---

### 13. JetBrains AI Assistant (IntelliJ, PyCharm, WebStorm, etc.)

**Configuration:** Via **Settings > Tools > AI Assistant > Model Context Protocol**.

The IDE persists settings internally — there's no standalone config file. A JSON snippet is entered in the settings UI.

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["@pm-agent/mcp-server"]
    }
  }
}
```

**Remote / Streamable HTTP:**
```json
{
  "mcpServers": {
    "pm-agent": {
      "url": "https://your-server.com/mcp"
    }
  }
}
```

**Docker-based:**
```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "node:20", "npx", "@pm-agent/mcp-server"
      ]
    }
  }
}
```

| Setting | How to set |
|---------|-----------|
| JSON config | Pasted in the settings UI |
| Working directory | Separate field in the UI (not in JSON) |
| Server level | `Global` or `Project`-only — selected in the UI |

**Import from Claude Desktop:** JetBrains can import Claude Desktop's existing config directly.  
**Source:** [JetBrains AI Assistant MCP docs](https://www.jetbrains.com/help/ai-assistant/mcp.html)

---

### 14. Gemini CLI

**Config files:**
- User: `~/.gemini/settings.json`
- Project: `.gemini/settings.json`

Gemini CLI has one of the richest MCP config formats with per-server trust, tool allow/denylist, OAuth, and IAP support.

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "env": {},
      "timeout": 600000,
      "trust": false
    }
  }
}
```

**Remote (Streamable HTTP) with auth:**
```json
{
  "mcpServers": {
    "pm-agent": {
      "httpUrl": "https://your-server.com/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      },
      "timeout": 30000
    }
  }
}
```

**With tool filtering and trust:**
```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "trust": true,
      "includeTools": ["pm_get_blockers", "pm_get_decisions", "pm_log_note"],
      "timeout": 30000
    }
  }
}
```

**Global MCP rules (to allowed/exclude specific servers):**
```json
{
  "mcp": {
    "allowed": ["pm-agent"],
    "excluded": ["experimental-server"]
  },
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["@pm-agent/mcp-server"]
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Executable for stdio |
| `args` | string[] | CLI arguments |
| `url` / `httpUrl` | string | SSE (`url`) or Streamable HTTP (`httpUrl`) endpoint |
| `env` | object | Environment variables (`$VAR` or `${VAR}` syntax) |
| `headers` | object | HTTP headers |
| `cwd` | string | Working directory for stdio |
| `timeout` | number | Request timeout in ms (default: 600000 = 10 min) |
| `trust` | boolean | `true` bypasses all tool call confirmations |
| `includeTools` | string[] | Allowlist of tool names |
| `excludeTools` | string[] | Denylist (takes precedence over include) |
| `mcp.allowed` | string[] | Global — only these servers are connected |
| `mcp.excluded` | string[] | Global — servers in this list are skipped |

**CLI commands:** `gemini mcp add`, `gemini mcp list`, `gemini mcp remove`  
**Source:** [Gemini CLI MCP docs](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html)

---

### 15. OpenAI Codex CLI

**Config file:** `config.toml` in your Codex project

Codex CLI uses TOML (not JSON) with a `[mcp_servers]` table. Each server has its own `[mcp_servers.<name>]` section with a `[transport]` sub-table.

```toml
[mcp_servers.pm-agent]
enabled = true
required = false
supports_parallel_tool_calls = true
default_tools_approval_mode = "auto"
startup_timeout_sec = 30.0

[mcp_servers.pm-agent.transport]
type = "stdio"
command = "npx"
args = ["-y", "@pm-agent/mcp-server"]
env_vars = ["PATH", "HOME"]
```

**With per-tool approval:**
```toml
[mcp_servers.pm-agent]
enabled = true
supports_parallel_tool_calls = true
default_tools_approval_mode = "prompt"

[mcp_servers.pm-agent.transport]
type = "stdio"
command = "npx"
args = ["-y", "@pm-agent/mcp-server"]

[mcp_servers.pm-agent.tools.pm_log_decision]
enabled = true
approval_mode = "auto"

[mcp_servers.pm-agent.tools.pm_enforce_rules]
enabled = true
approval_mode = "prompt"
```

**Remote (Streamable HTTP):**
```toml
[mcp_servers.pm-agent]
enabled = true
required = false
default_tools_approval_mode = "prompt"

[mcp_servers.pm-agent.transport]
type = "streamable-http"
url = "https://your-server.com/mcp"
bearer_token_env_var = "PM_AGENT_TOKEN"
http_headers = { "X-Custom-Header" = "value" }
```

**Minimal server entry (one-liner):**
```toml
[mcp_servers.pm-agent]
transport = { type = "stdio", command = "npx", args = ["@pm-agent/mcp-server"] }
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether the server is active |
| `required` | boolean | If `true`, session fails if server can't start |
| `supports_parallel_tool_calls` | boolean | Enables concurrent tool execution |
| `default_tools_approval_mode` | string | `"auto"`, `"prompt"`, or `"approve"` |
| `startup_timeout_sec` | number | Custom server initialization timeout |
| `transport.type` | string | `"stdio"` or `"streamable-http"` |
| `transport.command` | string | Executable (stdio) |
| `transport.args` | string[] | Arguments (stdio) |
| `transport.env_vars` | string[] | Env var names to pass through (stdio) |
| `transport.url` | string | Remote endpoint (streamable-http) |
| `transport.bearer_token_env_var` | string | Env var name for bearer token (streamable-http) |

**Source:** [Codex CLI MCP config](https://deepwiki.com/openai/codex/6.1-mcp-server-configuration)

---

### 16. Roo Code

**Config files:**
- Global: `mcp_settings.json` (via VS Code settings UI)
- Project: `.roo/mcp.json` (in project root, shareable)

Project-level config takes precedence over global.

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": ["@pm-agent/mcp-server"],
      "cwd": ".",
      "env": {},
      "alwaysAllow": [],
      "disabled": false,
      "timeout": 60
    }
  }
}
```

**Remote (Streamable HTTP):**
```json
{
  "mcpServers": {
    "pm-agent": {
      "type": "streamable-http",
      "url": "https://your-server.com/mcp",
      "headers": {
        "X-API-Key": "your-key"
      },
      "alwaysAllow": ["pm_get_blockers", "pm_get_decisions"],
      "disabled": false,
      "timeout": 60
    }
  }
}
```

| Field | Transport | Description |
|-------|-----------|-------------|
| `command` | STDIO | Executable to run |
| `args` | STDIO | Array of string arguments; supports `${env:VAR}` |
| `cwd` | STDIO | Working directory for the server process |
| `env` | STDIO | Environment variables object |
| `type` | HTTP/SSE | `"streamable-http"` or `"sse"` |
| `url` | HTTP/SSE | Remote endpoint URL |
| `headers` | HTTP/SSE | Custom HTTP headers |
| `alwaysAllow` | All | Tools to auto-approve |
| `disabled` | All | Boolean toggle |
| `timeout` | All | Per-server timeout in seconds (1–3600; default 60) |
| `watchPaths` | STDIO | File paths; changes trigger server restart |
| `disabledTools` | All | Tool names to disable from this server |

**Windows-specific (uses `cmd /c`):**
```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "cmd",
      "args": ["/c", "npx", "@pm-agent/mcp-server"]
    }
  }
}
```

**Source:** [Roo Code MCP docs](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo/)

---

### 17. CodeGPT Desktop

**Config file:** `mcp.json` (accessed via **Settings > MCP Configuration > Open MCP Config File**)

```json
{
  "mcpServers": {
    "pm-agent": {
      "command": "npx",
      "args": [
        "@pm-agent/mcp-server"
      ]
    }
  }
}
```

After saving, click **Refresh Server Connections** in the MCP Configuration tab. Then select which tools to enable for AI models.

**Source:** [CodeGPT MCP docs](https://docs.codegpt.co/docs/tutorial-features/mcp)

---

### 18. Visual Studio 2022+ (Windows)

**Config files** (discovered automatically in this order):

| Priority | File | Scope |
|----------|------|-------|
| 1 (highest) | `%USERPROFILE%\.mcp.json` | Global (all solutions) |
| 2 | `<SOLUTIONDIR>\.vs\mcp.json` | Solution-local, user-specific |
| 3 | `<SOLUTIONDIR>\.mcp.json` | Solution-local, source-controlled |
| 4 | `<SOLUTIONDIR>\.vscode\mcp.json` | Interop with VS Code |
| 5 | `<SOLUTIONDIR>\.cursor\mcp.json` | Interop with Cursor |

> ⚠️ Visual Studio uses `"servers"` (the VS Code `settings.json` key), **not** `"mcpServers"`.

**Remote server (Streamable HTTP or SSE):**
```json
{
  "servers": {
    "pm-agent": {
      "url": "https://your-server.com/mcp"
    }
  }
}
```

**Local server (stdio):**
```json
{
  "servers": {
    "pm-agent": {
      "command": "npx",
      "args": ["@pm-agent/mcp-server"]
    }
  }
}
```

**With auth:**
```json
{
  "servers": {
    "pm-agent": {
      "url": "https://api.githubcopilot.com/mcp/"
    }
  }
}
```

Visual Studio also supports **one-click install** from the GitHub MCP Server Registry (**Extensions > MCP Registries...**), adding servers from chat via **Agent mode > Tools > `+`**, and OAuth authentication via CodeLens.

**Source:** [Visual Studio MCP docs](https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers?view=visualstudio)

---

## Quick Reference

| # | Platform | Config File | Key Field | Transport |
|---|----------|------------|-----------|-----------|
| 1 | **Claude Code** | `.mcp.json` / `~/.claude.json` | `mcpServers` | stdio, HTTP, SSE, WS |
| 2 | **Cursor** | `.cursor/mcp.json` | `mcpServers` | stdio, SSE, Streamable HTTP |
| 3 | **OpenCode** | `opencode.json` | `mcpServers` | local, remote |
| 4 | **GitHub Copilot CLI** | `~/.copilot/mcp-config.json` | `mcpServers` | local, http |
| 5 | **Zed** | `settings.json` | `context_servers` | stdio (via `command`) |
| 6 | **Cline** | `~/.cline/mcp.json` | `mcpServers` | stdio, SSE, Streamable HTTP |
| 7 | **Continue.dev** | `config.yaml` / `.continue/mcpServers/` | `mcpServers` | stdio, SSE, streamable-http |
| 8 | **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | stdio, HTTP/SSE |
| 9 | **Goose** | UI only | — | stdio, HTTP, SSE |
| 10 | **VS Code** | `.vscode/mcp.json` / `settings.json` | `servers` / `mcp.servers` | stdio |
| 11 | **Kilo Code** | `kilo.json` / `.kilo/kilo.json` | `mcp` (singular!) | local, remote |
| 12 | **Android Studio** | Settings UI → `mcp.json` | `mcpServers` | Streamable HTTP, SSE only |
| 13 | **JetBrains IDEs** | Settings UI (JSON snippet) | `mcpServers` | stdio, HTTP, SSE |
| 14 | **Gemini CLI** | `~/.gemini/settings.json` | `mcpServers` | stdio, SSE, Streamable HTTP |
| 15 | **OpenAI Codex CLI** | `config.toml` | `[mcp_servers]` | stdio, streamable-http |
| 16 | **Roo Code** | `.roo/mcp.json` / `mcp_settings.json` | `mcpServers` | stdio, SSE, Streamable HTTP |
| 17 | **CodeGPT Desktop** | `mcp.json` | `mcpServers` | stdio |
| 18 | **Visual Studio** | `.mcp.json` | `servers` | URL-based / stdio |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PM_AGENT_DATA_DIR` | Override the data directory (default: `~/.pm-agent`) |
| `PM_AGENT_CONFIG` | Path to a custom config TOML file |
| `NODE_OPTIONS` | Standard Node.js options (e.g., `--max-old-space-size`) |
| `DEBUG` | Set to `pm-agent:*` for debug logging |

## Verifying the Connection

```bash
# Claude Code
claude mcp list

# Cursor
# Open Cursor → Settings → Features → MCP → check "pm-agent" is listed

# OpenCode
opencode config mcp

# GitHub Copilot CLI
gh copilot mcp list

# Cline
cline config mcp --json

# Gemini CLI
gemini mcp list

# PM Agent (direct)
npx @pm-agent/mcp-server --help
```

## Remote / Self-Hosted Deployment

For team use, run PM Agent's MCP server as a remote HTTP endpoint:

```bash
npx @pm-agent/mcp-server --port 3100 --host 0.0.0.0
```

Then configure each client's `url` or `httpUrl` field to point to your server. Secure it with an auth proxy or use the `headers` field for bearer tokens (supported by Claude Code, Cursor, Cline, Copilot, Gemini CLI, Android Studio, JetBrains, and others).

---

*Generated for PM Agent v0.1.0 — the config snippets above assume `@pm-agent/mcp-server` is available on npm.*
