/**
 * Semantic Codebase Analyzer
 *
 * Reads source file content and extracts:
 * - Export names (functions, classes, interfaces, types, const, default)
 * - Import specifiers (what modules this file depends on)
 * - Key type declarations (classes, interfaces, types)
 * - A heuristic summary sentence
 */

import fs from 'fs';
import path from 'path';

export interface FileSummary {
  path: string;
  summary: string;
  purpose: string;
  exports: string[];
  imports: string[];
  keyTypes: string[];
}

// Regex patterns for export extraction
const EXPORT_PATTERNS = [
  /export\s+(async\s+)?function\s+(\w+)/g,
  /export\s+(default\s+)?class\s+(\w+)/g,
  /export\s+interface\s+(\w+)/g,
  /export\s+type\s+(\w+)/g,
  /export\s+(const|let|var)\s+(\w+)/g,
  /export\s+default\s+(\w+)/g,
  /export\s+default\s+function\s+(\w+)/g,
  /export\s+default\s+class\s+(\w+)/g,
];

// Regex patterns for import extraction
const IMPORT_PATTERNS = [
  /import\s+.*?from\s+['"]([^'"]+)['"]/g,
  /import\s+['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

// Regex patterns for type extraction
const TYPE_PATTERNS = [
  /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g,
  /(?:export\s+)?interface\s+(\w+)/g,
  /(?:export\s+)?type\s+(\w+)\s*=/g,
  /(?:export\s+)?enum\s+(\w+)/g,
];

// Framework/detection patterns from architecture map
const FRAMEWORK_PATTERNS: Record<string, RegExp[]> = {
  'react': [/react/],
  'express': [/express/],
  'nextjs': [/next/, /@nestjs/],
  'vue': [/vue/],
  'angular': [/@angular/],
};

export function analyzeFile(filePath: string, content?: string): FileSummary {
  const source = content || fs.readFileSync(filePath, 'utf-8');
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  const ext = path.extname(filePath);

  // Extract exports
  const exports: string[] = [];
  for (const pattern of EXPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const name = match[match.length - 1]; // Last capture group is the name
      if (name && !exports.includes(name)) exports.push(name);
    }
  }

  // Extract imports
  const imports: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const mod = match[1];
      if (mod && !imports.includes(mod)) imports.push(mod);
    }
  }

  // Extract key types
  const keyTypes: string[] = [];
  for (const pattern of TYPE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const typeName = match[1];
      if (typeName && !keyTypes.includes(typeName)) keyTypes.push(typeName);
    }
  }

  // Generate heuristic summary
  const summary = generateSummary(relPath, exports, keyTypes, source);

  // Determine purpose from path + exports
  const purpose = determinePurpose(relPath, exports);

  return {
    path: relPath,
    summary,
    purpose,
    exports,
    imports,
    keyTypes,
  };
}

function generateSummary(relPath: string, exports: string[], keyTypes: string[], source: string): string {
  const parts: string[] = [];
  const fileName = path.basename(relPath);
  const dirName = path.dirname(relPath);

  // Try to extract JSDoc/comment at top
  const firstComment = source.match(/\/\*\*[\s\S]*?\*\//);
  const jsDocSummary = firstComment ? firstComment[0].replace(/\/\*\*|\*\/|\s*\*\s?/g, '').trim() : '';
  if (jsDocSummary && jsDocSummary.length < 200) {
    parts.push(jsDocSummary);
  }

  // Export-based description
  if (exports.length > 0) {
    parts.push(`Exports: ${exports.slice(0, 5).join(', ')}${exports.length > 5 ? `, +${exports.length - 5} more` : ''}`);
  }

  // Type declarations
  if (keyTypes.length > 0) {
    parts.push(`Defines: ${keyTypes.slice(0, 3).join(', ')}`);
  }

  return parts.join(' — ') || `${fileName} — ${dirName === '.' ? 'root' : dirName} module (${Math.max(1, source.split('\n').length)} lines)`;
}

function determinePurpose(relPath: string, exports: string[]): string {
  const segments = relPath.replace(/\\/g, '/').split('/');

  // Detect from directory structure
  if (segments.some(s => ['handler', 'controller', 'route', 'router'].includes(s.toLowerCase()))) {
    return 'handler/controller';
  }
  if (segments.some(s => ['service', 'services'].includes(s.toLowerCase()))) {
    return 'service/business-logic';
  }
  if (segments.some(s => ['model', 'models', 'entity', 'entities'].includes(s.toLowerCase()))) {
    return 'data-model';
  }
  if (segments.some(s => ['middleware', 'middlewares'].includes(s.toLowerCase()))) {
    return 'middleware';
  }
  if (segments.some(s => ['util', 'utils', 'helper', 'helpers'].includes(s.toLowerCase()))) {
    return 'utility';
  }
  if (segments.some(s => ['config', 'configuration'].includes(s.toLowerCase()))) {
    return 'config/setup';
  }
  if (segments.some(s => ['type', 'types', 'interface', 'interfaces'].includes(s.toLowerCase()))) {
    return 'types/definitions';
  }
  if (segments.some(s => ['test', 'tests', 'spec', '__tests__'].includes(s.toLowerCase()))) {
    return 'test';
  }
  if (segments.some(s => ['hook', 'hooks'].includes(s.toLowerCase()))) {
    return 'hooks';
  }
  if (segments.some(s => ['db', 'database', 'migration'].includes(s.toLowerCase()))) {
    return 'database';
  }
  if (segments.some(s => ['cli', 'command'].includes(s.toLowerCase()))) {
    return 'cli-command';
  }

  return 'module';
}

export function detectFramework(imports: string[]): string[] {
  const detected: string[] = [];
  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    for (const pattern of patterns) {
      if (imports.some(i => pattern.test(i))) {
        detected.push(framework);
        break;
      }
    }
  }
  return detected;
}
