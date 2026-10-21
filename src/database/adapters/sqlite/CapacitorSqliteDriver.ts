import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { SqlDriver, SqlStatement, SqlValue } from './SqlDriver';

/**
 * Android / iOS 用的 SQLite 驅動。只會在原生平台以動態 import 載入，
 * Web 版不會打包或執行這段程式碼。
 */
export class CapacitorSqliteDriver implements SqlDriver {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private db: SQLiteDBConnection | null = null;

  constructor(private readonly dbName = 'threads_vault') {}

  async open(): Promise<void> {
    if (this.db) return;
    const consistent = (await this.sqlite.checkConnectionsConsistency()).result;
    const exists = (await this.sqlite.isConnection(this.dbName, false)).result;
    this.db =
      consistent && exists
        ? await this.sqlite.retrieveConnection(this.dbName, false)
        : await this.sqlite.createConnection(this.dbName, false, 'no-encryption', 1, false);
    await this.db.open();
  }

  async close(): Promise<void> {
    if (!this.db) return;
    await this.sqlite.closeConnection(this.dbName, false);
    this.db = null;
  }

  private get conn(): SQLiteDBConnection {
    if (!this.db) throw new Error('SQLite 尚未開啟');
    return this.db;
  }

  async exec(sql: string): Promise<void> {
    // 遷移腳本自行包含 BEGIN / COMMIT，因此不讓外掛再包一層交易
    await this.conn.execute(sql, false);
  }

  async query<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const res = await this.conn.query(sql, params);
    return (res.values ?? []) as T[];
  }

  async transaction(statements: SqlStatement[]): Promise<void> {
    if (statements.length === 0) return;
    // executeSet(..., transaction = true) 會在單一交易中執行，失敗即回滾
    await this.conn.executeSet(
      statements.map((s) => ({ statement: s.sql, values: s.params ?? [] })),
      true,
    );
  }
}
