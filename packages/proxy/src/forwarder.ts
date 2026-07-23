import { spawn, ChildProcess } from 'node:child_process';
import readline from 'node:readline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// MCP Forwarder
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 30_000;
const START_TIMEOUT_MS = 5_000;

export class McpForwarder {
  private command: string;
  private args: string[];
  private child: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: JsonRpcResponse) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  private _connected = false;
  private startPromise: Promise<void> | null = null;
  private startResolve: (() => void) | null = null;
  private startReject: ((err: Error) => void) | null = null;

  constructor(command: string, args: string[] = []) {
    this.command = command;
    this.args = args;
  }

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Start the child process and wait for it to be ready.
   */
  async start(): Promise<void> {
    // If already started, return existing promise
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise<void>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;

      try {
        this.child = spawn(this.command, this.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });
      } catch (err) {
        this._connected = false;
        this.startPromise = null;
        reject(new Error(`Failed to spawn child process: ${(err as Error).message}`));
        return;
      }

      const child = this.child!;

      child.on('error', (err) => {
        console.error('[pm-agent-proxy] Child process error:', err.message);
        this._connected = false;
        this.startPromise = null;
        if (this.startReject) {
          this.startReject(err);
          this.startReject = null;
          this.startResolve = null;
        }
      });

      child.on('exit', (code, signal) => {
        console.error(`[pm-agent-proxy] Child process exited (code: ${code}, signal: ${signal})`);
        this._connected = false;
        // Reject all pending requests
        for (const [, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error(`Child process exited with code ${code}, signal ${signal}`));
        }
        this.pending.clear();
        // If still in startup, fail the start promise
        if (this.startReject) {
          this.startReject(new Error(`Child process exited during startup with code ${code}`));
          this.startReject = null;
          this.startResolve = null;
          this.startPromise = null;
        }
      });

      // Read JSON-RPC responses line by line from stdout
      if (child.stdout) {
        this.rl = readline.createInterface({ input: child.stdout });

        this.rl.on('line', (line: string) => {
          try {
            const response: JsonRpcResponse = JSON.parse(line.trim());
            const pending = this.pending.get(response.id);
            if (pending) {
              clearTimeout(pending.timer);
              this.pending.delete(response.id);
              pending.resolve(response);
            }
          } catch {
            // Non-JSON lines from stderr-like output on stdout are ignored
          }
        });
      }

      // Log stderr from child
      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg) {
            console.error(`[pm-agent] ${msg}`);
          }
        });
      }

      // Wait for child to start or timeout
      const checkReady = () => {
        if (child.pid !== undefined && child.exitCode === null) {
          this._connected = true;
          if (this.startResolve) {
            this.startResolve();
            this.startResolve = null;
            this.startReject = null;
          }
          return true;
        }
        return false;
      };

      // Quick poll for readiness
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (checkReady() || attempts >= 20) {
          clearInterval(interval);
          if (!this._connected && this.startResolve) {
            // Child is running but we don't have a ready signal; assume ready
            this._connected = true;
            this.startResolve();
            this.startResolve = null;
            this.startReject = null;
          }
        }
      }, 100);

      // Overall timeout for startup
      setTimeout(() => {
        clearInterval(interval);
        if (this.startResolve) {
          // Timeout but child is alive — consider it ready
          if (child.exitCode === null) {
            this._connected = true;
            this.startResolve();
          } else {
            this.startReject?.(new Error('Child process failed to start within timeout'));
          }
          this.startResolve = null;
          this.startReject = null;
        }
      }, START_TIMEOUT_MS);
    });

    return this.startPromise;
  }

  /**
   * Send a JSON-RPC request and wait for the response.
   */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    if (!this.child || !this.child.stdin) {
      throw new Error('Forwarder not connected');
    }

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const id = this.nextId++;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      // Write as single line of JSON
      const line = JSON.stringify(request) + '\n';
      this.child.stdin!.write(line, 'utf-8');
    });
  }

  /**
   * List tools from the real PM Agent server.
   */
  async listTools(): Promise<McpToolDefinition[]> {
    const response = await this.sendRequest('tools/list');
    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }
    const result = response.result as { tools?: McpToolDefinition[] } | undefined;
    return result?.tools ?? [];
  }

  /**
   * Call a tool on the real PM Agent server.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<JsonRpcResponse> {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  /**
   * Stop the child process.
   */
  async stop(): Promise<void> {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Forwarder stopped'));
    }
    this.pending.clear();

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.child) {
      this.child.kill('SIGTERM');
      // Give it a moment, then SIGKILL
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill('SIGKILL');
        }
      }, 2000);
      this.child = null;
    }

    this._connected = false;
    this.startPromise = null;
  }
}
