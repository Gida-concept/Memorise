/**
 * Project Semantic Map
 *
 * Aggregates per-file summaries into a project-level overview showing:
 * - Framework detection
 * - Module organization (by purpose/category)
 * - Entry points
 * - Architecture layers
 * - File counts by purpose
 */

import { analyzeFile, detectFramework } from './semantic-analyzer.js';
import type { FileEntry } from './file-registry.js';

export interface ProjectSemanticMap {
  frameworks: string[];
  entryPoints: string[];
  moduleSummary: {
    totalFiles: number;
    sourceFiles?: number;
    byPurpose: Record<string, number>;
    byDirectory: Record<string, number>;
  };
  architectureLayers: string[];
  lastUpdated: string;
  topExports: string[];
  topInterfaces: string[];
}

export async function buildProjectMap(
  registry: FileEntry[],
  config?: { contentFiles?: Map<string, string> }
): Promise<ProjectSemanticMap> {
  const byPurpose: Record<string, number> = {};
  const byDirectory: Record<string, number> = {};
  const allExports = new Set<string>();
  const allTypes = new Set<string>();
  const allImports = new Set<string>();

  let sourceCount = 0;

  for (const entry of registry) {
    // Skip assets, binary, and non-source files
    const ext = entry.path.split('.').pop()?.toLowerCase();
    if (!ext || ['png', 'jpg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'eot', 'ttf', 'mp4', 'webm'].includes(ext)) {
      continue;
    }

    sourceCount++;

    let content: string | undefined;
    if (config?.contentFiles?.has(entry.path)) {
      content = config.contentFiles.get(entry.path);
    }

    try {
      const summary = analyzeFile(entry.path, content);

      // Aggregate
      byPurpose[summary.purpose] = (byPurpose[summary.purpose] || 0) + 1;

      const dir = entry.path.includes('/') ? (entry.path.split('/')[0] || '.') : '.';
      byDirectory[dir] = (byDirectory[dir] || 0) + 1;

      summary.exports.forEach(e => allExports.add(e));
      summary.keyTypes.forEach(t => allTypes.add(t));
      summary.imports.forEach(i => allImports.add(i));
    } catch {
      // Skip files that can't be analyzed (binary, encoding issues)
    }
  }

  // Detect frameworks from imports
  const frameworks = detectFramework(Array.from(allImports));

  // Find entry points (index.ts, main.ts, app.ts etc.)
  const entryPoints = registry
    .filter(e => {
      const base = e.path.split('/').pop()?.toLowerCase();
      return base && ['index.ts', 'main.ts', 'app.ts', 'index.js', 'main.js', 'app.js'].includes(base);
    })
    .map(e => e.path);

  return {
    frameworks,
    entryPoints,
    moduleSummary: {
      totalFiles: registry.length,
      sourceFiles: sourceCount,
      byPurpose,
      byDirectory,
    },
    architectureLayers: Object.keys(byPurpose).sort(),
    lastUpdated: new Date().toISOString(),
    topExports: Array.from(allExports).slice(0, 50),
    topInterfaces: Array.from(allTypes).slice(0, 30),
  };
}
