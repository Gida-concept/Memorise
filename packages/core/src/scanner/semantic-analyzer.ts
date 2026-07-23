/**
 * Semantic Codebase Analyzer
 *
 * Reads source file content and extracts:
 * - Export names (functions, classes, interfaces, types, etc.)
 * - Import specifiers (what modules this file depends on)
 * - Key type declarations (classes, interfaces, types)
 * - A heuristic summary sentence
 *
 * Supports multiple languages: TypeScript, JavaScript, Python, Go, Rust, Java, C#, Ruby, PHP, C/C++
 */

import fs from 'fs';
import path from 'path';

export interface FileSummary {
  path: string;
  language: string;
  summary: string;
  purpose: string;
  exports: string[];
  imports: string[];
  keyTypes: string[];
}

// ── Language detection ────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rlib': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.swift': 'swift',
  '.zig': 'zig',
  '.ex': 'elixir',
  '.exs': 'elixir',
};

// ── Language-specific extraction patterns ────────────────────────────

interface LangPatterns {
  exports: RegExp[];
  imports: RegExp[];
  types: RegExp[];
  frameworks: Record<string, RegExp[]>;
  /** Optional post-processing hook to refine extracted data from language-specific syntax. */
  postProcess?: (ctx: { imports: string[]; exports: string[]; keyTypes: string[]; source: string }) => void;
}

