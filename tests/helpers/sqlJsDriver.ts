import initSqlJs, { type Database } from 'sql.js';
import type { SqlDriver, SqlStatement, SqlValue } from '@/database/adapters/sqlite/SqlDriver';

/** 測試用 SQLite 驅動（WASM），驗證與原生 App 相同的 SQL。 */
export class SqlJsDriver implements SqlDriver {
  private db: Database | null = null;

  async open(): Promise<void> {
    if (this.db) return;
    const SQL = await initSqlJs();
    this.db = new SQL.Database();
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private get conn(): Database {
    if (!this.db) throw new Error('not open');
    return this.db;
  }

  async exec(sql: string): Promise<void> {
    this.conn.exec(sql);
  }

  async query<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const stmt = this.conn.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  async transaction(statements: SqlStatement[]): Promise<void> {
    const db = this.conn;
    db.exec('BEGIN');
    try {
      for (const s of statements) db.run(s.sql, s.params ?? []);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
