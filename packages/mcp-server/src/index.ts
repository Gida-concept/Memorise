#!/usr/bin/env node

import { createRequire } from 'module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
const { version } = createRequire(import.meta.url)('../package.json');

// Tool handlers
import { handleGetContext } from './tools/get-context.js';
import { handleGetBlockers } from './tools/get-blockers.js';
import { handleGetDecisions } from './tools/get-decisions.js';
import { handleGetNotes } from './tools/get-notes.js';
import { handleGetScope } from './tools/get-scope.js';
import { handleGetStandup } from './tools/get-standup.js';
import { handlePrepMeeting } from './tools/prep-meeting.js';
import { handleLogDecision } from './tools/log-decision.js';
import { handleLogNote } from './tools/log-note.js';
import { handleCheckScope } from './tools/check-scope.js';
import { handleAddRule } from './tools/add-rule.js';
import { handleEnforceRules } from './tools/enforce-rules.js';
import { handleScanCodebase } from './tools/scan-codebase.js';
import { handleGetDependencyGraph } from './tools/get-dependency-graph.js';
import { handleAnalyzeImpact } from './tools/analyze-impact.js';
import { handleSearchCodebase } from './tools/search-codebase.js';
import { handleGetArchitecture } from './tools/get-architecture.js';
import { handleGetFileContext } from './tools/get-file-context.js';
import { handleHooksSetup } from './tools/hooks-setup.js';
import { handleEnforceSetup } from './tools/enforce-setup.js';
import { handleUnderstandCodebase } from './tools/understand-codebase.js';
import { autoEnforce } from './tools/auto-enforce.js';

// Tools that are exempt from auto-enforcement (meta-tools)
const AUTO_ENFORCE_SKIP = new Set(['pm_enforce_rules', 'pm_add_rule', 'pm_hooks_setup', 'pm_enforce_setup', 'pm_understand_codebase']);

// Shared result content helper
function textContent(text: string): { type: 'text'; text: string } {
  return { type: 'text', text };
}

// ── Tool definitions ──────────────────────────────────────────────

interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'pm_get_context',
    description: 'Get aggregated project memory context (decisions, blockers, notes, tasks, scope)',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pm_get_blockers',
    description: 'Get active or resolved blockers with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'resolved', 'all'], description: 'Filter by status' },
        min_age: { type: 'string', description: 'Minimum age filter (e.g. 24h, 3d, 30m)' },
        limit: { type: 'number', description: 'Max results' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pm_get_decisions',
    description: 'Get logged decisions (ADRs) with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default: 20)' },
        since: { type: 'string', description: 'ISO date string filter' },
        author: { type: 'string', description: 'Filter by author' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pm_get_notes',
    description: 'Get notes with optional tag or text search',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Filter by tag' },
        search: { type: 'string', description: 'Text search in content' },
        limit: { type: 'number', description: 'Max results' },
        since: { type: 'string', description: 'ISO date string filter' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pm_get_scope',
    description: 'Get latest scope snapshot or history for a sprint',
    inputSchema: {
      type: 'object',
      properties: {
        sprint_name: { type: 'string', description: 'Sprint name (optional, returns latest if omitted)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pm_get_standup',
    description: 'Generate a daily standup summary',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO date lookback (default: 24h ago)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pm_prep_meeting',
    description: 'Prepare a meeting brief with relevant context',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Meeting title' },
        related_tickets: { type: 'array', items: { type: 'string' }, description: 'Related ticket IDs' },
        duration_minutes: { type: 'number', description: 'Meeting duration in minutes' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_log_decision',
    description: 'Log a new decision (ADR) with optional body, author, and links',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Decision title' },
        body: { type: 'string', description: 'Decision body/content' },
        author: { type: 'string', description: 'Who made the decision' },
        links: { type: 'array', items: { type: 'string' }, description: 'Linked entity IDs' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_log_note',
    description: 'Quick capture a note with optional tags and links',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Note content' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        links: { type: 'array', items: { type: 'string' }, description: 'Linked entity IDs' },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_check_scope',
    description: 'Evaluate sprint scope impact with risk assessment and rules enforcement. Risk is based on how much of the committed sprint capacity has been consumed.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Scope change description' },
        committed_days: { type: 'number', description: 'Days this scope item commits to the sprint (required)' },
        remaining_days: { type: 'number', description: 'Days remaining in the sprint. Omit or set equal to committed_days for 0% risk (no consumption)' },
        sprint_name: { type: 'string', description: 'Sprint name (defaults to latest)' },
      },
      required: ['description', 'committed_days'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_add_rule',
    description: 'Add a new rule to the rules file',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Rule name' },
        scope: { type: 'string', enum: ['pm', 'code', 'all'], description: 'Rule scope' },
        trigger: { type: 'string', description: 'Trigger expression' },
        condition: { type: 'string', description: 'Condition expression' },
        action: { type: 'string', description: 'Action string (e.g. "block: \'message\'")' },
        severity: { type: 'string', enum: ['hard', 'soft', 'info'], description: 'Rule severity' },
        description: { type: 'string', description: 'Rule description' },
      },
      required: ['name', 'scope', 'trigger', 'action', 'severity'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_enforce_rules',
    description: 'Evaluate all matching rules against a custom context object',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'object', description: 'Context object for rule evaluation', additionalProperties: true },
        scope: { type: 'string', enum: ['pm', 'code', 'all'], description: 'Rule scope filter' },
      },
      required: ['context'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_scan_codebase',
    description: 'Scan the codebase for file registry, dependencies, and architecture',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['full', 'incremental', 'verify'], description: 'Scan mode' },
        watch: { type: 'boolean', description: 'Enable file watching' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pm_get_dependency_graph',
    description: 'Get dependency graph for a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        depth: { type: 'number', description: 'Traversal depth' },
        reverse: { type: 'boolean', description: 'Only show reverse deps' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_analyze_impact',
    description: 'Analyze impact of changes to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        depth: { type: 'number', description: 'Transitive depth' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_search_codebase',
    description: 'Full-text search across codebase and docs',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        scope: { type: 'string', enum: ['code', 'docs', 'all'], description: 'Search scope' },
        type: { type: 'string', description: 'File type filter' },
        max_results: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_get_architecture',
    description: 'Get architecture overview',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pm_get_file_context',
    description: 'Get context for a specific file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_understand_codebase',
    description: 'Run deep semantic analysis on the codebase: extracts exports, imports, types, purposes, and produces a project-level semantic map with framework detection, module organization, and entry points',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pm_hooks_setup',
    description: '[DEPRECATED: Use pm_enforce_setup instead] Configure PM Agent Claude Code hooks for a project. Writes .claude/settings.local.json with PreToolUse and SessionStart hooks.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Absolute path to the project root' },
      },
      required: ['project_path'],
      additionalProperties: false,
    },
  },
  {
    name: 'pm_enforce_setup',
    description: 'Configure PM Agent enforcement for a project. Installs Claude Code hooks and optionally writes MCP proxy config for other clients (Cursor, Continue, VS Code, Claude Code). Uses .claude/settings.local.json for hooks and client-specific config files for the MCP proxy.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Absolute path to the project root' },
        all_clients: { type: 'boolean', description: 'Auto-configure all detected clients with the MCP enforcement proxy' },
      },
      required: ['project_path'],
      additionalProperties: false,
    },
  },
];

// ── Handler map ──────────────────────────────────────────────────