const PATTERNS: Record<string, LangPatterns> = {

  // ── TypeScript / JavaScript ──────────────────────────────────────
  typescript: {
    exports: [
      /export\s+(async\s+)?function\s+(\w+)/g,
      /export\s+(abstract\s+)?class\s+(\w+)/g,
      /export\s+interface\s+(\w+)/g,
      /export\s+type\s+(\w+)/g,
      /export\s+(const|let|var)\s+(\w+)/g,
      /export\s+default\s+(\w+)/g,
      /export\s+default\s+function\s+(\w+)/g,
      /export\s+default\s+class\s+(\w+)/g,
      /export\s+enum\s+(\w+)/g,
    ],
    imports: [
      /import\s+.*?from\s+['"]([^'"]+)['"]/g,
      /import\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ],
    types: [
      /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g,
      /(?:export\s+)?interface\s+(\w+)/g,
      /(?:export\s+)?type\s+(\w+)\s*=/g,
      /(?:export\s+)?enum\s+(\w+)/g,
    ],
    frameworks: {
      'react': [/react/],
      'express': [/express/],
      'nextjs': [/next/],
      'vue': [/vue/],
      'angular': [/@angular/],
      'svelte': [/svelte/],
    },
  },

  javascript: {
    exports: [
      /module\.exports\s*=\s*\{?/g,
      /exports\.(\w+)\s*=/g,
      /export\s+default\s*/g,
      /export\s+\{/g,
    ],
    imports: [
      /import\s+.*?from\s+['"]([^'"]+)['"]/g,
      /import\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ],
    types: [
      /function\s+(\w+)/g,
      /class\s+(\w+)/g,
    ],
    frameworks: {
      'react': [/react/],
      'express': [/express/],
      'vue': [/vue/],
    },
  },

  // ── Python ──────────────────────────────────────────────────────
  python: {
    exports: [
      /^def\s+(\w+)/gm,
      /^async\s+def\s+(\w+)/gm,
      /^class\s+(\w+)/gm,
      /^@\w+\s*\n^def\s+(\w+)/gm,
    ],
    imports: [
      /^import\s+(\S+)/gm,
      /^from\s+(\S+)\s+import/gm,
    ],
    types: [
      /^class\s+(\w+)/gm,
    ],
    frameworks: {
      'django': [/django/],
      'flask': [/flask/],
      'fastapi': [/fastapi/],
      'pytest': [/pytest/],
      'sqlalchemy': [/sqlalchemy/],
      'pydantic': [/pydantic/],
    },
  },

  // ── Go ───────────────────────────────────────────────────────────
  go: {
    exports: [
      /^func\s+([A-Z]\w+)/gm,
      /^type\s+(\w+)\s+struct/gm,
      /^type\s+(\w+)\s+interface/gm,
    ],
    imports: [
      /^import\s+"([^"]+)"/gm,
    ],
    types: [
      /^type\s+(\w+)\s+(struct|interface)/gm,
    ],
    frameworks: {
      'gin': [/gin/],
      'echo': [/echo/],
      'fiber': [/fiber/],
      'chi': [/chi/],
      'gorm': [/gorm/],
      'cobra': [/cobra/],
    },
    postProcess: (ctx) => {
      // Parse grouped Go imports:  import ( "fmt" "os" )
      const blockMatch = ctx.source.match(/^import\s+\(([^)]*)\)/ms);
      if (blockMatch) {
        const pkgs = blockMatch[1]?.match(/"([^"]+)"/g);
        if (pkgs) {
          for (const p of pkgs.map(s => s.slice(1, -1))) {
            if (!ctx.imports.includes(p)) ctx.imports.push(p);
          }
        }
      }
    },
  },

  // ── Rust ─────────────────────────────────────────────────────────
  rust: {
    exports: [
      /^pub\s+fn\s+(\w+)/gm,
      /^pub\s+(unsafe\s+)?fn\s+(\w+)/gm,
      /^pub\s+struct\s+(\w+)/gm,
      /^pub\s+enum\s+(\w+)/gm,
      /^pub\s+trait\s+(\w+)/gm,
      /^pub\s+type\s+(\w+)/gm,
      /^pub\s+(const|static)\s+(\w+)/gm,
      /^pub\s+(use|mod)\s+(\w+)/gm,
    ],
    imports: [
      /^use\s+(\S+)/gm,
      /^extern\s+crate\s+(\w+)/gm,
    ],
    types: [
      /^struct\s+(\w+)/gm,
      /^enum\s+(\w+)/gm,
      /^trait\s+(\w+)/gm,
    ],
    frameworks: {
      'actix': [/actix/],
      'axum': [/axum/],
      'tokio': [/tokio/],
      'serde': [/serde/],
      'rocket': [/rocket/],
      'tower': [/tower/],
    },
    postProcess: (ctx) => {
      // Parse grouped Rust imports:  use std::io::{self, BufRead};
      // The simple regex only catches `use std::io`, not the grouped braces.
      // Heuristic: find all paths starting with a crate name inside use blocks
      const useBlock = ctx.source.match(/^use\s+(\w+(?:::\w+)*)\s*::\s*\{([^}]*)\}/gm);
      if (useBlock) {
        for (const line of useBlock) {
          const prefix = line.match(/^use\s+((?:\w+::)*\w+)/);
          const bodyMatch = line.match(/\{([^}]*)\}/);
          if (prefix && bodyMatch) {
            const base = prefix[1] || '';
            const items = (bodyMatch[1] || '').split(',').map(s => {
              const trimmed = s.trim();
              return trimmed.startsWith('self') ? base : `${base}::${trimmed}`;
            });
            for (const item of items) {
              if (item && !ctx.imports.includes(item)) ctx.imports.push(item);
            }
          }
        }
      }
    },
  },

  // ── Java ─────────────────────────────────────────────────────────
  java: {
    exports: [
      /^public\s+(static\s+)?(void|int|String|boolean|long|double|float|char|byte|short|\w+)\s+(\w+)\s*\(/gm,
    ],
    imports: [
      /^import\s+([^;]+);/gm,
    ],
    types: [
      /(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/g,
      /(?:public\s+)?interface\s+(\w+)/g,
      /(?:public\s+)?enum\s+(\w+)/g,
      /(?:public\s+)?@interface\s+(\w+)/g,
    ],
    frameworks: {
      'spring': [/spring/i, /springframework/],
      'jakarta': [/jakarta/],
      'junit': [/junit/],
      'hibernate': [/hibernate/],
    },
  },

  // ── C# ───────────────────────────────────────────────────────────
  csharp: {
    exports: [
      /^public\s+(static\s+)?(void|int|string|bool|Task|Task<\w+>|\w+)\s+(\w+)\s*\(/gm,
    ],
    imports: [
      /^using\s+([^;]+);/gm,
    ],
    types: [
      /(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/g,
      /(?:public\s+)?interface\s+(\w+)/g,
      /(?:public\s+)?enum\s+(\w+)/g,
      /(?:public\s+)?record\s+(\w+)/g,
      /(?:public\s+)?struct\s+(\w+)/g,
    ],
    frameworks: {
      'aspnet': [/aspnet/, /Microsoft\.AspNet/],
      'entityframework': [/EntityFramework/],
      'xunit': [/xunit/],
    },
  },

  // ── Ruby ─────────────────────────────────────────────────────────
  ruby: {
    exports: [
      /^(?:def\s+self\.)?(\w+)\s*$/gm,
      /^class\s+(\w+)/gm,
      /^module\s+(\w+)/gm,
      /^\s*attr_(?:reader|writer|accessor)\s+:(\w+)/gm,
    ],
    imports: [
      /^require\s+['"]([^'"]+)['"]/gm,
      /^require_relative\s+['"]([^'"]+)['"]/gm,
      /^include\s+(\w+)/gm,
    ],
    types: [
      /^class\s+(\w+)/gm,
      /^module\s+(\w+)/gm,
    ],
    frameworks: {
      'rails': [/rails/, /ActiveRecord/],
      'sinatra': [/sinatra/],
      'rspec': [/rspec/],
    },
  },

  // ── PHP ──────────────────────────────────────────────────────────
  php: {
    exports: [
      /^function\s+(\w+)/gm,
      /^class\s+(\w+)/gm,
      /^interface\s+(\w+)/gm,
      /^trait\s+(\w+)/gm,
    ],
    imports: [
      /^use\s+([^;]+);/gm,
      /^require_once\s+['"]([^'"]+)['"]/gm,
      /^include\s+['"]([^'"]+)['"]/gm,
    ],
    types: [
      /^class\s+(\w+)/gm,
      /^interface\s+(\w+)/gm,
      /^trait\s+(\w+)/gm,
    ],
    frameworks: {
      'laravel': [/laravel/],
      'symfony': [/symfony/],
      'wordpress': [/wp_/],
    },
  },

  // ── Kotlin ───────────────────────────────────────────────────────
  kotlin: {
    exports: [
      /^fun\s+(\w+)/gm,
      /^class\s+(\w+)/gm,
      /^interface\s+(\w+)/gm,
      /^data\s+class\s+(\w+)/gm,
      /^object\s+(\w+)/gm,
    ],
    imports: [
      /^import\s+([^\n]+)/gm,
    ],
    types: [
      /^class\s+(\w+)/gm,
      /^interface\s+(\w+)/gm,
      /^data\s+class\s+(\w+)/gm,
      /^sealed\s+class\s+(\w+)/gm,
    ],
    frameworks: {
      'ktor': [/ktor/],
      'android': [/android/],
      'kotlinx': [/kotlinx/],
    },
  },

  // ── Swift ────────────────────────────────────────────────────────
  swift: {
    exports: [
      /^public\s+(func|class|struct|enum|protocol|extension)\s+(\w+)/gm,
      /^func\s+(\w+)/gm,
    ],
    imports: [
      /^import\s+(\w+)/gm,
    ],
    types: [
      /^class\s+(\w+)/gm,
      /^struct\s+(\w+)/gm,
      /^enum\s+(\w+)/gm,
      /^protocol\s+(\w+)/gm,
    ],
    frameworks: {
      'swiftui': [/SwiftUI/],
      'uikit': [/UIKit/],
      'combine': [/Combine/],
    },
  },

  // ── Generic / unknown languages ──────────────────────────────────
  generic: {
    exports: [],
    imports: [
      /^import\s+(?:.*from\s+)?['"]([^'"]+)['"]/gm,
      /^#include\s+[<"]([^>"]+)[>"]/gm,
    ],
    types: [
      /^class\s+(\w+)/gm,
      /^(?:pub\s+)?(?:struct|interface|enum)\s+(\w+)/gm,
    ],
    frameworks: {},
  },

  // ── C / C++ ──────────────────────────────────────────────────────
  c: {
    exports: [],
    imports: [
      /^#include\s+[<"]([^>"]+)[>"]/gm,
    ],
    types: [
      /^(?:typedef\s+)?(?:struct|enum|union)\s+(\w+)/gm,
    ],
    frameworks: {},
  },

  cpp: {
    exports: [],
    imports: [
      /^#include\s+[<"]([^>"]+)[>"]/gm,
    ],
    types: [
      /^class\s+(\w+)/gm,
      /^(?:struct|enum|union)\s+(\w+)/gm,
    ],
    frameworks: {},
  },

  // ── Elixir ──────────────────────────────────────────────────────
  elixir: {
    exports: [
      /^def\s+(\w+)/gm,
      /^defp\s+(\w+)/gm,
      /^defmodule\s+(\w+)/gm,
      /^defstruct\s+(\w+)/gm,
    ],
    imports: [
      /^alias\s+(\S+)/gm,
      /^use\s+(\S+)/gm,
      /^require\s+(\S+)/gm,
      /^import\s+(\S+)/gm,
    ],
    types: [
      /^defmodule\s+(\w+)/gm,
      /^defstruct\s+(\w+)/gm,
      /^defprotocol\s+(\w+)/gm,
      /^defimpl\s+(\w+)/gm,
    ],
    frameworks: {
      'phoenix': [/phoenix/],
      'ecto': [/ecto/],
    },
  },
};

// ── Framework detection ──────────────────────────────────────────────
export function detectLanguageFrameworks(imports: string[], language: string): string[] {
  const langCfg: LangPatterns = (PATTERNS[language] ?? PATTERNS.generic)!;
  const detected: string[] = [];
  for (const [framework, patterns] of Object.entries(langCfg.frameworks)) {
    for (const pattern of patterns) {
      if (imports.some(i => pattern.test(i))) {
        detected.push(framework);
        break;
      }
    }
  }
  return detected;
}

// ── Main analyzer ────────────────────────────────────────────────────
export function analyzeFile(filePath: string, content?: string): FileSummary {
  const source = content || fs.readFileSync(filePath, 'utf-8');
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  const ext = path.extname(filePath).toLowerCase();
  const language = LANG_MAP[ext] || 'generic';
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const patterns: LangPatterns = PATTERNS[language]!;  // guaranteed match via 'generic' fallback in LANG_MAP

  // Extract exports
  const exports: string[] = [];
  for (const pattern of patterns.exports) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const name = match[match.length - 1]; // Last capture group is the name
      if (name && !exports.includes(name)) exports.push(name);
    }
  }

  // Extract imports
  const imports: string[] = [];
  for (const pattern of patterns.imports) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const mod = match[1];
      if (mod && !imports.includes(mod)) imports.push(mod);
    }
  }

  // Extract key types
  const keyTypes: string[] = [];
  for (const pattern of patterns.types) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const typeName = match[1];
      if (typeName && !keyTypes.includes(typeName)) keyTypes.push(typeName);
    }
  }

  // Language-specific post-processing (grouped imports, etc.)
  if (patterns.postProcess) {
    patterns.postProcess({ imports, exports, keyTypes, source });
  }

  // Generate heuristic summary
  const summary = generateSummary(relPath, language, exports, keyTypes, source);

  // Determine purpose from path + exports
  const purpose = determinePurpose(relPath, exports);

  return {
    path: relPath,
    language,
    summary,
    purpose,
    exports,
    imports,
    keyTypes,
  };
}

