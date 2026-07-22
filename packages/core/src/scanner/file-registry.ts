import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import ignore from 'ignore';

export type FileType = 'source' | 'test' | 'doc' | 'config' | 'asset' | 'unknown';

export interface FileEntry {
  path: string;
  hash: string;
  size: number;
  type: FileType;
  last_indexed_at: string;
}

/**
 * Classify a file by its path and extension.
 */
export function classifyFile(filePath: string): FileType {
  const name = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Test files (check before source since they share extensions)
  const testPatterns = /\.(test|spec)\.(ts|js|tsx|jsx)$/;
  if (testPatterns.test(filePath)) return 'test';
  if (name.endsWith('_test.go') || name.endsWith('_test.py') || name.endsWith('.test.py')) return 'test';

  // Source files
  const sourceExts = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.php', '.c', '.cpp', '.h', '.hpp', '.swift', '.kt', '.scala', '.ex', '.exs'];
  if (sourceExts.includes(ext)) return 'source';

  // Doc files
  const docExts = ['.md', '.mdx', '.txt', '.rst', '.adoc'];
  if (docExts.includes(ext)) return 'doc';

  // Config files
  const configNames = ['.json', '.toml', '.yaml', '.yml', '.ini', '.cfg', '.conf'];
  if (configNames.includes(ext)) return 'config';
  if (name.startsWith('.env')) return 'config';

  // Asset files
  const assetExts = ['.css', '.scss', '.less', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.eot', '.ttf'];
  if (assetExts.includes(ext)) return 'asset';

  return 'unknown';
}

/**
 * Compute SHA-256 hash of file content.
 * For large files, only hashes first 4KB for performance.
 * For asset files (images, fonts), hashes first 4KB.
 */
export async function hashFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const assetExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.eot', '.ttf'];

  const hash = createHash('sha256');

  if (assetExts.includes(ext)) {
    // Only read first 4KB for assets
    const fd = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    await fd.read(buffer, 0, 4096, 0);
    await fd.close();
    hash.update(buffer);
  } else {
    const content = await fs.readFile(filePath);
    hash.update(content);
  }

  return hash.digest('hex');
}

/**
 * Read .gitignore patterns and return an ignore filter.
 * Walks up from root to find .gitignore, returns empty filter if not found.
 */
export async function parseGitignore(root: string): Promise<ReturnType<typeof ignore>> {
  const ig = ignore();

  try {
    const gitignorePath = path.join(root, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');
    ig.add(content);
  } catch {
    // No .gitignore found — that's fine
  }

  return ig;
}

/**
 * Walk the entire project tree, hashing and classifying every file.
 * Respects .gitignore patterns and configured exclude patterns.
 */
export async function walkProject(
  root: string,
  opts?: {
    excludePatterns?: string[];
    maxFileSizeMb?: number;
    followSymlinks?: boolean;
  },
): Promise<FileEntry[]> {
  const maxSizeBytes = (opts?.maxFileSizeMb ?? 10) * 1024 * 1024;
  const ig = await parseGitignore(root);

  // Add configured exclude patterns
  if (opts?.excludePatterns) {
    ig.add(opts.excludePatterns);
  }

  // Always exclude node_modules and .git
  ig.add(['node_modules', '.git', 'dist', 'build', 'coverage', '.nyc_output']);

  const entries: FileEntry[] = [];
  const now = new Date().toISOString();

  // Use glob to discover all files
  const results = await glob('**/*', {
    cwd: root,
    nodir: true,
    dot: true,
    follow: opts?.followSymlinks ?? false,
    absolute: false,
  });

  for (const relativePath of results) {
    // Check ignore filter
    if (ig.ignores(relativePath)) continue;

    const absolutePath = path.join(root, relativePath);

    try {
      const stat = await fs.stat(absolutePath);

      // Skip files larger than max
      if (stat.size > maxSizeBytes) continue;

      // Skip symlinks if not following them
      if (stat.isSymbolicLink() && !opts?.followSymlinks) continue;

      const fileHash = await hashFile(absolutePath);

      entries.push({
        path: relativePath.replace(/\\/g, '/'),
        hash: fileHash,
        size: stat.size,
        type: classifyFile(relativePath),
        last_indexed_at: now,
      });
    } catch {
      // Skip files we can't read
    }
  }

  return entries;
}
