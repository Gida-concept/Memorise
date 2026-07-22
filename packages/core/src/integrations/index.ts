import Database from 'better-sqlite3';
import type { PmAgentConfig } from '../config.js';
import { GitHubIntegration } from './github.js';
import { LinearIntegration } from './linear.js';
import type { Integration } from './types.js';
import { IntegrationError, withRetry } from './types.js';

export type { Integration } from './types.js';
export { IntegrationError, withRetry } from './types.js';
export { GitHubIntegration } from './github.js';
export { LinearIntegration } from './linear.js';

export interface SyncResult {
  integrations: Array<{
    name: string;
    detected: boolean;
    connected: boolean;
    blockers_fetched: number;
    decisions_fetched: number;
    tasks_fetched: number;
    error?: string;
  }>;
}

/**
 * Auto-detect all available integrations for the project.
 */
export async function detectIntegrations(config: PmAgentConfig): Promise<Integration[]> {
  const integrations: Integration[] = [];
  const candidates: Integration[] = [new GitHubIntegration(), new LinearIntegration()];

  for (const integration of candidates) {
    const detected = await integration.detect(config);
    if (detected) {
      integrations.push(integration);
    }
  }

  return integrations;
}

/**
 * Sync all configured integrations — detects, connects, fetches blockers/decisions/tasks.
 */
export async function syncAllIntegrations(
  db: Database.Database,
  config: PmAgentConfig,
): Promise<SyncResult> {
  const result: SyncResult = { integrations: [] };
  const integrations = await detectIntegrations(config);

  for (const integration of integrations) {
    const entry: SyncResult['integrations'][0] = {
      name: integration.name,
      detected: true,
      connected: false,
      blockers_fetched: 0,
      decisions_fetched: 0,
      tasks_fetched: 0,
    };

    try {
      await integration.connect(config);
      entry.connected = true;

      entry.blockers_fetched = (await integration.fetchBlockers(db)).length;
      entry.decisions_fetched = (await integration.fetchDecisions(db)).length;
      entry.tasks_fetched = (await integration.fetchTasks(db)).length;
    } catch (err) {
      entry.error = (err as Error).message;
    }

    result.integrations.push(entry);
  }

  return result;
}
