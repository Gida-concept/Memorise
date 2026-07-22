import { loadConfig, openDb, closeDb, getDefaultDataDir } from '@pm-agent/core';
import { throwInputError, throwConfigError } from './db-utils.js';
import path from 'path';

export async function handleSearchCodebase(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!args.query) {
    throwInputError('Required parameter "query" missing');
  }

  try {
    const config = loadConfig();
    const dataDir = config.memory?.path || getDefaultDataDir(config.project.name);
    const dbPath = path.isAbsolute(dataDir) ? dataDir : path.resolve(config.project.root, dataDir);
    const db = openDb({ path: dbPath });

    try {
      const query = String(args.query);
      const scope = String(args.scope ?? 'all');
      const limit = (args.max_results as number) ?? 20;

      const results: Array<{ path: string; title: string | null; snippet: string }> = [];

      // FTS5 search
      if (scope === 'all' || scope === 'docs') {
        try {
          const ftsResults = db.prepare(`
            SELECT doc_index.path, doc_index.title, snippet(doc_fts, 1, '>>>', '<<<', '...', 32) as snippet_text
            FROM doc_fts
            JOIN doc_index ON doc_index.rowid = doc_fts.rowid
            WHERE doc_fts MATCH ?
            LIMIT ?
          `).all(query, limit) as { path: string; title: string | null; snippet_text: string }[];

          for (const r of ftsResults) {
            results.push({ path: r.path, title: r.title, snippet: r.snippet_text });
          }
        } catch {
          // Fallback LIKE search
          const likeResults = db.prepare(`
            SELECT path, title, content FROM doc_index WHERE content LIKE ? LIMIT ?
          `).all(`%${query}%`, limit) as { path: string; title: string | null; content: string }[];

          for (const r of likeResults) {
            const idx = r.content.toLowerCase().indexOf(query.toLowerCase());
            const snippet = idx >= 0
              ? r.content.slice(Math.max(0, idx - 40), idx + query.length + 40)
              : r.content.slice(0, 100);
            results.push({ path: r.path, title: r.title, snippet });
          }
        }
      }

      // File path search
      if (scope === 'all' || scope === 'code') {
        const fileResults = db.prepare(`
          SELECT path, type FROM file_registry WHERE path LIKE ? LIMIT ?
        `).all(`%${query}%`, limit) as { path: string; type: string }[];

        for (const r of fileResults) {
          if (!results.some(ex => ex.path === r.path)) {
            results.push({ path: r.path, title: null, snippet: `Type: ${r.type}` });
          }
        }
      }

      return { query, results: results.slice(0, limit), total: results.length };
    } finally {
      closeDb(db);
    }
  } catch (err) {
    throwConfigError((err as Error).message);
  }
}