function generateSummary(relPath: string, language: string, exports: string[], keyTypes: string[], source: string): string {
  const parts: string[] = [];
  const fileName = path.basename(relPath);
  const dirName = path.dirname(relPath);

  // Try to extract top comment/docstring based on language
  const docComment = extractTopComment(source, language);
  if (docComment && docComment.length < 200) {
    parts.push(docComment);
  }

  // Export-based description
  if (exports.length > 0) {
    parts.push(`Exports: ${exports.slice(0, 5).join(', ')}${exports.length > 5 ? `, +${exports.length - 5} more` : ''}`);
  }

  // Type declarations
  if (keyTypes.length > 0) {
    parts.push(`Defines: ${keyTypes.slice(0, 3).join(', ')}`);
  }

  return parts.join(' — ') || `${fileName} — ${dirName === '.' ? 'root' : dirName} module (${Math.max(1, source.split('\n').length)} lines, ${language})`;
}

/**
 * Extract the top comment/docstring from source, language-aware.
 */
function extractTopComment(source: string, language: string): string | null {
  // Python docstrings
  if (language === 'python') {
    const py = source.match(/^"""(.*?)"""/s)?.[1];
    if (py) return py.replace(/^[\s"]+|[\s"]+$/g, '').split('\n')[0] || null;
    const py2 = source.match(/^'''(.*?)'''/s)?.[1];
    if (py2) return py2.replace(/^[\s']+|[\s']+$/g, '').split('\n')[0] || null;
  }

  // Rust doc comments
  if (language === 'rust') {
    const rustLine = source.match(/^\/\/\/\s(.+)/)?.[1];
    if (rustLine) return rustLine.trim();
    const rustBlock = source.match(/^\/\*[\s\S]*?\*\//)?.[0];
    if (rustBlock) return rustBlock.replace(/\/\*|\*\/|\s*\*\s?/g, '').trim();
  }

  // Go / C-style block comments
  if (['go', 'c', 'cpp', 'java', 'csharp', 'kotlin', 'swift'].includes(language)) {
    const goLine = source.match(/^\/\/\s(.+)/)?.[1];
    if (goLine) return goLine.trim();
    const goBlock = source.match(/^\/\*[\s\S]*?\*\//)?.[0];
    if (goBlock) {
      const text = goBlock.replace(/\/\*|\*\/|\s*\*\s?/g, '');
      const firstLine = text.split('\n').shift() || '';
      return firstLine.trim() || null;
    }
  }

  // TypeScript / JavaScript JSDoc
  if (['typescript', 'javascript'].includes(language)) {
    const jsdoc = source.match(/\/\*\*[\s\S]*?\*\//)?.[0];
    if (jsdoc) return jsdoc.replace(/\/\*\*|\*\/|\s*\*\s?/g, '').trim();
  }

  // Ruby / Elixir hash comments
  if (['ruby', 'elixir', 'php'].includes(language)) {
    const hashLine = source.match(/^#\s+(.+)/m)?.[1];
    if (hashLine) return hashLine.trim();
  }

  return null;
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

/**
 * Legacy framework detection (for JS/TS projects).
 * Delegates to the language-aware function with 'typescript' patterns.
 */
export function detectFramework(imports: string[]): string[] {
  return detectLanguageFrameworks(imports, 'typescript');
}
