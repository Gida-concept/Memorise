import { DbWrapper } from '../db.js';
import * as https from 'https';
import type { PmAgentConfig } from '../config.js';
import type { Integration } from './types.js';
import { IntegrationError } from './types.js';
import type { Blocker } from '../memory/blockers.js';
import type { Decision } from '../memory/decisions.js';
import type { Task } from '../memory/tasks.js';
import { createBlocker } from '../memory/blockers.js';
import { createDecision } from '../memory/decisions.js';
import { createTask, getTask, updateTaskStatus } from '../memory/tasks.js';

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  priority: number;
  state: { name: string; type: string };
  assignee: { displayName: string } | null;
  labels: Array<{ name: string }>;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GraphqlResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

export class LinearIntegration implements Integration {
  name = 'linear';
  workspaceSlug = '';
  private apiKey = '';

  async detect(config: PmAgentConfig): Promise<boolean> {
    if (config.integrations?.linear?.workspace) {
      this.workspaceSlug = config.integrations.linear.workspace;
      return true;
    }
    return false;
  }

  async connect(config: PmAgentConfig): Promise<void> {
    this.apiKey = process.env.LINEAR_API_KEY || config.integrations?.linear?.api_key || '';
    if (!this.apiKey) {
      return; // Degraded mode
    }

    try {
      const result = await this.graphqlRequest(`
        query {
          viewer {
            id
            name
          }
        }
      `);
      const data = result?.data as { viewer?: { id?: string } } | undefined;
      if (!data?.viewer?.id) {
        throw new IntegrationError('Invalid Linear API key', 'auth', false);
      }
    } catch (err) {
      if (err instanceof IntegrationError) throw err;
      throw new IntegrationError(
        `Linear connection failed: ${(err as Error).message}`,
        'network',
        true,
      );
    }
  }

  async fetchBlockers(db: DbWrapper): Promise<Blocker[]> {
    const issues = await this._fetchIssues('state: { type: { eq: "blocked" } }');
    const blockers: Blocker[] = [];

    for (const issue of issues) {
      const blocker = createBlocker(db, {
        title: `[Linear] ${issue.identifier}: ${issue.title}`,
        description: issue.description || 'Blocked issue from Linear',
        blocked_by: issue.url,
        links: [],
      });

      // Set age based on when the issue was created (approximate)
      blockers.push(blocker);
    }

    return blockers;
  }

  async fetchDecisions(db: DbWrapper): Promise<Decision[]> {
    const issues = await this._fetchIssues('labels: { name: { eq: "decision" } }');
    const decisions: Decision[] = [];

    for (const issue of issues) {
      const decision = createDecision(db, {
        title: `[Linear] ${issue.identifier}: ${issue.title}`,
        body: issue.description || `Imported from ${issue.url}`,
        author: issue.assignee?.displayName || 'unknown',
        links: [],
      });
      decisions.push(decision);
    }

    return decisions;
  }

  async fetchTasks(db: DbWrapper): Promise<Task[]> {
    // Fetch all active (non-done, non-canceled) issues
    const issues = await this._fetchIssues('state: { type: { nin: ["done", "canceled"] } }');
    const tasks: Task[] = [];

    for (const issue of issues) {
      const task = createTask(db, {
        title: `[Linear] ${issue.identifier}: ${issue.title}`,
        owner: issue.assignee?.displayName || '',
        links: [],
      });

      // Update status based on Linear's state type
      const linearStatus = issue.state.type;
      if (linearStatus === 'started') {
        try {
          updateTaskStatus(db, task.id, 'in_progress');
        } catch {
          // If transition is invalid, leave as default todo
        }
      }

      tasks.push(getTask(db, task.id)!);
    }

    return tasks;
  }

  /**
   * Fetch issues with cursor-based pagination from Linear's GraphQL API.
   */
  private async _fetchIssues(filter: string): Promise<LinearIssueNode[]> {
    const issues: LinearIssueNode[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : '';
      const query = `
        query {
          issues(first: 25${afterClause}, filter: { ${filter} }) {
            nodes {
              id
              identifier
              title
              description
              url
              priority
              state {
                name
                type
              }
              assignee {
                displayName
              }
              labels {
                name
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      let result: GraphqlResponse;
      try {
        result = await this.graphqlRequest(query);
      } catch {
        break; // Stop pagination on error
      }

      const data = result?.data as
        | { issues?: { nodes?: LinearIssueNode[]; pageInfo?: PageInfo } }
        | undefined;
      if (!data?.issues) break;

      const nodes = data.issues.nodes || [];
      for (const node of nodes) {
        issues.push(node);
      }

      hasNextPage = data.issues.pageInfo?.hasNextPage || false;
      cursor = data.issues.pageInfo?.endCursor || null;
    }

    return issues;
  }

  /**
   * Send a GraphQL request to the Linear API.
   */
  private async graphqlRequest(query: string): Promise<GraphqlResponse> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ query });

      const options: https.RequestOptions = {
        hostname: 'api.linear.app',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': this.apiKey,
        },
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        const statusCode = res.statusCode || 0;
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8');

          if (statusCode === 401) {
            reject(new IntegrationError('Linear authentication failed', 'auth', false));
            return;
          }
          if (statusCode === 429) {
            reject(new IntegrationError('Linear rate limit exceeded', 'rate_limit', true));
            return;
          }
          if (statusCode >= 500) {
            reject(
              new IntegrationError(`Linear server error: ${statusCode}`, 'network', true),
            );
            return;
          }

          if (!responseBody || responseBody.length === 0) {
            reject(new IntegrationError('Empty response from Linear', 'parse', false));
            return;
          }

          try {
            const parsed = JSON.parse(responseBody) as GraphqlResponse;
            if (parsed.errors && parsed.errors.length > 0) {
              const msg = parsed.errors[0]?.message || 'Unknown Linear API error';
              reject(new IntegrationError(`Linear API error: ${msg}`, 'parse', false));
              return;
            }
            resolve(parsed);
          } catch {
            reject(new IntegrationError('Failed to parse Linear response', 'parse', false));
          }
        });
      });

      req.on('error', (err) => {
        reject(
          new IntegrationError(
            `Linear network error: ${err.message}`,
            'network',
            true,
          ),
        );
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new IntegrationError('Linear request timed out', 'network', true));
      });

      req.write(body);
      req.end();
    });
  }
}
