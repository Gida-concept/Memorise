import fs from 'fs';
import path from 'path';
import ora from 'ora';
import inquirer from 'inquirer';
import { openDb, closeDb, detectIntegrations, DEFAULT_CONFIG_TOML, DEFAULT_RULES_TOML, generateScaffold } from '@gida-concept/pm-agent-core';
import type { PmAgentConfig } from '@gida-concept/pm-agent-core';
import { Colors } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';
import { scanCommand } from './scan.js';
import { installHooks } from './hooks.js';

export async function initCommand(opts: Record<string, any>): Promise<void> {
  const projectRoot = process.cwd();

  // Respect PM_AGENT_CONFIG or --config if set; otherwise use project-local .pm-agent/
  const defaultAgentDir = path.join(projectRoot, '.pm-agent');
  const configPath = opts.config || process.env.PM_AGENT_CONFIG || path.join(defaultAgentDir, 'config.toml');
  const configDir = path.dirname(configPath);
  const rulesPath = path.join(configDir, 'rules.toml');
  const dataDir = process.env.PM_AGENT_HOME || configDir;
  const projectName = opts.name || path.basename(projectRoot);
  const dbPath = path.join(dataDir, 'pm.db');

  // Check for existing config
  if (fs.existsSync(configPath) && !opts.force) {
    throw new PmCliError(`Config already exists at ${configPath}\nUse --force to overwrite`, ExitCode.CONFIG_ERROR);
  }

  const spinner = ora('Setting up PM Agent...').start();

  try {
    // Create directories
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });

    // Write default config.toml (fill in project-specific values)
    // Note: TOML config paths must use forward slashes even on Windows
    const defaultConfig = DEFAULT_CONFIG_TOML
      .replace('name = ""', `name = "${projectName}"`)
      .replace('root = ""', `root = "${process.cwd().replace(/\\/g, '/')}"`)
      .replace('path = ""', `path = "${dbPath.replace(/\\/g, '/')}"`)
      .replace('config_path = ""', `config_path = "${rulesPath.replace(/\\/g, '/')}"`);
    fs.writeFileSync(configPath, defaultConfig, 'utf-8');

    // Create the database
    let db;
    try {
      db = await openDb({ path: dbPath });
    } catch (err) {
      spinner.fail('Failed to create database');
      const isNative = String(err).includes('sql.js') || String(err).includes('wasm') || String(err).includes('WebAssembly');
      if (isNative) {
        console.error('\n  The sql.js module failed to initialize.');
        console.error('  Fix: install locally first:\n');
        console.error('    npm install -D @gida-concept/pm-agent-cli');
        console.error('    npx pm init\n');
      }
      throw new PmCliError(`Database initialization failed: ${err}`, ExitCode.CONFIG_ERROR);
    }
    await closeDb(db);

    // Write default rules.toml (shipped defaults with all rules)
    fs.writeFileSync(rulesPath, DEFAULT_RULES_TOML, 'utf-8');

    // Detect and configure integrations
    try {
      const config: PmAgentConfig = {
        project: {
          name: projectName,
          root: process.cwd(),
          description: '',
        },
      };
      const detected = await detectIntegrations(config);

      if (detected.length > 0) {
        spinner.text = 'Configuring integrations...';
        const currentConfig = fs.readFileSync(configPath, 'utf-8');

        for (const integration of detected) {
          if (integration.name === 'github') {
            if (!currentConfig.includes('[integrations.github]')) {
              fs.appendFileSync(configPath, '\n[integrations.github]\n');
            }
            const gh = integration as unknown as { owner: string; repo: string };
            if (gh.owner && gh.repo) {
              console.log(Colors.success(`  GitHub: detected @ ${gh.owner}/${gh.repo}`));
            } else {
              console.log(Colors.success('  GitHub: detected'));
            }
          }
          if (integration.name === 'linear') {
            if (!currentConfig.includes('[integrations.linear]')) {
              fs.appendFileSync(configPath, '\n[integrations.linear]\n');
            }
            if (process.env.LINEAR_API_KEY) {
              console.log(Colors.success('  Linear: API key detected'));
            } else {
              console.log(Colors.info('  Linear: set LINEAR_API_KEY env var to enable'));
            }
          }
        }
      }
    } catch {
      console.warn(Colors.muted('[init] Integration detection failed — continuing without integration config'));
    }

    // Always run initial scan + semantic analysis
    spinner.text = 'Running initial scan...';
    await scanCommand({ full: true, config: opts.config });

    // Semantic analysis: extract exports, imports, types from every file
    try {
      spinner.text = 'Analyzing codebase semantics...';
      const { understandCommand } = await import('./understand.js');
      await understandCommand({});
    } catch {
      console.warn(Colors.muted('[init] Semantic analysis failed — continuing without analysis'));
    }
    try {
      const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
      if (!fs.existsSync(claudeMdPath) || opts.force) {
        const pmAgentInstructions = [
          '# PM Agent — Project Management Context',
          '',
          'This project uses **PM Agent** to track decisions, blockers, notes, scope, and codebase intelligence.',
          '',
          '## Required Workflow',
          '',
          'On EVERY interaction, follow this sequence:',
          '',
          '1. **START** — Read the `.pm-agent/` database to learn current project state',
          '2. **CHECK** — Review active blockers and rules before making changes',
          '3. **TRACK** — Log significant decisions with rationale',
          '4. **NOTE** — Capture observations, context, and open questions',
          '',
          '## Available Commands',
          '',
          'Use the CLI via `! pm <command>`:',
          '',
          '| Purpose | Command |',
          '|---------|---------|',
          '| Project snapshot | `pm status` — decisions, blockers, notes, scope, architecture',
          '| Blockers | `pm blockers` — active and resolved blockers',
          '| Decisions | `pm log` — log an ADR with body and links',
          '| Notes | `pm note` — quick capture with tags',
          '| Scope | `pm scope` — sprint impact and risk assessment',
          '| Rules | `pm rules` — evaluate rules against any context',
          '| Scan | `pm scan` — index file registry, deps, architecture',
          '| Search | `pm search` — full-text across code and docs',
          '| Architecture | `pm arch` — entry points, layers, frameworks',
          '| Analysis | `pm understand` — deep semantic analysis',
          '',
          '## Core Principles',
          '',
          '- Every decision has a rationale — log it',
          '- Blockers are tracked until resolved — check them first',
          '- Code changes are scoped with impact awareness — scan before big refactors',
          '- Project rules are enforced at the hook level — violations are blocked automatically',
          '',
        ];
        fs.writeFileSync(claudeMdPath, pmAgentInstructions.join('\n'), 'utf-8');
      }
    } catch {
      console.warn(Colors.muted('[init] CLAUDE.md creation failed — continuing without CLAUDE.md'));
    }

    // Auto-install hooks into .claude/hooks/ (non-fatal)
    spinner.text = 'Installing PM Agent hooks...';
    try {
      installHooks(process.cwd());
      spinner.succeed('PM Agent hooks installed');
    } catch (err) {
      spinner.fail('Could not install PM Agent hooks');
      const message = (err as Error).message || String(err);
      console.log(Colors.warning(`  ${message}`));
      console.log(Colors.muted('  Install manually: npm install @gida-concept/pm-agent-hooks'));
    }

    // Check if project appears empty and offer scaffolding
    try {
      const db = await openDb({ path: dbPath });
      const registry = db.prepare('SELECT COUNT(*) as count FROM file_registry').get() as { count: number };
      await closeDb(db);

      if (registry.count < 5) {
        // Stop the spinner before interactive prompts to avoid overlapping output
        spinner.stop();
        console.log(Colors.info('\nProject appears empty. Would you like to scaffold a production-grade project?'));
        const { scaffold } = await inquirer.prompt([{
          type: 'confirm',
          name: 'scaffold',
          message: 'Generate project structure?',
          default: true,
        }]);

        if (scaffold) {
          const answers = await inquirer.prompt([
            {
              type: 'list',
              name: 'projectType',
              message: 'Project type:',
              choices: [
                { name: 'Web Application', value: 'web-app' },
                { name: 'API Service', value: 'api' },
                { name: 'TypeScript Library', value: 'library' },
                { name: 'CLI Tool', value: 'cli-tool' },
              ],
            },
            {
              type: 'list',
              name: 'framework',
              message: 'Framework:',
              choices: [
                { name: 'Express', value: 'express' },
                { name: 'Fastify', value: 'fastify' },
                { name: 'Hono', value: 'hono' },
                { name: 'None (plain TypeScript)', value: 'none' },
              ],
              when: (a: any) => a.projectType === 'api' || a.projectType === 'web-app',
            },
            {
              type: 'list',
              name: 'testing',
              message: 'Testing framework:',
              choices: [
                { name: 'Vitest', value: 'vitest' },
                { name: 'Jest', value: 'jest' },
                { name: 'None', value: 'none' },
              ],
            },
            {
              type: 'list',
              name: 'packageManager',
              message: 'Package manager:',
              choices: [
                { name: 'npm', value: 'npm' },
                { name: 'pnpm', value: 'pnpm' },
                { name: 'yarn', value: 'yarn' },
              ],
            },
            {
              type: 'confirm',
              name: 'gitInit',
              message: 'Init git repository?',
              default: true,
            },
            {
              type: 'confirm',
              name: 'addCI',
              message: 'Add GitHub Actions CI?',
              default: true,
            },
            {
              type: 'confirm',
              name: 'addESLint',
              message: 'Add ESLint?',
              default: true,
            },
            {
              type: 'confirm',
              name: 'addPrettier',
              message: 'Add Prettier?',
              default: true,
            },
          ]);

          const result = generateScaffold(process.cwd(), answers);
          console.log(Colors.success('\nScaffolded ' + result.filesCreated.length + ' files!'));
          console.log(Colors.info('\nNext steps:'));
          result.nextSteps.forEach(s => console.log(Colors.muted('  • ' + s)));

          // Re-run scan so the new files are indexed
          spinner.start('Re-scanning after scaffold...');
          await scanCommand({ full: true, config: opts.config });
        }
      }
    } catch {
      console.warn(Colors.muted('[init] Scaffolding failed — continuing without scaffold'));
    }

    spinner.succeed(`PM Agent initialized for "${projectName}"`);
    console.log(Colors.success(`\nConfig:    ${configPath}`));
    console.log(Colors.success(`Database:  ${dbPath}`));
    console.log(Colors.success(`Rules:     ${rulesPath}`));
    console.log(Colors.success(`CLAUDE.md: ${path.join(projectRoot, 'CLAUDE.md')}`));
    console.log(Colors.info('\nRun `pm --help` to see available commands.'));

  } catch (err) {
    spinner.fail('Failed to initialize');
    throw new PmCliError(String(err), ExitCode.GENERAL_ERROR);
  }
}
