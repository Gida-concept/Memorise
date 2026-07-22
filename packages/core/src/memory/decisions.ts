import Database from 'better-sqlite3';
import { generateId } from '../db.js';
import { safeParseJson } from '../utils/json.js';

export interface Decision {
  id: string;
  title: string;
  body: string;
  author: string | null;
  made_at: string;
  linked_entities: string[];
  created_at: string;
}

function parseDecision(row: any): Decision {
  return {
    ...row,
    linked_entities: safeParseJson(row.linked_entities, []),
  };
}

export function createDecision(
  db: Database.Database,
  data: { title: string; body?: string; author?: string; links?: string[] },
): Decision {
  if (!data.title || data.title.trim() === '') {
    throw new Error('Decision title is required');
  }
  const id = generateId(db, 'ADR');
  const body = data.body ?? '';
  const author = data.author ?? null;
  const madeAt = new Date().toISOString();
  const links = JSON.stringify(data.links ?? []);

  db.prepare(`
    INSERT INTO decisions (id, title, body, author, made_at, linked_entities)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.title, body, author, madeAt, links);

  return getDecision(db, id)!;
}

export function getDecision(db: Database.Database, id: string): Decision | undefined {
  const row = db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as any;
  return row ? parseDecision(row) : undefined;
}

export function listDecisions(
  db: Database.Database,
  opts?: { limit?: number; since?: string; author?: string },
): Decision[] {
  let sql = 'SELECT * FROM decisions WHERE 1=1';
  const params: any[] = [];

  if (opts?.since) {
    sql += ' AND made_at >= ?';
    params.push(opts.since);
  }
  if (opts?.author) {
    sql += ' AND author = ?';
    params.push(opts.author);
  }

  sql += ' ORDER BY made_at DESC';

  if (opts?.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }

  return (db.prepare(sql).all(...params) as any[]).map(parseDecision);
}

export function linkEntityToDecision(
  db: Database.Database,
  decisionId: string,
  entityId: string,
): void {
  const decision = getDecision(db, decisionId);
  if (!decision) throw new Error(`Decision ${decisionId} not found`);

  const current = decision.linked_entities;
  if (!current.includes(entityId)) {
    current.push(entityId);
    db.prepare('UPDATE decisions SET linked_entities = ? WHERE id = ?')
      .run(JSON.stringify(current), decisionId);
  }
}
