import Database from 'better-sqlite3';
import { generateId } from '../db.js';
import { safeParseJson } from '../utils/json.js';

export interface Blocker {
  id: string;
  title: string;
  description: string;
  age_hours: number;
  blocked_by: string;
  status: 'open' | 'resolved';
  linked_entities: string[];
  created_at: string;
}

function parseBlocker(row: any): Blocker {
  return {
    ...row,
    age_hours: row.created_at
      ? Math.max(0, Math.round((Date.now() - new Date(row.created_at + 'Z').getTime()) / 3600000))
      : 0,
    linked_entities: safeParseJson(row.linked_entities, []),
  };
}

export function createBlocker(
  db: Database.Database,
  data: { title: string; description?: string; blocked_by?: string; links?: string[] },
): Blocker {
  const id = generateId(db, 'BLK');
  db.prepare(`
    INSERT INTO blockers (id, title, description, blocked_by, linked_entities)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.title, data.description ?? '', data.blocked_by ?? '', JSON.stringify(data.links ?? []));

  return getBlocker(db, id)!;
}

export function getBlocker(db: Database.Database, id: string): Blocker | undefined {
  const row = db.prepare('SELECT * FROM blockers WHERE id = ?').get(id) as any;
  return row ? parseBlocker(row) : undefined;
}

export function resolveBlocker(db: Database.Database, id: string): void {
  const result = db.prepare('UPDATE blockers SET status = ? WHERE id = ? AND status = ?').run('resolved', id, 'open');
  if (result.changes === 0) {
    const existing = db.prepare('SELECT status FROM blockers WHERE id = ?').get(id) as any;
    if (!existing) throw new Error(`Blocker ${id} not found`);
    if (existing.status === 'resolved') return; // already resolved, no-op
  }
}

export function getActiveBlockers(
  db: Database.Database,
  opts?: { min_age_hours?: number; limit?: number },
): Blocker[] {
  let sql = 'SELECT * FROM blockers WHERE status = ?';
  const params: any[] = ['open'];

  if (opts?.min_age_hours !== undefined) {
    sql += ' AND age_hours >= ?';
    params.push(opts.min_age_hours);
  }

  sql += ' ORDER BY created_at ASC';  // Oldest first — most urgent

  if (opts?.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }

  return (db.prepare(sql).all(...params) as any[]).map(parseBlocker);
}

export function getBlockers(
  db: Database.Database,
  opts?: { status?: 'open' | 'resolved' | 'all'; limit?: number },
): Blocker[] {
  let sql = 'SELECT * FROM blockers WHERE 1=1';
  const params: any[] = [];

  if (opts?.status && opts.status !== 'all') {
    sql += ' AND status = ?';
    params.push(opts.status);
  }

  sql += ' ORDER BY created_at DESC';

  if (opts?.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }

  return (db.prepare(sql).all(...params) as any[]).map(parseBlocker);
}
