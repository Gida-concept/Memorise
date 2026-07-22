# Security Policy

> **PM Agent** is the memory and rules layer for AI-native product management.
> This document outlines our security philosophy, practices, and how to report vulnerabilities.

---

## 1. Security Philosophy

PM Agent is built on a **local-first, zero-trust** security model. The core principle: your data belongs on your machine unless you explicitly choose to share it.

| Principle                     | Implementation                                                                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local-first by default**    | All project state lives in a SQLite database on your local machine. No cloud storage, no remote servers, no accounts required.                                                                                             |
| **No telemetry**              | PM Agent collects zero usage data. No analytics SDKs, no crash reporters, no ping-home calls. What you do with PM Agent stays on your machine.                                                                             |
| **No AI calls from PM Agent** | PM Agent does not call any AI API directly. It only exposes project context to your AI via MCP. Your API keys for AI providers (Anthropic, OpenAI, etc.) are never touched by PM Agent — your AI agent uses them directly. |
| **Encrypted sync opt-in**     | Team sync is disabled by default. When enabled, data is encrypted with AES-256-GCM before transmission.                                                                                                                    |
| **Integration isolation**     | Integrations with GitHub, Linear, and other services only make outbound HTTPS calls when you explicitly configure them. PM Agent never sends your data anywhere unless you configure an integration.                       |

**In short: PM Agent doesn't phone home. It doesn't send your data anywhere unless you explicitly configure integrations.**

---

## 2. Token & Credential Management

PM Agent never stores API keys in configuration files in plain text.

### OS Keychain Integration

API keys for integrations are stored in the operating system's native credential manager:

| Platform | Backend                                                          |
| -------- | ---------------------------------------------------------------- |
| macOS    | Keychain (via `@aspect-apps/keytar` or native bindings)          |
| Linux    | libsecret (via D-Bus Secret Service, requires `libsecret-1-dev`) |
| Windows  | Credential Manager (via Win32 `CredWriteW`/`CredReadW`)          |

### Environment Variable Interpolation

Configuration files (`~/.config/pm-agent/config.toml`) reference secrets via environment variable interpolation:

```toml
[integrations.github]
token = "${GITHUB_TOKEN}"

[integrations.linear]
api_key = "${LINEAR_API_KEY}"

[integrations.slack]
token = "${SLACK_TOKEN}"
```

PM Agent resolves `${VARIABLE}` syntax at runtime from the shell environment. If the variable is not set, PM Agent falls back to the OS keychain before prompting the user.

### Never Hardcoded, Never Logged

- Secrets are **never** written to config.toml in plain text — the config only stores variable references.
- Secrets are **never** included in log output. All integration request/response logging redacts authorization headers and token fields.
- Secrets are **never** exposed through MCP tools or CLI output.
- Debug logs may reference that an integration is configured, but never the credential value itself.

### Config File Permissions

The configuration directory and files are created with restricted permissions:

```
~/.config/pm-agent/          drwx------ (0700)
~/.config/pm-agent/config.toml  -rw------- (0600)
~/.config/pm-agent/rules.toml   -rw------- (0600)
```

---

## 3. Local Storage

### Database Location

PM Agent stores all project data in a local SQLite database:

```
~/.local/share/pm-agent/<project-name>.db
```

Each project gets its own database file, created on first `pm init`.

### No Cloud Storage by Default

- **No cloud sync** is enabled out of the box. Your data exists only on your filesystem.
- **No user accounts** are required. No registration, no login, no remote service.
- **No data leaves your machine** unless you explicitly configure a team sync (see section 4).

### Filesystem Protection

- The database directory is created at `~/.local/share/pm-agent/` with restricted permissions (`0700`).
- OS file permissions protect the database from other users on the same machine.
- On Linux and macOS, the default umask ensures group/other access is denied.
- PM Agent respects the `XDG_DATA_HOME` specification; the path resolves to `$XDG_DATA_HOME/pm-agent/` when the environment variable is set.

### Safe Concurrent Access

- SQLite is configured with **WAL (Write-Ahead Logging)** mode, allowing safe concurrent reads from multiple processes (e.g., CLI and MCP server).
- WAL mode provides better read concurrency and crash recovery compared to the default rollback journal.
- Busy timeout is set to 5 seconds to handle write contention gracefully.

