export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}

/**
 * 最小的 SQL 執行介面。
 * - 原生 App：CapacitorSqliteDriver（@capacitor-community/sqlite）
 * - 單元測試：sql.js（WASM SQLite），驗證同一套 SQL
 */
export interface SqlDriver {
  open(): Promise<void>;
  close(): Promise<void>;
  /** 執行不帶參數的多條 SQL（建立資料表等） */
  exec(sql: string): Promise<void>;
  query<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** 在同一個交易中執行多條語句；任何一條失敗必須全部回滾 */
  transaction(statements: SqlStatement[]): Promise<void>;
}
