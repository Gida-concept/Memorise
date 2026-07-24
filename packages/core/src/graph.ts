import { DbWrapper } from './db.js';
import { safeParseJson } from './utils/json.js';
import type { Decision } from './memory/decisions.js';
import type { Blocker } from './memory/blockers.js';
import type { Note } from './memory/notes.js';
import type { Task } from './memory/tasks.js';

export interface RelatedEntities {
  decisions: Array<Pick<Decision, 'id' | 'title' | 'body' | 'author' | 'made_at'>>;
  blockers: Array<Pick<Blocker, 'id' | 'title' | 'age_hours' | 'blocked_by' | 'status'>>;
  notes: Array<Pick<Note, 'id' | 'content' | 'tags' | 'created_at'>>;
  tasks: Array<Pick<Task, 'id' | 'title' | 'status' | 'owner'>>;
}

export function getRelatedEntities(db: DbWrapper, entityId: string): RelatedEntities {
  const likePattern = `%"${entityId}"%`;

  const decisions = (db.prepare(
    `SELECT id, title, body, author, made_at FROM decisions WHERE linked_entities LIKE ?`,
  ).all(likePattern) as any[]).map(r => ({ ...r, tags: undefined }));

  const blockers = (db.prepare(
    `SELECT id, title, age_hours, blocked_by, status FROM blockers WHERE linked_entities LIKE ?`,
  ).all(likePattern) as any[]).map(r => ({ ...r }));

  const notes = (db.prepare(
    `SELECT id, content, tags, created_at FROM notes WHERE linked_entities LIKE ?`,
  ).all(likePattern) as any[]).map(r => ({ ...r, tags: safeParseJson(r.tags, []) }));

  const tasks = (db.prepare(
    `SELECT id, title, status, owner FROM tasks WHERE linked_entities LIKE ?`,
  ).all(likePattern) as any[]).map(r => ({ ...r }));

  return { decisions, blockers, notes, tasks };
}

export function expandGraph(
  db: DbWrapper,
  entityId: string,
  opts?: { depth?: number },
): Record<string, unknown> {
  const depth = opts?.depth ?? 1;
  const visited = new Set<string>();
  const result: Record<string, unknown> = {};

  function traverse(id: string, currentDepth: number): void {
    if (visited.has(id) || currentDepth > depth) return;
    visited.add(id);

    const related = getRelatedEntities(db, id);
    if (!result[id]) {
      result[id] = { related };
    }

    // Recurse into linked entity IDs found in all categories
    const allIds = [
      ...related.decisions.map((d) => d.id),
      ...related.blockers.map((b) => b.id),
      ...related.notes.map((n) => n.id),
      ...related.tasks.map((t) => t.id),
    ];

    for (const linkedId of allIds) {
      traverse(linkedId, currentDepth + 1);
    }
  }

  traverse(entityId, 0);
  return result;
}

export function getStandupData(
  db: DbWrapper,
  since?: string,
): {
  date: string;
  sprint: { name: string; remaining_days: number; risk: string } | null;
  yesterday: { decisions: Decision[]; blockers_resolved: Blocker[]; notes_count: number };
  today: string[];
  blockers: Blocker[];
} {
  const date = new Date().toISOString().slice(0, 10);
  const sinceTime = since || new Date(Date.now() - 86400000).toISOString();

  const latestScope = db.prepare('SELECT * FROM scope_snapshots ORDER BY captured_at DESC LIMIT 1').get() as any;
  const sprint = latestScope
    ? { name: latestScope.sprint_name, remaining_days: latestScope.remaining_days, risk: latestScope.risk }
    : null;

  const decisions = db.prepare(
    'SELECT * FROM decisions WHERE made_at >= ? ORDER BY made_at DESC',
  ).all(sinceTime) as any[];

  const blockersResolved = db.prepare(
    "SELECT * FROM blockers WHERE status = 'resolved' AND created_at >= ? ORDER BY created_at DESC",
  ).all(sinceTime) as any[];

  const notesCount = (db.prepare(
    'SELECT COUNT(*) as count FROM notes WHERE created_at >= ?',
  ).get(sinceTime) as any).count;

  const blockers = db.prepare(
    "SELECT * FROM blockers WHERE status = 'open' ORDER BY age_hours DESC",
  ).all() as any[];

  return {
    date,
    sprint,
    yesterday: {
      decisions: decisions.map((r: any) => ({ ...r, linked_entities: safeParseJson(r.linked_entities, []) })),
      blockers_resolved: blockersResolved.map((r: any) => ({ ...r, linked_entities: safeParseJson(r.linked_entities, []) })),
      notes_count: notesCount,
    },
    today: [],
    blockers: blockers.map((r: any) => ({ ...r, linked_entities: safeParseJson(r.linked_entities, []) })),
  };
}
