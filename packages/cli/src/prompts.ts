import inquirer from 'inquirer';

function requireTty(): void {
  if (!process.stdout.isTTY) {
    throw new Error('Non-interactive mode. Use --json or -y/--yes to proceed without prompts.');
  }
}

export async function confirmPrompt(message: string, defaultYes = true): Promise<boolean> {
  requireTty();
  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message,
    default: defaultYes,
  }]);
  return confirmed;
}

export async function selectPrompt(message: string, choices: string[]): Promise<string> {
  requireTty();
  const { selected } = await inquirer.prompt([{
    type: 'list',
    name: 'selected',
    message,
    choices,
  }]);
  return selected;
}

export async function inputPrompt(message: string, defaultValue?: string): Promise<string> {
  requireTty();
  const { value } = await inquirer.prompt([{
    type: 'input',
    name: 'value',
    message,
    default: defaultValue,
  }]);
  return value;
}

export async function detailsPrompt(message: string): Promise<{ confirmed: boolean; details?: string }> {
  requireTty();
  const { confirmed } = await inquirer.prompt([{ type: 'confirm', name: 'confirmed', message, default: false }]);
  if (!confirmed) return { confirmed: false };

  const { details } = await inquirer.prompt([{ type: 'input', name: 'details', message: 'Details:' }]);
  return { confirmed: true, details };
}
