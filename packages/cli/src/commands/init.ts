import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { openDb, closeDb, detectIntegrations, DEFAULT_CONFIG_TOML, DEFAULT_RULES_TOML } from '@pm-agent/core';
import type { PmAgentConfig } from '@pm-agent/core';
import { Colors } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';
import { scanCommand } from './scan.js';

export async function initCommand(opts: Record<string, any>): Promise<void> {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) {
    throw new PmCliError('Cannot determine home directory. Set $HOME or $USERPROFILE.', ExitCode.CONFIG_ERROR);
  }

  // Respect PM_AGENT_CONFIG or --config if set; otherwise use ~/.config/pm-agent
  const configPath = opts.config || process.env.PM_AGENT_CONFIG || path.join(home, '.config', 'pm-agent', 'config.toml');
  const configDir = path.dirname(configPath);
  const rulesPath = path.join(configDir, 'rules.toml');
  const dataDir = process.env.PM_AGENT_HOME || path.join(home, '.local', 'share', 'pm-agent');
  const projectName = opts.name || path.basename(process.cwd());
  const dbPath = path.join(dataDir, `${projectName}.db`);

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
    const defaultConfig = DEFAULT_CONFIG_TOML
      .replace('name = ""', `name = "${projectName}"`)
      .replace('root = ""', `root = "${process.cwd().replace(/\\/g, '/')}"`)
      .replace('path = ""', `path = "${dbPath.replace(/\\/g, '/')}"`)
      .replace('config_path = ""', `config_path = "${rulesPath.replace(/\\/g, '/')}"`);
    fs.writeFileSync(configPath, defaultConfig, 'utf-8');

    // Create the database
    const db = openDb({ path: dbPath });
    closeDb(db);

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
      // Integration detection failed silently — don't block init
    }

    if (opts.scan) {
      spinner.text = 'Running initial scan...';
      await scanCommand({ full: true });
    }

    spinner.succeed(`PM Agent initialized for "${projectName}"`);
    console.log(Colors.success(`\nConfig:  ${configPath}`));
    console.log(Colors.success(`Database: ${dbPath}`));
    console.log(Colors.success(`Rules:    ${rulesPath}`));
    console.log(Colors.info('\nRun `pm --help` to see available commands.'));

  } catch (err) {
    spinner.fail('Failed to initialize');
    throw new PmCliError(String(err), ExitCode.GENERAL_ERROR);
  }
}