const HANDLERS: Record<string, (args: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
  pm_get_context: handleGetContext,
  pm_get_blockers: handleGetBlockers,
  pm_get_decisions: handleGetDecisions,
  pm_get_notes: handleGetNotes,
  pm_get_scope: handleGetScope,
  pm_get_standup: handleGetStandup,
  pm_prep_meeting: handlePrepMeeting,
  pm_log_decision: handleLogDecision,
  pm_log_note: handleLogNote,
  pm_check_scope: handleCheckScope,
  pm_add_rule: handleAddRule,
  pm_enforce_rules: handleEnforceRules,
  pm_scan_codebase: handleScanCodebase,
  pm_get_dependency_graph: handleGetDependencyGraph,
  pm_analyze_impact: handleAnalyzeImpact,
  pm_search_codebase: handleSearchCodebase,
  pm_get_architecture: handleGetArchitecture,
  pm_get_file_context: handleGetFileContext,
  pm_hooks_setup: handleHooksSetup,
  pm_enforce_setup: handleEnforceSetup,
  pm_understand_codebase: handleUnderstandCodebase,
};

// ── Server setup ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const server = new Server(
  ({
    name: 'pm-agent-mcp',
    version,
    instructions: `╔══════════════════════════════════════════════════════════════════╗
║  PM Agent — GATEKEEPER MODE ACTIVE                             ║
║  This is NOT optional. You MUST follow the required workflow.   ║
║  The PreToolUse hook WILL BLOCK WRITES if you skip this.       ║
╚══════════════════════════════════════════════════════════════════╝

**MANDATORY WORKFLOW — enforced by gatekeeper:**

You CANNOT write files, run commands, or modify the project
until you call \`pm_get_context\` to load the current project state.

Step 1 — CALL \`pm_get_context\` FIRST (required, non-optional)
Step 2 — Review: decisions, blockers, notes, architecture
Step 3 — Only then make changes. The gatekeeper will allow writes.

After the initial context load, you still MUST:
  • Call \`pm_enforce_rules\` before dangerous operations
  • Log decisions with \`pm_log_decision\`
  • Check blockers with \`pm_get_blockers\`

**Why this is required:**
The PreToolUse gatekeeper hook tracks whether you have called
\`pm_get_context\` this session. If you attempt any write/destructive
tool without it, the hook returns an educational block message.

**Available PM Agent MCP tools:**
  • \`pm_get_context\`      — Full project snapshot (REQUIRED first call)
  • \`pm_get_blockers\`     — Active blockers list
  • \`pm_enforce_rules\`    — Check rules before operations
  • \`pm_check_scope\`      — Sprint impact assessment
  • \`pm_log_decision\`     — Log an ADR
  • \`pm_log_note\`         — Quick capture with tags
  • \`pm_scan_codebase\`    — Re-index project structure
  • \`pm_search_codebase\`  — Full-text search
  • \`pm_get_architecture\` — Entry points, layers, frameworks
  • \`pm_understand_codebase\` — Deep semantic analysis

For the CLI: run \`! pm <command>\` in Bash.

The gatekeeper is enforced at the platform level — you cannot bypass it.`,
  }) as any,
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOL_DEFINITIONS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = HANDLERS[name];
  if (!handler) {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${name}. Available tools: ${Object.keys(HANDLERS).join(', ')}`,
    );
  }

  const rawArgs = (args as Record<string, unknown>) ?? {};

  // Auto-enforce rules before executing the handler (skip meta-tools to avoid loops)
  if (!AUTO_ENFORCE_SKIP.has(name)) {
    const enforcement = autoEnforce(name, rawArgs);
    if (enforcement.blocked) {
      return { content: [textContent(JSON.stringify(enforcement.result, null, 2))] };
    }
  }

  try {
    const result = await handler(rawArgs);
    return { content: [textContent(JSON.stringify(result, null, 2))] };
  } catch (err) {
    if (err instanceof McpError) throw err;
    throw new McpError(ErrorCode.InternalError, `Handler error: ${(err as Error).message}`);
  }
});

// ── Start ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Forward stderr messages for debugging
  console.error('PM Agent MCP server started on stdio transport');
}

main().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  server.close().catch(() => {});
  process.exit(0);
});
process.on('SIGTERM', () => {
  server.close().catch(() => {});
  process.exit(0);
});
