import { DbWrapper } from '../db.js';

export interface ScopeSnapshot {
  id: number;
  sprint_name: string;
  committed_days: number;
  remaining_days: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  captured_at: string;
}

export function captureScope(
  db: DbWrapper,
  data: { sprint_name: string; committed_days?: number; remaining_days?: number; risk?: 'LOW' | 'MEDIUM' | 'HIGH' },
): ScopeSnapshot {
  const remaining = data.remaining_days ?? 0;
  const committed = data.committed_days ?? 0;
  const ratio = committed > 0 ? ((committed - remaining) / committed) * 100 : 0;
  const risk = data.risk ?? (ratio <= 25 ? 'LOW' : ratio <= 50 ? 'MEDIUM' : 'HIGH');

  // Safety warning — detect stale callers passing same value for both
  if (committed > 0 && committed === remaining) {
    console.warn(
      `[pm-agent] Warning: committed_days (${committed}) equals remaining_days (${remaining}) — ` +
      `risk is 0% (LOW). Did you mean to pass a different value for --remaining / remaining_days?`
    );
  }

  const result = db.prepare(`
    INSERT INTO scope_snapshots (sprint_name, committed_days, remaining_days, risk)
    VALUES (?, ?, ?, ?)
  `).run(data.sprint_name, committed, remaining, risk);

  return db.prepare('SELECT * FROM scope_snapshots WHERE id = ?').get(result.lastInsertRowid) as ScopeSnapshot;
}

export function getLatestScope(db: DbWrapper): ScopeSnapshot | undefined {
  return db.prepare('SELECT * FROM scope_snapshots ORDER BY id DESC LIMIT 1').get() as ScopeSnapshot | undefined;
}

export function getScopeHistory(db: DbWrapper, sprintName?: string): ScopeSnapshot[] {
  let sql = 'SELECT * FROM scope_snapshots';
  const params: any[] = [];

  if (sprintName) {
    sql += ' WHERE sprint_name = ?';
    params.push(sprintName);
  }

  sql += ' ORDER BY captured_at DESC';
  return db.prepare(sql).all(...params) as ScopeSnapshot[];
}
