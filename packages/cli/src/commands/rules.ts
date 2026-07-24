import fs from 'fs';
import { loadRules, addRule, removeRule, toggleRule } from '@gida-concept/pm-agent-core';
import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors, formatTable } from '../formatters.js';
import { ExitCode } from '../exit-codes.js';
import { PmCliError } from '../errors.js';

async function getRulesPath(opts: Record<string, any>): Promise<string> {
  const ctx = await getCommandContext(opts);
  const rulesPath = ctx.config.rules?.config_path;
  closeCommandContext(ctx);

  if (!rulesPath || !fs.existsSync(rulesPath)) {
    throw new PmCliError('Rules file not found. Run `pm init` first.', ExitCode.CONFIG_ERROR);
  }
  return rulesPath;
}

export async function rulesCommand(subcommand: string | undefined, subOpts: Record<string, any>, opts: Record<string, any>): Promise<void> {
  const rulesPath = await getRulesPath(opts);

  switch (subcommand) {
    case 'list': {
      const scope = subOpts.scope as 'pm' | 'code' | undefined;
      const rules = loadRules(rulesPath, scope);

      if (shouldOutputJson(subOpts)) {
        outputJson(rules, subOpts);
      } else if (rules.length === 0) {
        console.log(Colors.muted('No rules found.'));
      } else {
        console.log(formatTable(
          ['Name', 'Scope', 'Severity', 'Enabled'],
          rules.map(r => [
            Colors.highlight(r.name),
            r.scope,
            r.severity === 'hard' ? Colors.error(r.severity) : r.severity === 'soft' ? Colors.warning(r.severity) : Colors.info(r.severity),
            r.enabled !== false ? Colors.success('+') : Colors.muted('-'),
          ])
        ));
      }
      break;
    }

    case 'add': {
      if (!subOpts.name || !subOpts.trigger || !subOpts.action || !subOpts.severity) {
        throw new PmCliError('Usage: pm rules add <name> --scope pm|code|all --trigger <expr> --action <str> --severity hard|soft|info', ExitCode.GENERAL_ERROR);
      }
      addRule(rulesPath, {
        name: subOpts.name,
        scope: subOpts.scope || 'all',
        trigger: subOpts.trigger,
        condition: subOpts.condition,
        action: subOpts.action,
        severity: subOpts.severity,
        description: subOpts.description,
        enabled: true,
      });
      console.log(Colors.success(`Rule '${subOpts.name}' added.`));
      break;
    }

    case 'remove': {
      if (!subOpts.name) {
        throw new PmCliError('Usage: pm rules remove <name>', ExitCode.GENERAL_ERROR);
      }
      removeRule(rulesPath, subOpts.name);
      console.log(Colors.success(`Rule '${subOpts.name}' removed.`));
      break;
    }

    case 'enable': {
      if (!subOpts.name) {
        throw new PmCliError('Usage: pm rules enable <name>', ExitCode.GENERAL_ERROR);
      }
      toggleRule(rulesPath, subOpts.name, true);
      console.log(Colors.success(`Rule '${subOpts.name}' enabled.`));
      break;
    }

    case 'disable': {
      if (!subOpts.name) {
        throw new PmCliError('Usage: pm rules disable <name>', ExitCode.GENERAL_ERROR);
      }
      toggleRule(rulesPath, subOpts.name, false);
      console.log(Colors.success(`Rule '${subOpts.name}' disabled.`));
      break;
    }

    case 'toggle': {
      if (!subOpts.name) {
        throw new PmCliError('Usage: pm rules toggle <name>', ExitCode.GENERAL_ERROR);
      }
      toggleRule(rulesPath, subOpts.name);
      console.log(Colors.success(`Rule '${subOpts.name}' toggled.`));
      break;
    }

    case 'show': {
      if (!subOpts.name) {
        throw new PmCliError('Usage: pm rules show <name>', ExitCode.GENERAL_ERROR);
      }
      const rules = loadRules(rulesPath);
      const rule = rules.find(r => r.name === subOpts.name);
      if (!rule) {
        throw new PmCliError(`Rule '${subOpts.name}' not found.`, ExitCode.GENERAL_ERROR);
      }
      if (shouldOutputJson(subOpts)) {
        outputJson(rule, subOpts);
      } else {
        console.log(`  Name:        ${Colors.highlight(rule.name)}`);
        console.log(`  Scope:       ${rule.scope}`);
        console.log(`  Severity:    ${rule.severity === 'hard' ? Colors.error(rule.severity) : rule.severity === 'soft' ? Colors.warning(rule.severity) : Colors.info(rule.severity)}`);
        console.log(`  Enabled:     ${rule.enabled !== false ? Colors.success('yes') : Colors.muted('no')}`);
        console.log(`  Trigger:     ${Colors.info(rule.trigger)}`);
        if (rule.condition) console.log(`  Condition:   ${Colors.info(rule.condition)}`);
        console.log(`  Action:      ${rule.action}`);
        if (rule.description) console.log(`  Description: ${rule.description}`);
      }
      break;
    }

    case 'reload': {
      // Reload is a no-op at the CLI level since rules are loaded fresh each command
      const count = loadRules(rulesPath).length;
      console.log(Colors.success(`Reloaded ${count} rules from ${rulesPath}`));
      break;
    }

    default:
      throw new PmCliError(`Unknown subcommand: ${subcommand}. Try: list, add, remove, enable, disable, toggle, show, reload`, ExitCode.GENERAL_ERROR);
  }
}
