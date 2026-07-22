import Database from 'better-sqlite3';
import { generateId } from '../db.js';
import { safeParseJson } from '../utils/json.js';

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  owner: string;
  linked_entities: string[];
  created_at: string;
}

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in_progress', 'done'],
  in_progress: ['blocked', 'done', 'todo'],
  blocked: ['in_progress', 'todo'],
  done: ['todo'],
};

function parseTask(row: any): Task {
  return {
    ...row,
    linked_entities: safeParseJson(row.linked_entities, []),
  };
}

export function createTask(
  db: Database.Database,
  data: { title: string; owner?: string; links?: string[] },
): Task {
  const id = generateId(db, 'TASK');
  db.prepare(`
    INSERT INTO tasks (id, title, owner, linked_entities)
    VALUES (?, ?, ?, ?)
  `).run(id, data.title, data.owner ?? '', JSON.stringify(data.links ?? []));

  return getTask(db, id)!;
}

export function getTask(db: Database.Database, id: string): Task | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
  return row ? parseTask(row) : undefined;
}

export function updateTaskStatus(db: Database.Database, id: string, newStatus: TaskStatus): void {
  const task = getTask(db, id);
  if (!task) throw new Error(`Task ${id} not found`);

  const allowed = VALID_TRANSITIONS[task.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${task.status} → ${newStatus}. Allowed: ${allowed.join(', ')}`,
    );
  }

  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(newStatus, id);
}

export function getBlockedTasks(db: Database.Database): Task[] {
  return (db.prepare("SELECT * FROM tasks WHERE status = 'blocked' ORDER BY created_at DESC").all() as any[]).map(parseTask);
}

export function listTasks(
  db: Database.Database,
  opts?: { status?: TaskStatus; owner?: string },
): Task[] {
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params: any[] = [];

  if (opts?.status) {
    sql += ' AND status = ?';
    params.push(opts.status);
  }

  if (opts?.owner) {
    sql += ' AND owner = ?';
    params.push(opts.owner);
  }

  sql += ' ORDER BY created_at DESC';

  return (db.prepare(sql).all(...params) as any[]).map(parseTask);
}
