import fs from 'fs';
import path from 'path';

/**
 * Start watching the project root for file changes.
 * Returns the FSWatcher instance for cleanup.
 */
export function startWatcher(
  root: string,
  onChange: (changedPaths: string[]) => Promise<void>,
  opts?: {
    debounceMs?: number;
    excludePatterns?: string[];
  },
): fs.FSWatcher {
  const debounceMs = opts?.debounceMs ?? 1000;
  const excludePatterns = opts?.excludePatterns ?? ['node_modules', '.git', 'dist'];

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const changedPaths = new Set<string>();

  const watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    const relativePath = filename.replace(/\\/g, '/');

    // Check exclude patterns
    for (const pattern of excludePatterns) {
      if (relativePath.startsWith(pattern) || relativePath.includes('/' + pattern + '/')) {
        return;
      }
    }

    changedPaths.add(relativePath);

    // Debounce
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const paths = Array.from(changedPaths);
      changedPaths.clear();
      if (paths.length > 0) {
        try {
          await onChange(paths);
        } catch {
          // onChange errors shouldn't crash the watcher
        }
      }
    }, debounceMs);
  });

  return watcher;
}

/**
 * Stop the file watcher.
 */
export function stopWatcher(watcher: fs.FSWatcher): void {
  watcher.close();
}
