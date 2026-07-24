import { DbWrapper } from '../db.js';
import { execSync } from 'child_process';
import * as https from 'https';
import type { PmAgentConfig } from '../config.js';
import type { Integration } from './types.js';
import { IntegrationError } from './types.js';
import type { Blocker } from '../memory/blockers.js';
import type { Decision } from '../memory/decisions.js';
import type { Task } from '../memory/tasks.js';
import { createBlocker } from '../memory/blockers.js';
import { createDecision } from '../memory/decisions.js';
import { createTask } from '../memory/tasks.js';

interface GitHubPR {
  number: number;
  title: string;
  html_url: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
  requested_reviewers: Array<{ login: string }>;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  html_url: string;
  user: { login: string };
  created_at: string;
  labels: Array<{ name: string }>;
  state: string;
}

interface GitHubReview {
  id: number;
  state: string;
}

interface GithubApiError {
  message: string;
  documentation_url?: string;
}

export class GitHubIntegration implements Integration {
  name = 'github';
  owner = '';
  repo = '';
  private token = '';

  /**
   * Detect GitHub from git remote URL.
   * Supports both SSH (git@github.com:owner/repo.git) and HTTPS (https://github.com/owner/repo.git).
   */
  async detect(config: PmAgentConfig): Promise<boolean> {
    // If config already has github.repo set, use it
    if (config.integrations?.github?.repo) {
      const parts = config.integrations.github.repo.split('/');
      if (parts.length >= 2) {
        this.owner = parts[0]!;
        this.repo = parts[1]!;
        return true;
      }
    }

    // Detect from git remote
    try {
      const remote = execSync('git remote get-url origin 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
      // SSH: git@github.com:owner/repo.git
      const sshMatch = remote.match(/git@([^:]+):(.+?)(?:\.git)?$/);
      // HTTPS: https://github.com/owner/repo.git
      const httpsMatch = remote.match(/https:\/\/([^/]+)\/(.+?)(?:\.git)?$/);

      if (sshMatch) {
        const parts = sshMatch[2]!.split('/');
        this.owner = parts[0]!;
        this.repo = parts[1]!.replace(/\.git$/, '');
        return true;
      }
      if (httpsMatch) {
        const parts = httpsMatch[2]!.split('/');
        this.owner = parts[0]!;
        this.repo = parts[1]!.replace(/\.git$/, '');
        return true;
      }
    } catch {
      // no git remote
    }

    return false;
  }

  /**
   * Connect: verify GITHUB_TOKEN env var has the right scopes.
   * Token is read from environment only — never from config file.
   */
  async connect(config: PmAgentConfig): Promise<void> {
    this.token = process.env.GITHUB_TOKEN || config.integrations?.github?.token || '';
    if (!this.token) {
      return; // Degraded mode — token-less detection is fine, but can't fetch
    }

    // Verify token by fetching the authenticated user
    try {
      const result = await this._fetch(`/user`);
      if (result.statusCode >= 400) {
        throw new IntegrationError(
          result.statusCode === 401 ? 'Invalid GitHub token' : `GitHub token verification failed: ${result.statusCode}`,
          result.statusCode === 401 ? 'auth' : 'network',
          result.statusCode >= 500,
        );
      }
      const user = JSON.parse(result.body) as { login?: string };
      if (!user || !user.login) {
        throw new IntegrationError('Invalid GitHub token', 'auth', false);
      }
    } catch (err) {
      if (err instanceof IntegrationError) throw err;
      throw new IntegrationError(
        `GitHub connection failed: ${(err as Error).message}`,
        'network',
        true,
      );
    }
  }

  /**
   * Fetch open PRs as blockers.
   * Creates a blocker for each PR that has no reviews (unreviewed) and has been open > 24h.
   */
  async fetchBlockers(db: DbWrapper): Promise<Blocker[]> {
    return this._paginatedRequest('/pulls?state=open&per_page=100', async (pr: GitHubPR) => {
      const ageHours = (Date.now() - new Date(pr.updated_at).getTime()) / 3600000;
      if (ageHours < 24) return null; // Only block on PRs > 24h stale

      // Check if PR has any reviews
      try {
        const reviews = await this._fetch(`/pulls/${pr.number}/reviews?per_page=1`);
        if (reviews.statusCode >= 200 && reviews.statusCode < 300) {
          const parsed = JSON.parse(reviews.body) as GitHubReview[];
          if (parsed.length > 0) return null; // Has at least one review
        }
      } catch {
        // If review fetch fails, still create the blocker
      }

      return createBlocker(db, {
        title: `Unreviewed PR #${pr.number}: ${pr.title}`,
        description: `PR #${pr.number} by @${pr.user.login} has been open for ${Math.round(ageHours)}h without review`,
        blocked_by: pr.html_url || `https://github.com/${this.owner}/${this.repo}/pull/${pr.number}`,
        links: [],
      });
    });
  }

  /**
   * Fetch closed issues with "decision" label as decisions.
   */
  async fetchDecisions(db: DbWrapper): Promise<Decision[]> {
    return this._paginatedRequest('/issues?state=closed&labels=decision&per_page=100', async (issue: GitHubIssue) => {
      return createDecision(db, {
        title: `[GitHub] ${issue.title}`,
        body: issue.body || `Imported from ${issue.html_url}`,
        author: issue.user.login,
        links: [],
      });
    });
  }

  /**
   * Fetch open issues as tasks (excluding pull requests).
   */
  async fetchTasks(db: DbWrapper): Promise<Task[]> {
    return this._paginatedRequest('/issues?state=open&per_page=100', async (issue: GitHubIssue) => {
      // Skip pull requests (GitHub API returns both issues and PRs)
      if (issue.html_url?.includes('/pull/')) return null;

      return createTask(db, {
        title: `[GitHub] ${issue.title}`,
        owner: issue.user.login,
        links: [],
      });
    });
  }

  /**
   * Low-level HTTP GET request to the GitHub API.
   */
  private _fetch(path: string): Promise<{ statusCode: number; body: string; linkHeader: string | null }> {
    const baseUrl = `https://api.github.com/repos/${this.owner}/${this.repo}`;
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

    return new Promise((resolve) => {
      const options: https.RequestOptions = {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'pm-agent/0.1.0',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        timeout: 15000,
      };

      const req = https.get(url, options, (res) => {
        const statusCode = res.statusCode || 0;
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          const linkRaw = res.headers['link'];
          const linkHeader = Array.isArray(linkRaw) ? (linkRaw[0] ?? null) : (linkRaw ?? null);
          resolve({ statusCode, body, linkHeader });
        });
      });

      req.on('error', (err) => {
        resolve({
          statusCode: 0,
          body: JSON.stringify({ message: err.message }),
          linkHeader: null,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          statusCode: 0,
          body: JSON.stringify({ message: 'GitHub request timed out' }),
          linkHeader: null,
        });
      });
    });
  }

  /**
   * Convenience: GET and parse JSON, throw on error status codes.
   */
  private async apiRequest(path: string): Promise<any> {
    const { statusCode, body } = await this._fetch(path);

    if (statusCode === 0) {
      const errBody = JSON.parse(body) as GithubApiError;
      throw new IntegrationError(
        errBody.message || 'GitHub network error',
        'network',
        true,
      );
    }
    if (statusCode === 429) {
      throw new IntegrationError('GitHub rate limit exceeded', 'rate_limit', true);
    }
    if (statusCode === 401 || statusCode === 403) {
      throw new IntegrationError('GitHub authentication failed', 'auth', false);
    }
    if (statusCode === 404) {
      throw new IntegrationError('GitHub resource not found', 'not_found', false);
    }
    if (statusCode >= 500) {
      throw new IntegrationError(`GitHub server error: ${statusCode}`, 'network', true);
    }

    if (!body || body.length === 0) {
      return null;
    }

    try {
      return JSON.parse(body);
    } catch {
      throw new IntegrationError('Failed to parse GitHub response', 'parse', false);
    }
  }

  /**
   * Paginated request that fetches all pages via Link header.
   */
  private async _paginatedRequest<T>(
    path: string,
    transform: (item: any) => Promise<T | null>,
  ): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | null = path;

    while (nextUrl) {
      const { statusCode, body, linkHeader } = await this._fetch(nextUrl);

      if (statusCode === 0 || statusCode >= 400) {
        break; // Stop pagination on error
      }

      let items: any[];
      try {
        items = JSON.parse(body);
      } catch {
        break;
      }

      if (!Array.isArray(items)) break;

      for (const item of items) {
        try {
          const transformed = await transform(item);
          if (transformed !== null) results.push(transformed);
        } catch {
          // Skip items that fail transformation
        }
      }

      nextUrl = this._parseNextLink(linkHeader);
    }

    return results;
  }

  /**
   * Parse the Link header to find the next page URL.
   */
  private _parseNextLink(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    // Link header format: <url>; rel="next", <url>; rel="last"
    for (const part of linkHeader.split(',')) {
      const trimmed = part.trim();
      const match = trimmed.match(/<([^>]+)>;\s*rel="next"/);
      if (match && match[1]) return match[1];
    }
    return null;
  }
}
