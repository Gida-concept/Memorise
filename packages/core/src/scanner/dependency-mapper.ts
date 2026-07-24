import { DbWrapper } from '../db.js';
import fs from 'fs';
import path from 'path';

export interface DependencyEdge {
  source_path: string;
  target_path: string;
  import_type: 'static' | 'dynamic' | 'type_only';
}

/**
 * Resolve a bare import specifier to a file path within the project.
 * Handles: ./relative, ../relative, absolute-from-root.
 */
export function resolveImport(
  importerPath: string,
  importSpecifier: string,
  root: string,
): string | null {
  // Only resolve relative imports
  if (!importSpecifier.startsWith('./') && !importSpecifier.startsWith('../')) {
    return null; // bare package name — cannot resolve without node_modules
  }

  const importerDir = path.dirname(importerPath);
  const resolved = path.resolve(root, importerDir, importSpecifier);

  // Try extensions in order
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

  // Try exact path first
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return path.relative(root, resolved).replace(/\\/g, '/');
  }

  // Try with extensions
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return path.relative(root, withExt).replace(/\\/g, '/');
    }
  }

  // Try index files in directory
  for (const ext of extensions) {
    const indexFile = path.join(resolved, `index${ext}`);
    if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
      return path.relative(root, indexFile).replace(/\\/g, '/');
    }
  }

  return null;
}

/**
 * Parse a single file for import statements using regex.
 */
export function parseImports(filePath: string): Array<{ specifier: string; type: 'static' | 'dynamic' | 'type_only' }> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const imports: Array<{ specifier: string; type: 'static' | 'dynamic' | 'type_only' }> = [];

    // Static imports: import ... from '...'
    const staticRegex = /from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = staticRegex.exec(content)) !== null) {
      imports.push({ specifier: match[1]!, type: 'static' });
    }

    // Dynamic imports: import('...')
    const dynamicRegex = /import\s*\(['"]([^'"]+)['"]\)/g;
    while ((match = dynamicRegex.exec(content)) !== null) {
      imports.push({ specifier: match[1]!, type: 'dynamic' });
    }

    // Type imports: import type ... from '...'
    const typeImportRegex = /import\s+type\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = typeImportRegex.exec(content)) !== null) {
      imports.push({ specifier: match[1]!, type: 'type_only' });
    }

    return imports;
  } catch {
    return [];
  }
}

/**
 * Shell to ripgrep to find import statements in the project.
 * Falls back to regex parsing if ripgrep is not available.
 */
export async function findImports(root: string, filePaths: string[]): Promise<DependencyEdge[]> {
  const edges: DependencyEdge[] = [];
  const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  for (const filePath of filePaths) {
    const ext = path.extname(filePath);
    if (!sourceExtensions.includes(ext)) continue;

    const absolutePath = path.join(root, filePath);
    if (!fs.existsSync(absolutePath)) continue;

    const imports = parseImports(absolutePath);

    for (const imp of imports) {
      const resolved = resolveImport(filePath, imp.specifier, root);
      if (resolved) {
        edges.push({
          source_path: filePath,
          target_path: resolved,
          import_type: imp.type,
        });
      }
    }
  }

  return edges;
}

/**
 * Find circular dependencies using BFS from dependency_edges table.
 */
export async function findCircularDependencies(db: DbWrapper): Promise<string[][]> {
  const edges = db.prepare('SELECT source_path, target_path FROM dependency_edges').all() as { source_path: string; target_path: string }[];

  // Build adjacency list (reverse direction for DFS)
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    const sources = graph.get(edge.target_path) || [];
    sources.push(edge.source_path);
    graph.set(edge.target_path, sources);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const parentMap = new Map<string, string>();

  function dfs(node: string) {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        parentMap.set(neighbor, node);
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle — reconstruct it
        const cycle: string[] = [];
        let current = node;
        while (current !== neighbor) {
          cycle.unshift(current);
          current = parentMap.get(current) || '';
          if (!current) break;
        }
        cycle.unshift(neighbor);
        cycle.push(neighbor);
        cycles.push(cycle);
      }
    }

    recursionStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Store dependency edges in the database (batch insert/replace).
 */
export function storeDependencyEdges(db: DbWrapper, edges: DependencyEdge[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO dependency_edges (source_path, target_path, import_type)
    VALUES (?, ?, ?)
  `);

  const batchSize = 500;
  for (let i = 0; i < edges.length; i += batchSize) {
    const batch = edges.slice(i, i + batchSize);
    db.transaction(() => {
      for (const edge of batch) {
        insert.run(edge.source_path, edge.target_path, edge.import_type);
      }
    })();
  }
}

/**
 * BFS traversal to find transitive dependencies from dependency_edges table.
 * `reverse=true` walks reverse edges (what imports this).
 * `reverse=false` walks forward edges (what this imports).
 * Returns a deduplicated array of file paths at depths 2+ (direct deps excluded).
 */
export function getTransitiveDependencies(
  db: DbWrapper,
  filePath: string,
  opts: { depth?: number; reverse?: boolean },
): string[] {
  const depth = opts.depth ?? 1;
  const reverse = opts.reverse ?? false;
  const transitive: string[] = [];

  if (depth > 1) {
    const visited = new Set<string>([filePath]);
    const lookupCol = reverse ? 'source_path' : 'target_path';
    const lookupQuery = reverse
      ? 'SELECT source_path FROM dependency_edges WHERE target_path = ?'
      : 'SELECT target_path FROM dependency_edges WHERE source_path = ?';

    // Get first-level deps (seeds for BFS -- these are direct, not transitive)
    let current = (db.prepare(lookupQuery).all(filePath) as any[]).map(r => r[lookupCol]);

    for (let d = 1; d < depth && current.length > 0; d++) {
      const next: string[] = [];
      for (const p of current) {
        if (visited.has(p)) continue;
        visited.add(p);
        const deps = db.prepare(lookupQuery).all(p) as any[];
        next.push(...deps.map(d => d[lookupCol]));
      }
      transitive.push(...next);
      current = next;
    }
  }

  return [...new Set(transitive)];
}

/**
 * Clear old dependency edges for a set of files (for incremental updates).
 */
export function clearEdgesForFiles(db: DbWrapper, filePaths: string[]): void {
  if (filePaths.length === 0) return;

  const deleteStmt = db.prepare('DELETE FROM dependency_edges WHERE source_path = ?');
  db.transaction(() => {
    for (const fp of filePaths) {
      deleteStmt.run(fp);
    }
  })();
}
