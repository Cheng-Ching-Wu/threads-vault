import { openDB, type IDBPDatabase } from 'idb';
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
import type { VaultRepository } from '../../repositories/VaultRepository';
import { INDEXEDDB_VERSION, indexedDbMigrations } from '../../migrations/indexeddbMigrations';
import { ALL_STORES, type VaultDbSchema } from './schema';

export const DEFAULT_DB_NAME = 'threads-vault';

export class IndexedDbVaultRepository implements VaultRepository {
  readonly kind = 'indexeddb' as const;
  private db: IDBPDatabase<VaultDbSchema> | null = null;

  constructor(private readonly dbName: string = DEFAULT_DB_NAME) {}

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await openDB<VaultDbSchema>(this.dbName, INDEXEDDB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        for (let v = oldVersion; v < INDEXEDDB_VERSION; v++) {
          indexedDbMigrations[v]!(db, tx);
        }
      },
      blocked() {
        console.warn('[db] 另一個分頁正在使用舊版資料庫，請關閉其他分頁後重新整理');
      },
    });
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private get conn(): IDBPDatabase<VaultDbSchema> {
    if (!this.db) throw new Error('資料庫尚未初始化');
    return this.db;
  }

  // ── 收藏 ──────────────────────────────────────────
  listBookmarks(): Promise<Bookmark[]> {
    return this.conn.getAll('bookmarks');
  }

  async getBookmark(id: string): Promise<Bookmark | null> {
    return (await this.conn.get('bookmarks', id)) ?? null;
  }

  countBookmarks(): Promise<number> {
    return this.conn.count('bookmarks');
  }

  async findBookmarksByIdentity(keys: { platformPostIds: string[]; fbids: string[] }): Promise<Bookmark[]> {
    const tx = this.conn.transaction('bookmarks', 'readonly');
    const found = new Map<string, Bookmark>();
    const byPost = tx.store.index('by_platformPostId');
    const byFbid = tx.store.index('by_fbid');
    const lookups: Promise<void>[] = [];
    for (const id of new Set(keys.platformPostIds)) {
      lookups.push(byPost.get(id).then((b) => void (b && found.set(b.id, b))));
    }
    for (const id of new Set(keys.fbids)) {
      lookups.push(byFbid.get(id).then((b) => void (b && found.set(b.id, b))));
    }
    await Promise.all(lookups);
    await tx.done;
    return [...found.values()];
  }

  async putBookmarks(bookmarks: Bookmark[]): Promise<void> {
    const tx = this.conn.transaction('bookmarks', 'readwrite');
    await settle(tx.done, bookmarks.map((b) => tx.store.put(b)));
  }

  async deleteBookmarks(ids: string[]): Promise<void> {
    const tx = this.conn.transaction(['bookmarks', 'bookmarkFolders', 'bookmarkTags'], 'readwrite');
    const bf = tx.objectStore('bookmarkFolders');
    const bt = tx.objectStore('bookmarkTags');
    // 先讀出所有關聯鍵，再一次送出刪除
    const bfKeys = (await Promise.all(ids.map((id) => bf.index('by_bookmarkId').getAllKeys(id)))).flat();
    const btKeys = (await Promise.all(ids.map((id) => bt.index('by_bookmarkId').getAllKeys(id)))).flat();
    await settle(tx.done, [
      ...ids.map((id) => tx.objectStore('bookmarks').delete(id)),
      ...bfKeys.map((k) => bf.delete(k)),
      ...btKeys.map((k) => bt.delete(k)),
    ]);
  }

  // ── 資料夾 ────────────────────────────────────────
  listFolders(): Promise<Folder[]> {
    return this.conn.getAllFromIndex('folders', 'by_sortOrder');
  }

  async putFolder(folder: Folder): Promise<void> {
    await this.conn.put('folders', folder);
  }

  async deleteFolder(id: string): Promise<void> {
    const tx = this.conn.transaction(['folders', 'bookmarkFolders'], 'readwrite');
    const bf = tx.objectStore('bookmarkFolders');
    const keys = await bf.index('by_folderId').getAllKeys(id);
    await settle(tx.done, [tx.objectStore('folders').delete(id), ...keys.map((k) => bf.delete(k))]);
  }

  // ── 標籤 ──────────────────────────────────────────
  listTags(): Promise<Tag[]> {
    return this.conn.getAllFromIndex('tags', 'by_name');
  }

  async putTag(tag: Tag): Promise<void> {
    await this.conn.put('tags', tag);
  }

  async deleteTag(id: string): Promise<void> {
    const tx = this.conn.transaction(['tags', 'bookmarkTags'], 'readwrite');
    const bt = tx.objectStore('bookmarkTags');
    const keys = await bt.index('by_tagId').getAllKeys(id);
    await settle(tx.done, [tx.objectStore('tags').delete(id), ...keys.map((k) => bt.delete(k))]);
  }

  // ── 關聯 ──────────────────────────────────────────
  listBookmarkFolders(): Promise<BookmarkFolder[]> {
    return this.conn.getAll('bookmarkFolders');
  }

  listBookmarkTags(): Promise<BookmarkTag[]> {
    return this.conn.getAll('bookmarkTags');
  }

  async addBookmarkFolders(links: BookmarkFolder[]): Promise<void> {
    const tx = this.conn.transaction('bookmarkFolders', 'readwrite');
    await settle(tx.done, links.map((l) => tx.store.put(l)));
  }

  async removeBookmarkFolders(bookmarkIds: string[], folderId: string): Promise<void> {
    const tx = this.conn.transaction('bookmarkFolders', 'readwrite');
    await settle(tx.done, bookmarkIds.map((id) => tx.store.delete([id, folderId])));
  }

  async addBookmarkTags(links: BookmarkTag[]): Promise<void> {
    const tx = this.conn.transaction('bookmarkTags', 'readwrite');
    await settle(tx.done, links.map((l) => tx.store.put(l)));
  }

  async removeBookmarkTags(bookmarkIds: string[], tagId: string): Promise<void> {
    const tx = this.conn.transaction('bookmarkTags', 'readwrite');
    await settle(tx.done, bookmarkIds.map((id) => tx.store.delete([id, tagId])));
  }

  // ── 匯入紀錄 ──────────────────────────────────────
  async listImportJobs(): Promise<ImportJob[]> {
    return (await this.conn.getAllFromIndex('importJobs', 'by_startedAt')).reverse();
  }

  async putImportJob(job: ImportJob): Promise<void> {
    await this.conn.put('importJobs', job);
  }

  async applyImport(batch: {
    bookmarks: Bookmark[];
    folders: Folder[];
    tags: Tag[];
    bookmarkFolders: BookmarkFolder[];
    bookmarkTags: BookmarkTag[];
  }): Promise<void> {
    const tx = this.conn.transaction(['bookmarks', 'folders', 'tags', 'bookmarkFolders', 'bookmarkTags'], 'readwrite');
    // 任何一筆失敗（例如違反唯一性約束），IndexedDB 會自動回滾整個交易
    await settle(tx.done, [
      ...batch.folders.map((f) => tx.objectStore('folders').put(f)),
      ...batch.tags.map((t) => tx.objectStore('tags').put(t)),
      ...batch.bookmarks.map((b) => tx.objectStore('bookmarks').put(b)),
      ...batch.bookmarkFolders.map((l) => tx.objectStore('bookmarkFolders').put(l)),
      ...batch.bookmarkTags.map((l) => tx.objectStore('bookmarkTags').put(l)),
    ]);
  }

  // ── 自動分類規則 ──────────────────────────────────
  listAutoRules(): Promise<AutoRule[]> {
    return this.conn.getAllFromIndex('autoRules', 'by_sortOrder');
  }

  async putAutoRules(rules: AutoRule[]): Promise<void> {
    const tx = this.conn.transaction('autoRules', 'readwrite');
    await settle(tx.done, rules.map((r) => tx.store.put(r)));
  }

  async deleteAutoRule(id: string): Promise<void> {
    await this.conn.delete('autoRules', id);
  }

  // ── 備份 ──────────────────────────────────────────
  async exportSnapshot(): Promise<VaultSnapshot> {
    const tx = this.conn.transaction([...ALL_STORES], 'readonly');
    const [bookmarks, folders, tags, bookmarkFolders, bookmarkTags, importJobs, autoRules] = await Promise.all([
      tx.objectStore('bookmarks').getAll(),
      tx.objectStore('folders').getAll(),
      tx.objectStore('tags').getAll(),
      tx.objectStore('bookmarkFolders').getAll(),
      tx.objectStore('bookmarkTags').getAll(),
      tx.objectStore('importJobs').getAll(),
      tx.objectStore('autoRules').index('by_sortOrder').getAll(),
    ]);
    await tx.done;
    return { bookmarks, folders, tags, bookmarkFolders, bookmarkTags, importJobs, autoRules };
  }

  async replaceAll(snapshot: VaultSnapshot): Promise<void> {
    const tx = this.conn.transaction([...ALL_STORES], 'readwrite');
    await settle(tx.done, [
      ...ALL_STORES.map((s) => tx.objectStore(s).clear()),
      ...snapshot.bookmarks.map((b) => tx.objectStore('bookmarks').put(b)),
      ...snapshot.folders.map((f) => tx.objectStore('folders').put(f)),
      ...snapshot.tags.map((t) => tx.objectStore('tags').put(t)),
      ...snapshot.bookmarkFolders.map((l) => tx.objectStore('bookmarkFolders').put(l)),
      ...snapshot.bookmarkTags.map((l) => tx.objectStore('bookmarkTags').put(l)),
      ...snapshot.importJobs.map((j) => tx.objectStore('importJobs').put(j)),
      ...snapshot.autoRules.map((r) => tx.objectStore('autoRules').put(r)),
    ]);
  }

  async clearAll(): Promise<void> {
    const tx = this.conn.transaction([...ALL_STORES], 'readwrite');
    await settle(tx.done, ALL_STORES.map((s) => tx.objectStore(s).clear()));
  }
}

/**
 * 等待交易完成；同時「接住」每個請求的 Promise，
 * 避免某筆失敗時產生未處理的 rejection。第一個錯誤會往外拋。
 */
async function settle(done: Promise<void>, requests: Promise<unknown>[]): Promise<void> {
  await Promise.all([...requests, done]);
}
