import { DbWrapper } from '../db.js';
import { generateId } from '../db.js';
import { safeParseJson } from '../utils/json.js';

export interface Note {
  id: string;
  content: string;
  tags: string[];
  linked_entities: string[];
  created_at: string;
}

function parseNote(row: any): Note {
  return {
    ...row,
    tags: safeParseJson(row.tags, []),
    linked_entities: safeParseJson(row.linked_entities, []),
  };
}

export function createNote(
  db: DbWrapper,
  data: { content: string; tags?: string[]; links?: string[] },
): Note {
  const id = generateId(db, 'NOTE');
  db.prepare(`
    INSERT INTO notes (id, content, tags, linked_entities)
    VALUES (?, ?, ?, ?)
  `).run(id, data.content, JSON.stringify(data.tags ?? []), JSON.stringify(data.links ?? []));

  return getNote(db, id)!;
}

export function getNote(db: DbWrapper, id: string): Note | undefined {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any;
  return row ? parseNote(row) : undefined;
}

export function searchNotes(
  db: DbWrapper,
  opts?: { tag?: string; search?: string; limit?: number; since?: string },
): Note[] {
  let sql = 'SELECT * FROM notes WHERE 1=1';
  const params: any[] = [];

  if (opts?.tag) {
    sql += ' AND tags LIKE ?';
    params.push(`%"${opts.tag}"%`);
  }

  if (opts?.search) {
    sql += ' AND content LIKE ?';
    params.push(`%${opts.search}%`);
  }

  if (opts?.since) {
    sql += ' AND created_at >= ?';
    params.push(opts.since);
  }

  sql += ' ORDER BY created_at DESC';

  if (opts?.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }

  return (db.prepare(sql).all(...params) as any[]).map(parseNote);
}

export function getNotesByTag(db: DbWrapper, tag: string): Note[] {
  return searchNotes(db, { tag });
}
