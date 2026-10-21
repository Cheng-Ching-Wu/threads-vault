import type {
  AutoRule,
  Bookmark,
  BookmarkFolder,
  BookmarkTag,
  Folder,
  ImportJob,
  Tag,
  VaultSnapshot,
} from '@/shared/types/models';

/**
 * 資料存取抽象層。
 *
 * - 本機模式，Web：IndexedDbVaultRepository
 * - 本機模式，Android / iOS：SqliteVaultRepository
 * - 雲端同步模式：FirestoreVaultRepository
 *
 * 業務邏輯（匯入、批次分類、備份）只依賴這個介面，Vue 元件也不直接碰資料庫。
 * 所有「批次」方法都必須是原子操作：要嘛全部成功，要嘛完全不改變資料。
 * （Firestore 例外：資料量超過單批上限時會分批送出，詳見 FirestoreVaultRepository 的說明。）
 */
export interface VaultRepository {
  readonly kind: 'indexeddb' | 'sqlite' | 'firestore' | 'memory';

  init(): Promise<void>;
  close(): Promise<void>;

  // ── 收藏 ──────────────────────────────────────────
  listBookmarks(): Promise<Bookmark[]>;
  getBookmark(id: string): Promise<Bookmark | null>;
  countBookmarks(): Promise<number>;
  /** 依貼文代碼或 fbid 找出既有收藏（匯入去重用） */
  findBookmarksByIdentity(keys: { platformPostIds: string[]; fbids: string[] }): Promise<Bookmark[]>;
  /** 新增或更新多筆收藏（以 id 為準），單一交易 */
  putBookmarks(bookmarks: Bookmark[]): Promise<void>;
  /** 刪除收藏並一併移除它的資料夾 / 標籤關聯，單一交易 */
  deleteBookmarks(ids: string[]): Promise<void>;

  // ── 資料夾 ────────────────────────────────────────
  listFolders(): Promise<Folder[]>;
  putFolder(folder: Folder): Promise<void>;
  /** 刪除資料夾與其關聯；不會刪除收藏本身 */
  deleteFolder(id: string): Promise<void>;

  // ── 標籤 ──────────────────────────────────────────
  listTags(): Promise<Tag[]>;
  putTag(tag: Tag): Promise<void>;
  /** 刪除標籤與其關聯；不會刪除收藏本身 */
  deleteTag(id: string): Promise<void>;

  // ── 關聯 ──────────────────────────────────────────
  listBookmarkFolders(): Promise<BookmarkFolder[]>;
  listBookmarkTags(): Promise<BookmarkTag[]>;
  addBookmarkFolders(links: BookmarkFolder[]): Promise<void>;
  removeBookmarkFolders(bookmarkIds: string[], folderId: string): Promise<void>;
  addBookmarkTags(links: BookmarkTag[]): Promise<void>;
  removeBookmarkTags(bookmarkIds: string[], tagId: string): Promise<void>;

  // ── 匯入紀錄 ──────────────────────────────────────
  listImportJobs(): Promise<ImportJob[]>;
  putImportJob(job: ImportJob): Promise<void>;

  /**
   * 匯入專用：在「同一個交易」中寫入收藏、資料夾、標籤與關聯。
   * 任何一步失敗都必須回滾，確保既有資料不被破壞。
   */
  applyImport(batch: {
    bookmarks: Bookmark[];
    folders: Folder[];
    tags: Tag[];
    bookmarkFolders: BookmarkFolder[];
    bookmarkTags: BookmarkTag[];
  }): Promise<void>;

  // ── 自動分類規則 ──────────────────────────────────
  /** 依 sortOrder 排序 */
  listAutoRules(): Promise<AutoRule[]>;
  /** 新增或更新多條規則（以 id 為準），單一交易 */
  putAutoRules(rules: AutoRule[]): Promise<void>;
  deleteAutoRule(id: string): Promise<void>;

  // ── 備份 ──────────────────────────────────────────
  exportSnapshot(): Promise<VaultSnapshot>;
  /** 以快照完全取代目前資料（單一交易） */
  replaceAll(snapshot: VaultSnapshot): Promise<void>;
  clearAll(): Promise<void>;
}
