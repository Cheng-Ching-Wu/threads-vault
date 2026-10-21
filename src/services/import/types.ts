import type { BookmarkSource, BookmarkStatus } from '@/shared/types/models';

/** 解析後、尚未寫入資料庫的一筆收藏。所有匯入來源都轉成這個格式。 */
export interface ImportCandidate {
  sourceIndex: number;
  platformPostId: string | null;
  fbid: string | null;
  originalUrl: string | null;
  canonicalUrl: string | null;
  author: string | null;
  title: string | null;
  content: string | null;
  savedAt: string | null;
  status: BookmarkStatus;
  source: BookmarkSource;
  /** 一般 JSON / CSV 匯入可附帶的使用者資料 */
  notes?: string | null;
  folderNames?: string[];
  tagNames?: string[];
}

export interface ImportFailure {
  index: number;
  reason: string;
}

export interface ParseResult {
  total: number;
  candidates: ImportCandidate[];
  failures: ImportFailure[];
  /** 檔案內部重複（同一貼文出現多次）的筆數 */
  duplicatesInFile: number;
  repairedTextCount: number;
  missingUrlCount: number;
}

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFormatError';
  }
}

/** 去重用的識別鍵：優先使用貼文代碼，其次 fbid。 */
export function candidateKeys(c: { platformPostId: string | null; fbid: string | null }): string[] {
  const keys: string[] = [];
  if (c.platformPostId) keys.push(`post:${c.platformPostId}`);
  if (c.fbid) keys.push(`fbid:${c.fbid}`);
  return keys;
}

/** 每處理一批資料就讓出主執行緒，避免大量匯入時 UI 卡住。 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