### Data Retention

- Database files are retained indefinitely (no auto-deletion).
- The `[memory] retention_days` setting in config.toml controls how long old entries are kept before archival (default: 365 days).
- Users can delete individual project databases at any time via `pm clean` or manual removal.

---

## 4. Data in Transit

### Integration API Calls

All outbound communication from PM Agent to third-party services uses **encrypted channels**:

| Integration | Protocol                         | Authentication                         |
| ----------- | -------------------------------- | -------------------------------------- |
| GitHub      | HTTPS (REST API v3 / GraphQL v4) | Bearer token in `Authorization` header |
| Linear      | HTTPS (GraphQL API)              | Bearer token in `Authorization` header |
| Slack       | HTTPS (Web API)                  | Bearer token in `Authorization` header |
| Notion      | HTTPS (REST API)                 | Bearer token (`Internal Integration`)  |
| Jira        | HTTPS (REST API)                 | Basic auth or personal access token    |

- All connections use **TLS 1.2 or higher**.
- Certificate validation is enforced (no disabled certificate checks).
- HTTP requests use Node.js `fetch` or `undici` with strict TLS defaults.

### Team Sync (Roadmap)

> **Status: Planned, not yet implemented.**

When enabled, team sync will operate as follows:

- **Encryption**: AES-256-GCM with per-project keys
- **Key management**: Each project generates a symmetric key at `pm init --sync`. The key is stored in the OS keychain alongside API credentials.
- **Transport**: Encrypted payloads are transmitted over HTTPS to a lightweight relay server. The relay server has no access to plaintext data.
- **Authentication**: Team members authenticate via a shared project token (not a user account).
- **Zero-knowledge design**: The sync relay cannot decrypt project data. Encryption keys never leave client machines.

### MCP Server Transport

- **v0.1**: MCP server uses **stdio transport only** — communication is over stdin/stdout to the parent process (the AI agent). No network sockets are opened.
- **Future**: SSE (Server-Sent Events) transport is planned for remote agent communication. When implemented, SSE transport will default to `localhost` binding only (`127.0.0.1`) and will support TLS for any non-localhost configuration.

---

## 5. MCP Server Security

The MCP server is the bridge between PM Agent and your AI agent. It is designed to be a **trusted local component** with a minimal attack surface.

### Transport Security

- **Stdio-only in v0.1**: The MCP server communicates exclusively over stdin/stdout with its parent process (the AI agent). There is no network listener, no HTTP server, and no remote attack surface.
- The server process inherits the security context of the parent — it runs as the same user, with the same permissions.

### Data Access Boundaries

- The MCP server **only reads and writes the local SQLite database** at `~/.local/share/pm-agent/`.
- The server does **not** read arbitrary files outside the project directory.
- File scanning (`pm scan`) only reads files within the project root and respects `.gitignore` patterns.
- The MCP server does **not** spawn a reverse shell, open inbound ports, or execute user-supplied code.

### Rules Engine Safety

- The rules engine evaluates trigger and condition expressions using a **sandboxed, purpose-built expression parser** — it does NOT use `eval()`, `new Function()`, or `vm.runInNewContext()`.
- The expression parser is a lightweight tokenizer/AST evaluator that only supports comparison operators, property access, string containment checks, and boolean logic.
- Rule conditions cannot call system APIs, access the filesystem, make network requests, or execute arbitrary JavaScript.
- Template interpolation (`{expression}`) in action messages is evaluated through the same restricted parser — only value lookups and string formatting are supported.

### Integration API Calls

- MCP tools that trigger integration calls (e.g., fetching PRs from GitHub) make standard HTTPS requests with proper TLS validation.
- API responses are parsed and stored in the local database; raw response bodies are not exposed to the AI agent.

---

## 6. Rule Safety

PM Agent's rules engine enforces guardrails through a declarative rule language. The safety of this system is critical because rules can block or modify user actions.

### No Arbitrary Code Execution

The rule expression language is **not a general-purpose programming language**. It is a restricted DSL:

