#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

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
};

// ── Server setup ─────────────────────────────────────────────────

const server = new Server(
  { name: 'pm-agent-mcp', version: '0.1.0' },
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

  try {
    const result = await handler((args as Record<string, unknown>) ?? {});
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
