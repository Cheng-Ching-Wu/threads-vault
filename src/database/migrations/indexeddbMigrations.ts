import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { VaultDbSchema } from '../adapters/indexeddb/schema';

type UpgradeTx = IDBPTransaction<VaultDbSchema, StoreNames<VaultDbSchema>[], 'versionchange'>;
type Migration = (db: IDBPDatabase<VaultDbSchema>, tx: UpgradeTx) => void;

/**
 * IndexedDB 版本遷移。陣列索引 i 代表「升級到版本 i + 1」。
 * 新增欄位或索引時，往後加一個函式即可，不要修改舊的遷移。
 */
export const indexedDbMigrations: Migration[] = [
  // v1：初始結構
  (db) => {
    const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' });
    // 唯一性約束：同一貼文代碼 / fbid 只能有一筆（null 值不會被索引）
    bookmarks.createIndex('by_platformPostId', 'platformPostId', { unique: true });
    bookmarks.createIndex('by_fbid', 'fbid', { unique: true });
    bookmarks.createIndex('by_savedAt', 'savedAt');
    bookmarks.createIndex('by_importedAt', 'importedAt');

    const folders = db.createObjectStore('folders', { keyPath: 'id' });
    folders.createIndex('by_sortOrder', 'sortOrder');

    const tags = db.createObjectStore('tags', { keyPath: 'id' });
    tags.createIndex('by_name', 'name', { unique: true });

    const bf = db.createObjectStore('bookmarkFolders', { keyPath: ['bookmarkId', 'folderId'] });
    bf.createIndex('by_bookmarkId', 'bookmarkId');
    bf.createIndex('by_folderId', 'folderId');

    const bt = db.createObjectStore('bookmarkTags', { keyPath: ['bookmarkId', 'tagId'] });
    bt.createIndex('by_bookmarkId', 'bookmarkId');
    bt.createIndex('by_tagId', 'tagId');

    const jobs = db.createObjectStore('importJobs', { keyPath: 'id' });
    jobs.createIndex('by_startedAt', 'startedAt');
  },
  // v2：自動分類規則
  (db) => {
    const rules = db.createObjectStore('autoRules', { keyPath: 'id' });
    rules.createIndex('by_sortOrder', 'sortOrder');
  },
];

export const INDEXEDDB_VERSION = indexedDbMigrations.length;
