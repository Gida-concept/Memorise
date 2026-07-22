import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors } from '../formatters.js';

export async function searchCommand(query: string, opts: Record<string, any>): Promise<void> {
  const ctx = getCommandContext(opts);

  try {
    const scope = opts.scope || 'all';
    const typeFilter = opts.type || undefined;
    const limit = opts.limit || 20;
    const results: Array<{ path: string; title: string | null; snippet: string; score: number }> = [];

    // Search docs via FTS5
    if (scope === 'all' || scope === 'docs') {
      try {
        const ftsResults = ctx.db.prepare(`
          SELECT doc_index.path, doc_index.title, snippet(doc_fts, 1, '>>>', '<<<', '...', 32) as snippet_text
          FROM doc_fts
          JOIN doc_index ON doc_index.rowid = doc_fts.rowid
          WHERE doc_fts MATCH ?
          LIMIT ?
        `).all(query, limit) as { path: string; title: string | null; snippet_text: string }[];

        for (const r of ftsResults) {
          results.push({ path: r.path, title: r.title, snippet: r.snippet_text, score: 1.0 });
        }
      } catch {
        // FTS5 might not be available or syntax error — fall back to LIKE search
        const likeResults = ctx.db.prepare(`
          SELECT path, title, content FROM doc_index
          WHERE content LIKE ?
          LIMIT ?
        `).all(`%${query}%`, limit) as { path: string; title: string | null; content: string }[];

        for (const r of likeResults) {
          const idx = r.content.toLowerCase().indexOf(query.toLowerCase());
          const snippet = idx >= 0
            ? '...' + r.content.slice(Math.max(0, idx - 32), idx + query.length + 32) + '...'
            : r.content.slice(0, 100);
          results.push({ path: r.path, title: r.title, snippet, score: 0.5 });
        }
      }
    }

    // Search file registry by path
    if (scope === 'all' || scope === 'code') {
      const fileResults = ctx.db.prepare(`
        SELECT path, type FROM file_registry
        WHERE path LIKE ? OR hash LIKE ?
        LIMIT ?
      `).all(`%${query}%`, `%${query}%`, limit) as { path: string; type: string }[];

      for (const r of fileResults) {
        // Avoid duplicates from doc search
        if (!results.some(ex => ex.path === r.path)) {
          results.push({ path: r.path, title: null, snippet: `Type: ${r.type}`, score: 0.3 });
        }
      }
    }

    // Filter by type if specified
    const filtered = typeFilter
      ? results.filter(r => {
          const entry = ctx.db.prepare('SELECT type FROM file_registry WHERE path = ?').get(r.path) as { type: string } | undefined;
          return entry?.type === typeFilter;
        })
      : results;

    const topResults = filtered.slice(0, limit);

    if (shouldOutputJson(opts)) {
      outputJson({ query, results: topResults, total: topResults.length }, opts);
    } else if (topResults.length === 0) {
      console.log(Colors.muted(`No results for "${query}"`));
    } else {
      console.log(Colors.highlight(`\n  Search results for "${query}":\n`));
      for (const r of topResults) {
        console.log(`  ${Colors.info(r.path)}`);
        if (r.title) console.log(`    Title: ${r.title}`);
        console.log(`    ${Colors.muted(r.snippet)}`);
        console.log('');
      }
      console.log(Colors.muted(`  ${topResults.length} result${topResults.length !== 1 ? 's' : ''}`));
    }
  } finally {
    closeCommandContext(ctx);
  }
}
