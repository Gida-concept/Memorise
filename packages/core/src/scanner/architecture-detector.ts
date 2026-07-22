import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type ArchitectureRole =
  | 'entrypoint'
  | 'middleware'
  | 'model'
  | 'route'
  | 'controller'
  | 'service'
  | 'util'
  | 'component'
  | 'hook'
  | 'test'
  | 'config';

export interface ArchitectureEntry {
  path: string;
  role: ArchitectureRole;
  framework: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Detect entry points from a list of files.
 */
export function detectEntryPoints(files: string[]): ArchitectureEntry[] {
  const entries: ArchitectureEntry[] = [];

  const entryPointPatterns = [
    'index.ts', 'index.js', 'main.ts', 'main.js',
    'app.ts', 'app.js', 'server.ts', 'server.js',
    'cli.ts', 'cli.js', 'bin.ts', 'bin.js',
  ];

  for (const file of files) {
    const basename = path.basename(file);
    if (entryPointPatterns.includes(basename)) {
      entries.push({
        path: file,
        role: 'entrypoint',
        framework: null,
        metadata: { detected_as: 'entry_point_file' },
      });
    }
  }

  return entries;
}

/**
 * Detect framework from package.json dependencies or file patterns.
 */
export function detectFramework(root: string): string | null {
  try {
    const pkgPath = path.join(root, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    if (allDeps.next) return 'next';
    if (allDeps['@nestjs/core']) return 'nest';
    if (allDeps.express) return 'express';
    if (allDeps.react || allDeps['react-dom']) return 'react';
    if (allDeps.vue || allDeps['nuxt']) return 'vue';
    if (allDeps.vitest) return 'vitest';
    if (allDeps.jest) return 'jest';

    return null;
  } catch {
    return null;
  }
}

/**
 * Detect role for a given file based on its path and framework context.
 */
export function detectRole(filePath: string, framework?: string): ArchitectureRole {
  const lowerPath = filePath.toLowerCase();
  const parts = lowerPath.split(/[/\\]/);
  const basename = parts[parts.length - 1] || '';
  const dir = parts.length > 1 ? parts[parts.length - 2] || '' : '';

  // Test files
  if (basename.includes('.test.') || basename.includes('.spec.') || dir === '__tests__' || dir === 'test' || dir === 'tests') {
    return 'test';
  }

  // Config files
  if (basename === 'package.json' || basename === 'tsconfig.json' || basename === '.eslintrc.cjs' ||
      basename.endsWith('.config.ts') || basename.endsWith('.config.js') ||
      dir === 'config' || dir === 'configuration') {
    return 'config';
  }

  // Entry points
  if (['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'server.ts', 'server.js'].includes(basename)) {
    return 'entrypoint';
  }

  // Framework-specific roles
  if (framework === 'next' || framework === 'react') {
    if (dir === 'components' || dir === 'component') return 'component';
    if (dir === 'hooks' || dir === 'hook') return 'hook';
    if (dir === 'pages' || dir === 'page') return 'route';
    if (dir === 'middleware') return 'middleware';
    if (dir === 'models' || dir === 'model') return 'model';
    if (dir === 'services' || dir === 'service') return 'service';
    if (dir === 'controllers' || dir === 'controller') return 'controller';
    if (dir === 'utils' || dir === 'util' || dir === 'helpers' || dir === 'help') return 'util';
  }

  if (framework === 'express' || framework === 'nest') {
    if (dir === 'controllers' || dir === 'controller') return 'controller';
    if (dir === 'routes' || dir === 'route') return 'route';
    if (dir === 'middleware') return 'middleware';
    if (dir === 'models' || dir === 'model') return 'model';
    if (dir === 'services' || dir === 'service') return 'service';
    if (dir === 'utils' || dir === 'util') return 'util';
  }

  // Generic role detection by directory
  if (dir === 'components' || dir === 'component') return 'component';
  if (dir === 'hooks' || dir === 'hook') return 'hook';
  if (dir === 'routes' || dir === 'route') return 'route';
  if (dir === 'middleware') return 'middleware';
  if (dir === 'models' || dir === 'model') return 'model';
  if (dir === 'services' || dir === 'service') return 'service';
  if (dir === 'controllers' || dir === 'controller') return 'controller';
  if (dir === 'utils' || dir === 'util' || dir === 'helpers') return 'util';

  return 'util'; // Default fallback
}

/**
 * Batch store architecture entries in the database.
 */
export function storeArchitecture(db: Database.Database, entries: ArchitectureEntry[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO architecture_map (path, role, framework, metadata)
    VALUES (?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const entry of entries) {
      insert.run(entry.path, entry.role, entry.framework, JSON.stringify(entry.metadata));
    }
  })();
}
