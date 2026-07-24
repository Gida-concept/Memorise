import { DbWrapper } from '../db.js';
import { walkProject, hashFile, parseGitignore, type FileEntry, type FileType } from './file-registry.js';
import { findImports, findCircularDependencies, storeDependencyEdges, clearEdgesForFiles } from './dependency-mapper.js';
import { detectEntryPoints, detectFramework, detectRole, storeArchitecture } from './architecture-detector.js';
import { buildProjectMap, type ProjectSemanticMap } from './project-map.js';
import { analyzeFile } from './semantic-analyzer.js';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

export interface ScanOptions {
  excludePatterns?: string[];
  maxFileSizeMb?: number;
  followSymlinks?: boolean;
  onProgress?: (current: number, total: number, message: string) => void;
}

export interface ScanResult {
  status: 'completed';
  mode: 'full' | 'incremental' | 'verify' | 'watch';
  total: number;
  new: number;
  modified: number;
  deleted: number;
  duration_seconds: number;
  summary: Record<FileType, number>;
  dependencies?: { total_edges: number; circular_count: number };
  architecture?: { framework: string | null; entry_points: string[] };
}

/**
 * Format ISO date string for SQLite
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * Full cold-start scan. Walks every file, hashes, classifies, maps deps,
 * detects architecture, indexes docs.
 */
