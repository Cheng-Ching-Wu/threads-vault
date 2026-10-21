import type {
  AutoRule,
  Bookmark,
  BookmarkFolder,
  BookmarkTag,
  Folder,
  ImportCounts,
  ImportJob,
  Tag,
  VaultSnapshot,
} from '@/shared/types/models';
import type { VaultRepository } from '../../repositories/VaultRepository';
import { sqliteMigrations } from '../../migrations/sqliteMigrations';
import type { SqlDriver, SqlStatement, SqlValue } from './SqlDriver';

type Row = Record<string, SqlValue>;

const str = (v: SqlValue | undefined): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: SqlValue | undefined): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: SqlValue | undefined): number => (typeof v === 'number' ? v : Number(v ?? 0));

const BOOKMARK_COLUMNS = [
  'id', 'platform', 'platform_post_id', 'fbid', 'original_url', 'canonical_url', 'author', 'title',
  'content', 'thumbnail_url', 'saved_at', 'imported_at', 'updated_at', 'notes', 'status', 'source',
] as const;

function bookmarkToParams(b: Bookmark): SqlValue[] {
  return [
    b.id, b.platform, b.platformPostId, b.fbid, b.originalUrl, b.canonicalUrl, b.author, b.title,
    b.content, b.thumbnailUrl, b.savedAt, b.importedAt, b.updatedAt, b.notes, b.status, b.source,
  ];
}

function rowToBookmark(r: Row): Bookmark {
  return {
    id: str(r.id),
    platform: 'threads',
    platformPostId: strOrNull(r.platform_post_id),
    fbid: strOrNull(r.fbid),
    originalUrl: strOrNull(r.original_url),
    canonicalUrl: strOrNull(r.canonical_url),
    author: strOrNull(r.author),
    title: strOrNull(r.title),
    content: strOrNull(r.content),
    thumbnailUrl: strOrNull(r.thumbnail_url),
    savedAt: strOrNull(r.saved_at),
    importedAt: str(r.imported_at),
    updatedAt: str(r.updated_at),
    notes: strOrNull(r.notes),
    status: r.status === 'missing_url' ? 'missing_url' : 'normal',
    source: str(r.source) as Bookmark['source'],
  };
}

const UPSERT_BOOKMARK =
  `INSERT INTO bookmarks (${BOOKMARK_COLUMNS.join(', ')}) VALUES (${BOOKMARK_COLUMNS.map(() => '?').join(', ')}) ` +
  `ON CONFLICT(id) DO UPDATE SET ${BOOKMARK_COLUMNS.filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ')}`;

const UPSERT_FOLDER =
  'INSERT INTO folders (id, name, icon, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
  'ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, color = excluded.color, ' +
  'sort_order = excluded.sort_order, updated_at = excluded.updated_at';

const UPSERT_TAG =
  'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?) ' +
  'ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color';

const UPSERT_JOB =
  'INSERT INTO import_jobs (id, source_type, file_name, started_at, finished_at, status, counts_json, ' +
  'repaired_text_count, missing_url_count, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
  'ON CONFLICT(id) DO UPDATE SET finished_at = excluded.finished_at, status = excluded.status, ' +
  'counts_json = excluded.counts_json, repaired_text_count = excluded.repaired_text_count, ' +
  'missing_url_count = excluded.missing_url_count, error_message = excluded.error_message';

const folderStmt = (f: Folder): SqlStatement => ({
  sql: UPSERT_FOLDER,
  params: [f.id, f.name, f.icon, f.color, f.sortOrder, f.createdAt, f.updatedAt],
});
const tagStmt = (t: Tag): SqlStatement => ({ sql: UPSERT_TAG, params: [t.id, t.name, t.color, t.createdAt] });
const bookmarkStmt = (b: Bookmark): SqlStatement => ({ sql: UPSERT_BOOKMARK, params: bookmarkToParams(b) });
const bfStmt = (l: BookmarkFolder): SqlStatement => ({
  sql: 'INSERT OR IGNORE INTO bookmark_folders (bookmark_id, folder_id, created_at) VALUES (?, ?, ?)',
  params: [l.bookmarkId, l.folderId, l.createdAt],
});
const btStmt = (l: BookmarkTag): SqlStatement => ({
  sql: 'INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id, created_at) VALUES (?, ?, ?)',
  params: [l.bookmarkId, l.tagId, l.createdAt],
});
const jobStmt = (j: ImportJob): SqlStatement => ({
  sql: UPSERT_JOB,
  params: [
    j.id, j.sourceType, j.fileName, j.startedAt, j.finishedAt, j.status, JSON.stringify(j.counts),
    j.repairedTextCount, j.missingUrlCount, j.errorMessage,
  ],
});