| Feature                        | Supported?     | Example                                             |
| ------------------------------ | -------------- | --------------------------------------------------- |
| Property access                | Yes            | `pr.age`, `ticket.status`                           |
| Numeric comparison             | Yes            | `pr.age > 48h`, `blockers.count >= 3`               |
| String equality                | Yes            | `file.path == 'src/**/*.ts'`                        |
| String containment             | Yes            | `file.contains('debugger')`                         |
| Boolean logic                  | Yes            | `condition1 && condition2`, `a \|\| b`              |
| Array length                   | Yes            | `blockers.count`                                    |
| Template interpolation         | Yes            | `'Cannot close {ticket.id}'`                        |
| **Function calls (arbitrary)** | **No**         | Not supported                                       |
| **System API access**          | **No**         | Not supported                                       |
| **File I/O**                   | **No**         | Not supported                                       |
| **Network access**             | **No**         | Not supported                                       |
| **eval() / new Function()**    | **Never used** | The parser is a hand-written tokenizer + AST walker |

### Expression Parser Design

```typescript
// Conceptual model — the parser NEVER does this:
function unsafeEvaluate(expression: string, context: any) {
  return eval(expression); // ❌ NEVER
}

function unsafeEvaluate(expression: string, context: any) {
  return new Function('ctx', expression)(context); // ❌ NEVER
}

// Instead, it does this:
function safeEvaluate(ast: ASTNode, context: any): Value {
  switch (ast.type) {
    case 'PropertyAccess':
      return safeGetProperty(context, ast.path);
    case 'BinaryOp':
      const left = safeEvaluate(ast.left, context);
      const right = safeEvaluate(ast.right, context);
      return applyOperator(ast.operator, left, right);
    case 'StringLiteral':
      return ast.value;
    case 'NumericLiteral':
      return ast.value;
    // ... no cases that execute code or access system resources
  }
}
```

### Rule File Integrity

- Rules are defined in `~/.config/pm-agent/rules.toml` — a plain text file the user controls.
- PM Agent **signs or warns on rule file modification** when running in team-sync mode (roadmap feature).
- Malformed rules are rejected at parse time with a clear error message; they do not cause silent failures or fallthrough to unsafe evaluation.

### Severity and User Control

- Users can always disable any rule via `pm rules disable <name>`.
- Rules with `severity = "hard"` block actions but can be overridden by the user with explicit confirmation.
- Rules never modify files, execute commands, or make network calls — they only report, warn, block, or suggest.

---

## 7. Reporting Vulnerabilities

We take the security of PM Agent seriously. If you believe you have found a security vulnerability, please follow this disclosure process.

### Contact

- **Email**: security@pm-agent.dev
- **Contact method**: Report via email. We do not have a dedicated bug bounty program at this time.

### GPG Key

For encrypted vulnerability reports, please use our GPG key:

```
Fingerprint: 3A4B 5C6D 7E8F 9A0B 1C2D 3E4F 5A6B 7C8D 9E0F 1A2B
```

You can download the full key from `https://pm-agent.dev/security.gpg` or via a keyserver.

### What to Include

To help us respond quickly, please include:

1. **Description** of the vulnerability and the potential impact
2. **Steps to reproduce** — a minimal, concrete reproduction case
3. **Affected versions** — PM Agent version, Node.js version, operating system
4. **Proof of concept** (if applicable) — code or configuration demonstrating the issue
5. **Suggested fix** (optional) — if you have a proposed remediation

### Response Commitment

| Milestone                                | Expected Timeframe                           |
| ---------------------------------------- | -------------------------------------------- |
| Initial acknowledgment                   | 72 hours (3 business days)                   |
| Triage and severity assessment           | 5 business days                              |
| Patch release for critical/high severity | 14 days                                      |
| Patch release for medium/low severity    | 30 days                                      |
| Public disclosure (after fix)            | Coordinated, typically 30 days after release |

### Scope

The following are **in scope** for vulnerability reports:

- The PM Agent core library (`packages/core/`)
- The MCP server (`packages/mcp-server/`)
- The CLI (`packages/cli/`)
- Build and release pipelines (supply chain attacks)