export async function scan(
  db: DbWrapper,
  root: string,
  opts?: ScanOptions,
): Promise<ScanResult> {
  const startTime = Date.now();

  // Walk all files
  const entries = await walkProject(root, {
    excludePatterns: opts?.excludePatterns,
    maxFileSizeMb: opts?.maxFileSizeMb ?? 10,
    followSymlinks: opts?.followSymlinks ?? false,
  });

  // Clear existing data
  db.exec('DELETE FROM file_registry');
  db.exec('DELETE FROM dependency_edges');
  db.exec('DELETE FROM architecture_map');
  db.exec('DELETE FROM doc_index');
  db.exec('DELETE FROM doc_fts');

  // Batch insert file registry
  const insertFile = db.prepare(`
    INSERT INTO file_registry (path, hash, size, type, last_indexed_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const batchSize = 500;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    db.transaction(() => {
      for (const entry of batch) {
        insertFile.run(entry.path, entry.hash, entry.size, entry.type, entry.last_indexed_at);
        // Index doc files in FTS4 (sql.js WASM doesn't support FTS5)
        if (entry.type === 'doc') {
          indexDocFile(db, root, entry.path);
        }
      }
    })();

    if (opts?.onProgress) {
      opts.onProgress(Math.min(i + batchSize, entries.length), entries.length, 'Indexing files...');
    }
  }

  // Rebuild FTS4 index from doc_index (sql.js WASM doesn't support external-content FTS)
  db.exec('DELETE FROM doc_fts');
  db.prepare("INSERT INTO doc_fts (path, title, content) SELECT path, title, content FROM doc_index").run();

  // Map dependencies (only source files)
  const sourceFiles = entries
    .filter(e => e.type === 'source' || e.type === 'test')
    .map(e => e.path);

  const edges = await findImports(root, sourceFiles);
  storeDependencyEdges(db, edges);

  // Detect architecture
  const framework = detectFramework(root);
  const entryPoints = detectEntryPoints(entries.map(e => e.path));
  const archEntries = entries.map(e => ({
    path: e.path,
    role: detectRole(e.path, framework || undefined),
    framework,
    metadata: { type: e.type, size: e.size },
  }));
  storeArchitecture(db, archEntries);

  // Detect circular deps
  const circular = await findCircularDependencies(db);

  // Build summary
  const summary: Record<FileType, number> = {
    source: 0, test: 0, doc: 0, config: 0, asset: 0, unknown: 0,
  };
  for (const entry of entries) {
    summary[entry.type]++;
  }

  const duration = (Date.now() - startTime) / 1000;

  return {
    status: 'completed',
    mode: 'full',
    total: entries.length,
    new: entries.length,
    modified: 0,
    deleted: 0,
    duration_seconds: duration,
    summary,
    dependencies: { total_edges: edges.length, circular_count: circular.length },
    architecture: { framework, entry_points: entryPoints.map(e => e.path) },
  };
}

/**
 * Index a doc file for FTS4 search.
 */
function indexDocFile(db: DbWrapper, root: string, relativePath: string): void {
  try {
    const absolutePath = path.join(root, relativePath);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const title = path.basename(relativePath, path.extname(relativePath));

    // Extract first heading as title for .md files
    let finalTitle = title;
    if (relativePath.endsWith('.md') || relativePath.endsWith('.mdx')) {
      const headingMatch = content.match(/^#\s+(.+)/m);
      if (headingMatch) finalTitle = headingMatch[1]!;
    }

    const nowDate = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO doc_index (path, title, content, tokens, last_indexed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(relativePath, finalTitle, content.slice(0, 50000), '', nowDate);
  } catch {
    // Skip files that can't be read
  }
}

/**
 * Incremental scan. Only processes files whose hash has changed.
 */
export async function scanIncremental(
  db: DbWrapper,
  root: string,
  opts?: ScanOptions,
): Promise<ScanResult> {
  const startTime = Date.now();

  const entries = await walkProject(root, {
    excludePatterns: opts?.excludePatterns,
    maxFileSizeMb: opts?.maxFileSizeMb ?? 10,
    followSymlinks: opts?.followSymlinks ?? false,
  });

  // Get existing registry
  const existing = new Map(
    (db.prepare('SELECT path, hash FROM file_registry').all() as { path: string; hash: string }[])
      .map(r => [r.path, r.hash])
  );

  const existingPaths = new Set(existing.keys());
  const currentPaths = new Set(entries.map(e => e.path));

  // Find new, modified, and deleted files
  const newFiles = entries.filter(e => !existingPaths.has(e.path));
  const modifiedFiles = entries.filter(e => existingPaths.has(e.path) && existing.get(e.path) !== e.hash);
  const deletedFiles = [...existingPaths].filter(p => !currentPaths.has(p));

  const allChangedFiles = [...newFiles, ...modifiedFiles];
  const changedPaths = allChangedFiles.map(e => e.path);

  // Batch insert/update changed files
  const upsertFile = db.prepare(`
    INSERT OR REPLACE INTO file_registry (path, hash, size, type, last_indexed_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const batchSize = 500;
  for (let i = 0; i < allChangedFiles.length; i += batchSize) {
    const batch = allChangedFiles.slice(i, i + batchSize);
    db.transaction(() => {
      for (const entry of batch) {
        upsertFile.run(entry.path, entry.hash, entry.size, entry.type, entry.last_indexed_at);
        if (entry.type === 'doc') {
          indexDocFile(db, root, entry.path);
        }
      }
    })();
  }

  // Delete removed files
  for (const filePath of deletedFiles) {
    db.prepare('DELETE FROM file_registry WHERE path = ?').run(filePath);
    db.prepare('DELETE FROM dependency_edges WHERE source_path = ? OR target_path = ?').run(filePath, filePath);
    db.prepare('DELETE FROM architecture_map WHERE path = ?').run(filePath);
    db.prepare('DELETE FROM doc_index WHERE path = ?').run(filePath);
  }

  // Rebuild FTS4 from doc_index after any changes
  if (allChangedFiles.some(e => e.type === 'doc') || deletedFiles.length > 0) {
    db.exec('DELETE FROM doc_fts');
    db.prepare("INSERT INTO doc_fts (path, title, content) SELECT path, title, content FROM doc_index").run();
  }

  // Re-map dependencies for changed files
  if (changedPaths.length > 0) {
    const sourceChanged = changedPaths.filter(p => {
      const ext = path.extname(p).toLowerCase();
      return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext);
    });

    clearEdgesForFiles(db, sourceChanged);

    const edges = await findImports(root, sourceChanged);
    storeDependencyEdges(db, edges);

    // Update architecture for changed files
    const framework = detectFramework(root);
    const archEntries = allChangedFiles.map(e => ({
      path: e.path,
      role: detectRole(e.path, framework || undefined),
      framework,
      metadata: { type: e.type, size: e.size },
    }));

    if (archEntries.length > 0) {
      const upsertArch = db.prepare(`
        INSERT OR REPLACE INTO architecture_map (path, role, framework, metadata)
        VALUES (?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const entry of archEntries) {
          upsertArch.run(entry.path, entry.role, entry.framework, JSON.stringify(entry.metadata));
        }
      })();
    }
  }

  // Build summary
  const summary: Record<FileType, number> = {
    source: 0, test: 0, doc: 0, config: 0, asset: 0, unknown: 0,
  };
  for (const entry of entries) {
    summary[entry.type]++;
  }

  const duration = (Date.now() - startTime) / 1000;

  return {
    status: 'completed',
    mode: 'incremental',
    total: entries.length,
    new: newFiles.length,
    modified: modifiedFiles.length,
    deleted: deletedFiles.length,
    duration_seconds: duration,
    summary,
  };
}

/**
 * Verify mode. Compares file count on disk vs rows in file_registry.
 */
export async function verify(
  db: DbWrapper,
  root: string,
): Promise<{
  indexed_matching: number;
  new_on_disk: string[];
  deleted_from_disk: string[];
  modified_since_index: string[];
}> {
  // Get all indexed paths
  const indexed = new Set(
    (db.prepare('SELECT path FROM file_registry').all() as { path: string }[]).map(r => r.path)
  );

  // Get files on disk (without hashing, just existence)
  const ig = await parseGitignore(root);
  ig.add(['node_modules', '.git', 'dist', 'build', 'coverage']);

  const onDisk = new Set<string>();
  const diskResults = await glob('**/*', { cwd: root, nodir: true, dot: true, follow: false });
  for (const relativePath of diskResults) {
    if (!ig.ignores(relativePath)) {
      onDisk.add(relativePath);
    }
  }

  // Find differences
  const newOnDisk = [...onDisk].filter(p => !indexed.has(p));
  const deletedFromDisk = [...indexed].filter(p => !onDisk.has(p));

  // Check for modified files (hash changes)
  const modifiedSinceIndex: string[] = [];
  for (const filePath of onDisk) {
    if (!indexed.has(filePath)) continue;

    const row = db.prepare('SELECT hash FROM file_registry WHERE path = ?').get(filePath) as { hash: string } | undefined;
    if (row) {
      try {
        const currentHash = await hashFile(path.join(root, filePath));
        if (currentHash !== row.hash) {
          modifiedSinceIndex.push(filePath);
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return {
    indexed_matching: [...onDisk].filter(p => indexed.has(p)).length,
    new_on_disk: newOnDisk,
    deleted_from_disk: deletedFromDisk,
    modified_since_index: modifiedSinceIndex,
  };
}

/**
 * Semantic scan. Reads the file registry and produces a project-level
 * semantic map (frameworks, module organization, entry points, etc.).
 * Also stores per-file summaries in the file_summaries table.
 */
export async function semanticScan(
  db: DbWrapper,
  root: string,
): Promise<{ summaryCount: number; projectMap: ProjectSemanticMap }> {
  // Get registry from DB
  const registry = db.prepare('SELECT path, hash, size, type, last_indexed_at FROM file_registry').all() as FileEntry[];

  if (registry.length === 0) {
    return {
      summaryCount: 0,
      projectMap: {
        frameworks: [],
        entryPoints: [],
        moduleSummary: { totalFiles: 0, byPurpose: {}, byDirectory: {} },
        architectureLayers: [],
        lastUpdated: new Date().toISOString(),
        topExports: [],
        topInterfaces: [],
      },
    };
  }

  // Build the project map from registry
  const projectMap = await buildProjectMap(registry);

  // Store per-file summaries in DB (upsert)
  const upsertStmt = db.prepare(`
    INSERT OR REPLACE INTO file_summaries (path, summary, purpose, exports, imports, key_types, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let summaryCount = 0;
  const now = new Date().toISOString();

  for (const entry of registry) {
    const ext = entry.path.split('.').pop()?.toLowerCase();
    if (!ext || ['png', 'jpg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'eot', 'ttf', 'mp4', 'webm'].includes(ext)) {
      continue;
    }

    try {
      const summary = analyzeFile(entry.path);
      upsertStmt.run(
        summary.path,
        summary.summary,
        summary.purpose,
        JSON.stringify(summary.exports),
        JSON.stringify(summary.imports),
        JSON.stringify(summary.keyTypes),
        now,
      );
      summaryCount++;
    } catch {
      // Skip files that can't be analyzed
    }
  }

  return { summaryCount, projectMap };
}
