import chalk from 'chalk';

export const Colors = {
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red.bold,
  info: chalk.cyan,
  suggest: chalk.magenta,
  muted: chalk.gray,
  highlight: chalk.blue.bold,
};

export function formatCard(title: string, lines: { label: string; value: string }[]): string {
  const maxLabelLen = Math.max(...lines.map(l => l.label.length));
  const header = Colors.highlight(`╔═ ${title} ${'═'.repeat(40)}`);
  const body = lines.map(l => `  ${Colors.muted(l.label.padEnd(maxLabelLen + 1))} ${l.value}`).join('\n');
  const footer = Colors.muted(`╚${'═'.repeat(50)}`);
  return `${header}\n${body}\n${footer}`;
}

export function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '(none)';
  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] || '').length)));
  const sep = '─'.repeat(colWidths.reduce((a, b) => a + b + 3, 1));

  const headerLine = Colors.muted('┌' + sep + '┐') + '\n' +
    '│ ' + headers.map((h, i) => h.padEnd(colWidths[i]!)).join(' │ ') + ' │' + '\n' +
    Colors.muted('├' + sep + '┤');

  const body = rows.map(r =>
    '│ ' + r.map((c, i) => String(c).padEnd(colWidths[i]!)).join(' │ ') + ' │'
  ).join('\n');

  const footer = Colors.muted('└' + sep + '┘');

  return `${headerLine}\n${body}\n${footer}`;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