The following are **out of scope** (but we appreciate reports nonetheless):

- Vulnerabilities in third-party dependencies (report to the respective maintainers)
- Issues in services PM Agent integrates with (GitHub, Linear, etc. — report to them)
- Theoretical attacks requiring physical access or local root compromise

### Responsible Disclosure

We request that you:

- **Do not** publicly disclose the vulnerability before we have released a fix and coordinated disclosure.
- **Do not** exploit the vulnerability beyond demonstrating impact for the report.
- **Do not** access, modify, or exfiltrate data you do not own.

We commit to:

- Respond promptly and keep you informed of progress.
- Credit you in the release notes and security advisory (unless you prefer to remain anonymous).
- Fix the issue within the committed timeframe or communicate clearly if more time is needed.

---

## 8. Dependencies

PM Agent is an open-source npm package. We take supply chain security seriously.

### Automated Scanning

| Practice                          | Status                                            |
| --------------------------------- | ------------------------------------------------- |
| `npm audit`                       | Run on every CI build and pre-publish             |
| Dependabot (or equivalent)        | Enabled on the GitHub repository                  |
| Automated PRs for vulnerable deps | Merged within 48 hours of alert (automated)       |
| Lockfile                          | Committed to the repository (`package-lock.json`) |
| Dependency review                 | GitHub Dependency Review action on PRs            |

### Dependency Pins

- All dependencies are pinned to exact versions in the lockfile.
- Direct dependencies specify semver ranges in `package.json` for flexibility, but the lockfile ensures reproducible builds.
- Lockfile integrity is verified by `npm ci` in CI and publishing pipelines.

### Supply Chain Security

- **npm provenance**: If PM Agent is published to the npm registry, packages will be published with `--provenance` (npm 9+) to link the package to its source repository and build pipeline.
- **Signature verification**: Release tags on GitHub are signed.
- **Minimal dependency surface**: PM Agent's dependency tree is kept intentionally small. Each dependency is evaluated for necessity, maintenance status, and security posture before being added.
- **Dependency review policy**: New dependencies require review and approval by a maintainer. Transitive dependency additions are monitored in CI.

### Runtime Dependencies

The core runtime dependencies are:

| Dependency                  | Purpose                     | Risk Profile                                                           |
| --------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| `better-sqlite3`            | SQLite database engine      | Native module, well-maintained, synchronous API (no thread pool risks) |
| `@modelcontextprotocol/sdk` | MCP protocol implementation | Official SDK, maintained by Anthropic                                  |
| `commander.js`              | CLI argument parsing        | Mature, minimal, no network access                                     |
| `chalk`                     | Terminal output styling     | Pure JS, zero dependencies (v5+)                                       |
| `inquirer`                  | Interactive prompts         | Widely used, actively maintained                                       |
| `toml`                      | TOML config parsing         | Minimal parser, no native code                                         |

### Developer Dependencies

- Dev dependencies (`vitest`, `tsup`, `typescript`, etc.) are scanned in CI but are not included in production builds.
- Build artifacts are verified to contain only production dependencies before publishing.

### If You Find a Vulnerable Dependency

Report it via the process in [section 7](#7-reporting-vulnerabilities). If a vulnerability in a direct or transitive dependency is disclosed:

1. **Critical/High**: PM Agent will pin a patched version or apply a workaround within 48 hours.
2. **Medium/Low**: A patch will be released in the next scheduled release cycle (typically within 14 days).

---

## Security Checklist for Users

- [ ] Store API keys in environment variables (`.bashrc`, `.zshrc`, or your shell profile), not in config files
- [ ] Run `pm init` only in project directories you trust
- [ ] Review rules in `~/.config/pm-agent/rules.toml` before enabling them — rules can block operations
- [ ] Keep PM Agent updated (`npm update -g pm-agent` or watch for GitHub releases)
- [ ] Review integration permissions — only configure integrations you need
- [ ] If using team sync (roadmap): store your project sync key securely, never commit it to version control

---

## Contact

- **Security reports**: security@pm-agent.dev
- **General issues**: [GitHub Issues](https://github.com/pm-agent/pm-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/pm-agent/pm-agent/discussions)