const UPSERT_RULE =
  'INSERT INTO auto_rules (id, target_type, target_name, keywords_json, match_mode, enabled, sort_order, ' +
  'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
  'ON CONFLICT(id) DO UPDATE SET target_type = excluded.target_type, target_name = excluded.target_name, ' +
  'keywords_json = excluded.keywords_json, match_mode = excluded.match_mode, enabled = excluded.enabled, ' +
  'sort_order = excluded.sort_order, updated_at = excluded.updated_at';

const ruleStmt = (r: AutoRule): SqlStatement => ({
  sql: UPSERT_RULE,
  params: [
    r.id, r.targetType, r.targetName, JSON.stringify(r.keywords), r.matchMode, r.enabled ? 1 : 0, r.sortOrder,
    r.createdAt, r.updatedAt,
  ],
});

function rowToRule(r: Row): AutoRule {
  let keywords: unknown = [];
  try {
    keywords = JSON.parse(str(r.keywords_json) || '[]');
  } catch {
    /* 損壞的資料視為沒有關鍵字 */
  }
  return {
    id: str(r.id),
    targetType: r.target_type === 'tag' ? 'tag' : 'folder',
    targetName: str(r.target_name),
    keywords: Array.isArray(keywords) ? keywords.map(String) : [],
    matchMode: r.match_mode === 'all' ? 'all' : 'any',
    enabled: num(r.enabled) !== 0,
    sortOrder: num(r.sort_order),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

/** 把很長的 IN (...) 清單切段，避免超過 SQLite 參數上限 */
function chunk<T>(arr: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class SqliteVaultRepository implements VaultRepository {
  readonly kind = 'sqlite' as const;
  private ready = false;

  constructor(private readonly driver: SqlDriver) {}

  async init(): Promise<void> {
    if (this.ready) return;
    await this.driver.open();
    await this.driver.exec('PRAGMA foreign_keys = ON;');
    const [row] = await this.driver.query<{ user_version: number }>('PRAGMA user_version;');
    const current = row ? num(row.user_version) : 0;
    for (let v = current; v < sqliteMigrations.length; v++) {
      await this.driver.exec(`BEGIN;\n${sqliteMigrations[v]}\nPRAGMA user_version = ${v + 1};\nCOMMIT;`);
    }
    this.ready = true;
  }

  async close(): Promise<void> {
    await this.driver.close();
    this.ready = false;
  }

  // ── 收藏 ──────────────────────────────────────────
  async listBookmarks(): Promise<Bookmark[]> {
    return (await this.driver.query<Row>('SELECT * FROM bookmarks')).map(rowToBookmark);
  }

  async getBookmark(id: string): Promise<Bookmark | null> {
    const [row] = await this.driver.query<Row>('SELECT * FROM bookmarks WHERE id = ?', [id]);
    return row ? rowToBookmark(row) : null;
  }

  async countBookmarks(): Promise<number> {
    const [row] = await this.driver.query<{ n: number }>('SELECT COUNT(*) AS n FROM bookmarks');
    return row ? num(row.n) : 0;
  }

  async findBookmarksByIdentity(keys: { platformPostIds: string[]; fbids: string[] }): Promise<Bookmark[]> {
    const found = new Map<string, Bookmark>();
    for (const part of chunk([...new Set(keys.platformPostIds)])) {
      const rows = await this.driver.query<Row>(
        `SELECT * FROM bookmarks WHERE platform_post_id IN (${part.map(() => '?').join(',')})`,
        part,
      );
      rows.map(rowToBookmark).forEach((b) => found.set(b.id, b));
    }
    for (const part of chunk([...new Set(keys.fbids)])) {
      const rows = await this.driver.query<Row>(
        `SELECT * FROM bookmarks WHERE fbid IN (${part.map(() => '?').join(',')})`,
        part,
      );
      rows.map(rowToBookmark).forEach((b) => found.set(b.id, b));
    }
    return [...found.values()];
  }

  putBookmarks(bookmarks: Bookmark[]): Promise<void> {
    return this.driver.transaction(bookmarks.map(bookmarkStmt));
  }

  deleteBookmarks(ids: string[]): Promise<void> {
    const stmts: SqlStatement[] = [];
    for (const id of ids) {
      stmts.push({ sql: 'DELETE FROM bookmark_folders WHERE bookmark_id = ?', params: [id] });
      stmts.push({ sql: 'DELETE FROM bookmark_tags WHERE bookmark_id = ?', params: [id] });
      stmts.push({ sql: 'DELETE FROM bookmarks WHERE id = ?', params: [id] });
    }
    return this.driver.transaction(stmts);
  }

  // ── 資料夾 ────────────────────────────────────────
  async listFolders(): Promise<Folder[]> {
    const rows = await this.driver.query<Row>('SELECT * FROM folders ORDER BY sort_order, created_at');
    return rows.map((r) => ({
      id: str(r.id),
      name: str(r.name),
      icon: str(r.icon),
      color: str(r.color),
      sortOrder: num(r.sort_order),
      createdAt: str(r.created_at),
      updatedAt: str(r.updated_at),
    }));
  }

  putFolder(folder: Folder): Promise<void> {
    return this.driver.transaction([folderStmt(folder)]);
  }

  deleteFolder(id: string): Promise<void> {
    return this.driver.transaction([
      { sql: 'DELETE FROM bookmark_folders WHERE folder_id = ?', params: [id] },
      { sql: 'DELETE FROM folders WHERE id = ?', params: [id] },
    ]);
  }

  // ── 標籤 ──────────────────────────────────────────
  async listTags(): Promise<Tag[]> {
    const rows = await this.driver.query<Row>('SELECT * FROM tags ORDER BY name');
    return rows.map((r) => ({ id: str(r.id), name: str(r.name), color: str(r.color), createdAt: str(r.created_at) }));
  }

  putTag(tag: Tag): Promise<void> {
    return this.driver.transaction([tagStmt(tag)]);
  }

  deleteTag(id: string): Promise<void> {
    return this.driver.transaction([
      { sql: 'DELETE FROM bookmark_tags WHERE tag_id = ?', params: [id] },
      { sql: 'DELETE FROM tags WHERE id = ?', params: [id] },
    ]);
  }

  // ── 關聯 ──────────────────────────────────────────
  async listBookmarkFolders(): Promise<BookmarkFolder[]> {
    const rows = await this.driver.query<Row>('SELECT * FROM bookmark_folders');
    return rows.map((r) => ({ bookmarkId: str(r.bookmark_id), folderId: str(r.folder_id), createdAt: str(r.created_at) }));
  }

  async listBookmarkTags(): Promise<BookmarkTag[]> {
    const rows = await this.driver.query<Row>('SELECT * FROM bookmark_tags');
    return rows.map((r) => ({ bookmarkId: str(r.bookmark_id), tagId: str(r.tag_id), createdAt: str(r.created_at) }));
  }

  addBookmarkFolders(links: BookmarkFolder[]): Promise<void> {
    return this.driver.transaction(links.map(bfStmt));
  }

  removeBookmarkFolders(bookmarkIds: string[], folderId: string): Promise<void> {
    return this.driver.transaction(
      bookmarkIds.map((id) => ({
        sql: 'DELETE FROM bookmark_folders WHERE bookmark_id = ? AND folder_id = ?',
        params: [id, folderId],
      })),
    );
  }

  addBookmarkTags(links: BookmarkTag[]): Promise<void> {
    return this.driver.transaction(links.map(btStmt));
  }

  removeBookmarkTags(bookmarkIds: string[], tagId: string): Promise<void> {
    return this.driver.transaction(
      bookmarkIds.map((id) => ({
        sql: 'DELETE FROM bookmark_tags WHERE bookmark_id = ? AND tag_id = ?',
        params: [id, tagId],
      })),
    );
  }

  // ── 匯入紀錄 ──────────────────────────────────────
  async listImportJobs(): Promise<ImportJob[]> {
    const rows = await this.driver.query<Row>('SELECT * FROM import_jobs ORDER BY started_at DESC');
    return rows.map((r) => ({
      id: str(r.id),
      sourceType: str(r.source_type) as ImportJob['sourceType'],
      fileName: strOrNull(r.file_name),
      startedAt: str(r.started_at),
      finishedAt: strOrNull(r.finished_at),
      status: r.status === 'failed' ? 'failed' : 'completed',
      counts: JSON.parse(str(r.counts_json) || '{}') as ImportCounts,
      repairedTextCount: num(r.repaired_text_count),
      missingUrlCount: num(r.missing_url_count),
      errorMessage: strOrNull(r.error_message),
    }));
  }

  putImportJob(job: ImportJob): Promise<void> {
    return this.driver.transaction([jobStmt(job)]);
  }

  applyImport(batch: {
    bookmarks: Bookmark[];
    folders: Folder[];
    tags: Tag[];
    bookmarkFolders: BookmarkFolder[];
    bookmarkTags: BookmarkTag[];
  }): Promise<void> {
    return this.driver.transaction([
      ...batch.folders.map(folderStmt),
      ...batch.tags.map(tagStmt),
      ...batch.bookmarks.map(bookmarkStmt),
      ...batch.bookmarkFolders.map(bfStmt),
      ...batch.bookmarkTags.map(btStmt),
    ]);
  }

  // ── 自動分類規則 ──────────────────────────────────
  async listAutoRules(): Promise<AutoRule[]> {
    return (await this.driver.query<Row>('SELECT * FROM auto_rules ORDER BY sort_order, created_at')).map(rowToRule);
  }

  putAutoRules(rules: AutoRule[]): Promise<void> {
    return this.driver.transaction(rules.map(ruleStmt));
  }

  deleteAutoRule(id: string): Promise<void> {
    return this.driver.transaction([{ sql: 'DELETE FROM auto_rules WHERE id = ?', params: [id] }]);
  }

  // ── 備份 ──────────────────────────────────────────
  async exportSnapshot(): Promise<VaultSnapshot> {
    const [bookmarks, folders, tags, bookmarkFolders, bookmarkTags, importJobs, autoRules] = await Promise.all([
      this.listBookmarks(),
      this.listFolders(),
      this.listTags(),
      this.listBookmarkFolders(),
      this.listBookmarkTags(),
      this.listImportJobs(),
      this.listAutoRules(),
    ]);
    return { bookmarks, folders, tags, bookmarkFolders, bookmarkTags, importJobs, autoRules };
  }

  replaceAll(snapshot: VaultSnapshot): Promise<void> {
    return this.driver.transaction([
      ...CLEAR_ALL,
      ...snapshot.folders.map(folderStmt),
      ...snapshot.tags.map(tagStmt),
      ...snapshot.bookmarks.map(bookmarkStmt),
      ...snapshot.bookmarkFolders.map(bfStmt),
      ...snapshot.bookmarkTags.map(btStmt),
      ...snapshot.importJobs.map(jobStmt),
      ...snapshot.autoRules.map(ruleStmt),
    ]);
  }

  clearAll(): Promise<void> {
    return this.driver.transaction(CLEAR_ALL);
  }
}

const CLEAR_ALL: SqlStatement[] = [
  { sql: 'DELETE FROM bookmark_folders' },
  { sql: 'DELETE FROM bookmark_tags' },
  { sql: 'DELETE FROM bookmarks' },
  { sql: 'DELETE FROM folders' },
  { sql: 'DELETE FROM tags' },
  { sql: 'DELETE FROM import_jobs' },
  { sql: 'DELETE FROM auto_rules' },
];
