/**
 * Threads Vault 的核心資料模型。
 * Web（IndexedDB）與原生（SQLite）兩種儲存都使用同一套型別。
 */

export type Platform = 'threads';
export type BookmarkStatus = 'normal' | 'missing_url';
export type BookmarkSource = 'meta_export' | 'json' | 'csv' | 'share' | 'manual';

export interface Bookmark {
  id: string;
  platform: Platform;
  /** 從 Threads 網址取得的貼文代碼（shortcode），例如 DetGsVPE0bP */
  platformPostId: string | null;
  /** Meta 匯出中的 fbid；不保證與 shortcode 有任何對應關係 */
  fbid: string | null;
  originalUrl: string | null;
  canonicalUrl: string | null;
  author: string | null;
  title: string | null;
  content: string | null;
  thumbnailUrl: string | null;
  savedAt: string | null;
  importedAt: string;
  updatedAt: string;
  notes: string | null;
  status: BookmarkStatus;
  source: BookmarkSource;
}

export interface Folder {
  id: string;
  name: string;
  /** ionicons 名稱，例如 folder-outline */
  icon: string;
  /** 十六進位色碼，例如 #4f46e5 */
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface BookmarkFolder {
  bookmarkId: string;
  folderId: string;
  createdAt: string;
}

export interface BookmarkTag {
  bookmarkId: string;
  tagId: string;
  createdAt: string;
}

export type ImportSourceType = 'meta_json' | 'json' | 'csv' | 'share';

export interface ImportCounts {
  total: number;
  added: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface ImportJob {
  id: string;
  sourceType: ImportSourceType;
  fileName: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: 'completed' | 'failed';
  counts: ImportCounts;
  repairedTextCount: number;
  missingUrlCount: number;
  errorMessage: string | null;
}

export type AutoRuleTarget = 'folder' | 'tag';
/** any：任一關鍵字出現就符合；all：所有關鍵字都要出現 */
export type AutoRuleMatchMode = 'any' | 'all';

/**
 * 自動分類規則：內文符合關鍵字時，把收藏放進資料夾或加上標籤。
 * 以名稱指向資料夾 / 標籤，不存在時套用規則會自動建立。
 * 資料夾規則依 sortOrder 排序，只套用第一條符合的；標籤規則全部套用。
 */
export interface AutoRule {
  id: string;
  targetType: AutoRuleTarget;
  targetName: string;
  keywords: string[];
  matchMode: AutoRuleMatchMode;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 完整資料快照，用於備份與還原。 */
export interface VaultSnapshot {
  bookmarks: Bookmark[];
  folders: Folder[];
  tags: Tag[];
  bookmarkFolders: BookmarkFolder[];
  bookmarkTags: BookmarkTag[];
  importJobs: ImportJob[];
  autoRules: AutoRule[];
}
