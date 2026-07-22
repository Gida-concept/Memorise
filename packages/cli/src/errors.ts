/**
 * CLI-specific error with a typed exit code.
 * These are caught at the CLI entry point, which calls process.exit()
 * with the correct code. This makes command functions testable -- tests
 * can catch PmCliError instead of being killed by process.exit().
 */
import { ExitCode } from './exit-codes.js';

export class PmCliError extends Error {
  constructor(message: string, public exitCode: number) {
    super(message);
    this.name = 'PmCliError';
  }
}
