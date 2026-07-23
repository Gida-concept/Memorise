#!/usr/bin/env node

import { createRequire } from 'module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const { version } = createRequire(import.meta.url)('../package.json');
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { McpForwarder } from './forwarder.js';
import { evaluateRules } from './enforcer.js';
import { logEnforcement } from './audit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textContent(text: string): { type: 'text'; text: string } {
  return { type: 'text', text };
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const server = new Server(
  ({
    name: 'pm-agent-proxy',
    version,
    instructions: `You are connected to **PM Agent Proxy** — an enforcement layer in front of the real PM Agent MCP server.

The proxy evaluates **PM Agent rules** before every tool call and blocks any operation that violates a hard rule.
Soft/info rules produce warnings but do not block.

**What happens on each call:**
1. Rules are evaluated against the tool name and arguments
2. If a hard rule triggers → call is blocked with an error response
3. If the call passes → it is forwarded to the real PM Agent server and the result is returned

Configure rules in your project's .pm-agent/config.toml or point PM_AGENT_CONFIG to your config file.

**Proxy does NOT interfere with non-pm_* tools** — only pm_* tools are evaluated against rules.`,
  }) as any,
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// Forwarder — spawns the real PM Agent MCP server
// ---------------------------------------------------------------------------

const FORWARDER_COMMAND = 'npx';
const FORWARDER_ARGS = ['-y', '@gida-concept/pm-agent-mcp-server'];

const forwarder = new McpForwarder(FORWARDER_COMMAND, FORWARDER_ARGS);

// Cached tool list from the real server
let cachedTools: Array<{
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}> = [];

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function initForwarder(): Promise<void> {
  try {
    console.error('[pm-agent-proxy] Starting real PM Agent MCP server...');
    await forwarder.start();

    // Fetch and cache tool list
    console.error('[pm-agent-proxy] Fetching tool list from real server...');
    const tools = await forwarder.listTools();
    cachedTools = tools;
    console.error(`[pm-agent-proxy] Cached ${tools.length} tools from real server`);
  } catch (err) {
    console.error('[pm-agent-proxy] Failed to start forwarder:', err);
    console.error('[pm-agent-proxy] Starting in degraded mode — proxy will return error on all tool calls');
    // Server continues without forwarder; it'll return errors for tool calls
  }
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // If we have cached tools from the real server, return them.
  // Otherwise, return a minimal tool list.
  if (cachedTools.length > 0) {
    return { tools: cachedTools };
  }

  // Degraded mode — only expose the real tools if we can reach the forwarder
  try {
    const tools = await forwarder.listTools();
    cachedTools = tools;
    return { tools };
  } catch {
    // Can't reach real server — return empty list
    return { tools: [] };
  }
});

// Tools that are never enforced by the proxy (meta-tools)
const ENFORCER_SKIP = new Set([
  'pm_enforce_rules',
  'pm_add_rule',
  'pm_hooks_setup',
  'pm_enforce_setup',
]);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const rawArgs = (args as Record<string, unknown>) ?? {};

  // Step 1: Evaluate PM Agent rules (skip meta-tools)
  if (!ENFORCER_SKIP.has(name)) {
    const enforcement = evaluateRules(name, rawArgs);

    // Log enforcement event
    logEnforcement({
      timestamp: new Date().toISOString(),
      tool: name,
      blocked: enforcement.blocked,
      rule: enforcement.blocked
        ? enforcement.actions.find(a => a.action === 'block' && !a.passed)?.rule
        : undefined,
      reason: enforcement.reason,
    });

    // Hard block — return error
    if (enforcement.blocked) {
      const blockedRule = enforcement.actions.find(a => a.action === 'block' && !a.passed);
      return {
        content: [
          textContent(
            JSON.stringify({
              error: 'Blocked by PM Agent rule',
              blocked_by: blockedRule?.rule || 'unknown',
              message: enforcement.reason || 'Operation blocked by PM Agent rule enforcement',
            }, null, 2),
          ),
        ],
      };
    }

    // Soft/info warnings — log to stderr but continue
    if (enforcement.warnings.length > 0) {
      for (const warning of enforcement.warnings) {
        console.error(`[pm-agent-proxy] Rule warning for ${name}: ${warning}`);
      }
    }
  }

  // Step 2: Forward to real PM Agent server
  try {
    if (!forwarder.connected) {
      // Try to restart the forwarder
      console.error('[pm-agent-proxy] Forwarder not connected, attempting restart...');
      try {
        await forwarder.start();
        const tools = await forwarder.listTools();
        cachedTools = tools;
      } catch (restartErr) {
        throw new Error(`Real PM Agent server is not available: ${(restartErr as Error).message}`);
      }
    }

    const response = await forwarder.callTool(name, rawArgs);

    if (response.error) {
      return {
        content: [
          textContent(
            JSON.stringify({
              error: response.error.message,
              code: response.error.code,
            }, null, 2),
          ),
        ],
      };
    }

    return { content: [textContent(JSON.stringify(response.result, null, 2))] };
  } catch (err) {
    // If forwarder is disconnected, try to restart once
    if (!forwarder.connected) {
      console.error('[pm-agent-proxy] Forwarder disconnected, restarting...');
      try {
        await forwarder.start();
        const tools = await forwarder.listTools();
        cachedTools = tools;
        // Retry the call
        const response = await forwarder.callTool(name, rawArgs);
        if (response.error) {
          return {
            content: [
              textContent(
                JSON.stringify({
                  error: response.error.message,
                  code: response.error.code,
                }, null, 2),
              ),
            ],
          };
        }
        return { content: [textContent(JSON.stringify(response.result, null, 2))] };
      } catch (retryErr) {
        console.error('[pm-agent-proxy] Restart failed:', retryErr);
      }
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to forward to real PM Agent server: ${(err as Error).message}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('PM Agent Proxy MCP server started on stdio transport');

  // Initialize forwarder in background
  initForwarder().catch((err) => {
    console.error('[pm-agent-proxy] Background init error:', err);
  });
}

main().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await forwarder.stop();
  await server.close().catch(() => {});
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await forwarder.stop();
  await server.close().catch(() => {});
  process.exit(0);
});
