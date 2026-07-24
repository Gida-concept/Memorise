/**
 * Project Scaffolder
 *
 * Generates a production-grade project structure for empty projects.
 * Templates are embedded as strings — no external template files.
 */

import fs from 'fs';
import path from 'path';

export interface ScaffoldOptions {
  projectType: 'web-app' | 'api' | 'library' | 'cli-tool';
  framework: 'express' | 'fastify' | 'hono' | 'none';
  testing: 'vitest' | 'jest' | 'none';
  packageManager: 'npm' | 'pnpm' | 'yarn';
  gitInit: boolean;
  addCI: boolean;
  addESLint: boolean;
  addPrettier: boolean;
}

export interface ScaffoldResult {
  filesCreated: string[];
  packagesToInstall: string[];
  nextSteps: string[];
}

/**
 * Generate a project scaffold with the chosen options.
 * Returns the list of created files and next steps.
 */
export function generateScaffold(projectPath: string, options: ScaffoldOptions): ScaffoldResult {
  const filesCreated: string[] = [];
  const srcDir = path.join(projectPath, 'src');
  const projectDirName = path.basename(projectPath);

  fs.mkdirSync(srcDir, { recursive: true });

  // Collect dependency information before writing package.json
  const deps: string[] = [];
  const devDeps: string[] = [];
  const scripts: Record<string, string> = {};

  // ─── src/index.ts ───
  const framework = options.framework || 'none';
  let entryContent = '';

  switch (framework) {
    case 'express':
      entryContent = `import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});

export default app;
`;
      deps.push('express');
      devDeps.push('@types/express');
      scripts.start = 'tsx src/index.ts';
      scripts.dev = 'tsx watch src/index.ts';
      scripts.build = 'tsc';
      break;

    case 'fastify':
      entryContent = `import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    await app.listen({ port: Number(process.env.PORT) || 3000 });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};
start();

export default app;
`;
      deps.push('fastify');
      scripts.start = 'tsx src/index.ts';
      scripts.dev = 'tsx watch src/index.ts';
      scripts.build = 'tsc';
      break;

    case 'hono':
      entryContent = `import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
`;
      deps.push('hono');
      scripts.start = 'tsx src/index.ts';
      scripts.dev = 'tsx watch src/index.ts';
      scripts.build = 'tsc';
      break;

    default:
      entryContent = `// ${projectDirName} — Entry Point
console.log('Hello from ${projectDirName}!');
`;
      if (options.projectType === 'cli-tool') {
        scripts.start = 'node dist/index.js';
        scripts.build = 'tsc';
        scripts.dev = 'tsx watch src/index.ts';
      } else {
        scripts.start = 'tsx src/index.ts';
        scripts.dev = 'tsx watch src/index.ts';
        scripts.build = 'tsc';
      }
      break;
  }

  fs.writeFileSync(path.join(srcDir, 'index.ts'), entryContent);
  filesCreated.push('src/index.ts');

  // ─── tests/ ───
  if (options.testing !== 'none') {
    const testsDir = path.join(projectPath, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });

    scripts.test = options.testing;
    devDeps.push(options.testing);

    const testContent =
      options.testing === 'vitest'
        ? `import { describe, it, expect } from 'vitest';

describe('app', () => {
  it('should work', () => {
    expect(1 + 1).toBe(2);
  });
});
`
        : `describe('app', () => {
  test('should work', () => {
    expect(1 + 1).toBe(2);
  });
});
`;

    fs.writeFileSync(path.join(testsDir, 'example.test.ts'), testContent);
    filesCreated.push('tests/example.test.ts');

    if (options.testing === 'jest') {
      devDeps.push('ts-jest', '@types/jest');
    }
  }

  // ─── .prettierrc ───
  if (options.addPrettier) {
    const prettier = `{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
`;
    fs.writeFileSync(path.join(projectPath, '.prettierrc'), prettier);
    filesCreated.push('.prettierrc');
    devDeps.push('prettier');
  }

  // ─── eslint.config.js ───
  if (options.addESLint) {
    const eslint = `import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/'],
  },
);
`;
    fs.writeFileSync(path.join(projectPath, 'eslint.config.js'), eslint);
    filesCreated.push('eslint.config.js');
    devDeps.push('eslint', '@eslint/js', 'typescript-eslint');
  }

  // ─── package.json ───
  const pkgJson: Record<string, unknown> = {
    name: projectDirName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts,
  };

  if (deps.length > 0) {
    pkgJson.dependencies = Object.fromEntries(deps.map((p) => [p, '^4.0.0']));
  }
  if (devDeps.length > 0) {
    pkgJson.devDependencies = Object.fromEntries(
      devDeps.map((p) => {
        if (p === 'vitest') return [p, '^2.0.0'];
        return [p, '^5.5.0'];
      }),
    );
  }

  fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n');
  filesCreated.push('package.json');

  // ─── tsconfig.json ───
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
    },
    include: ['src'],
    exclude: ['node_modules', 'dist', 'tests'],
  };
  fs.writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
  filesCreated.push('tsconfig.json');

  // ─── .gitignore ───
  const gitignore = `node_modules/
dist/
.env
*.log
`;
  fs.writeFileSync(path.join(projectPath, '.gitignore'), gitignore);
  filesCreated.push('.gitignore');

  // ─── README.md ───
  const readmePath = path.join(projectPath, 'README.md');
  if (!fs.existsSync(readmePath)) {
    const projectTypeLabel =
      options.projectType === 'api'
        ? 'API service'
        : options.projectType === 'web-app'
          ? 'Web application'
          : options.projectType === 'cli-tool'
            ? 'CLI tool'
            : 'TypeScript library';

    const readmeLines: string[] = [
      `# ${projectDirName}`,
      '',
      `${projectTypeLabel} built with ${framework !== 'none' ? framework : 'TypeScript'}${options.testing !== 'none' ? `, tested with ${options.testing}` : ''}.`,
      '',
      '## Getting Started',
      '',
      '```bash',
      `# Install dependencies`,
      `${options.packageManager} install`,
      '',
      `# Start dev server`,
      `${options.packageManager} run dev`,
      '',
      `# Build`,
      `${options.packageManager} run build`,
    ];

    if (options.testing !== 'none') {
      readmeLines.push('', `# Test`, `${options.packageManager} test`);
    }

    readmeLines.push('```', '');
    fs.writeFileSync(readmePath, readmeLines.join('\n'));
    filesCreated.push('README.md');
  }

  // ─── .github/workflows/ci.yml ───
  if (options.addCI) {
    const ciDir = path.join(projectPath, '.github', 'workflows');
    fs.mkdirSync(ciDir, { recursive: true });

    const ciLines: string[] = [
      'name: CI',
      'on: [push, pull_request]',
      'jobs:',
      '  ci:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@v4',
      '        with:',
      '          node-version: 20',
      `          cache: '${options.packageManager}'`,
      `      - run: ${options.packageManager} install`,
      `      - run: ${options.packageManager} run build`,
    ];

    if (options.testing !== 'none') {
      ciLines.push(`      - run: ${options.packageManager} test`);
    }

    fs.writeFileSync(path.join(ciDir, 'ci.yml'), ciLines.join('\n') + '\n');
    filesCreated.push('.github/workflows/ci.yml');
  }

  // Build next-steps list
  const nextSteps: string[] = [
    `Run ${options.packageManager} install`,
    `Run ${options.packageManager} run dev`,
  ];
  if (options.gitInit) {
    nextSteps.push('Run git init && git add . && git commit -m "Initial commit"');
  }

  return {
    filesCreated,
    packagesToInstall: deps,
    nextSteps,
  };
}
