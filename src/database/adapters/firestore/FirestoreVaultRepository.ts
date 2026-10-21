import {
  collection,
  deleteField,
  doc,
  FieldPath,
  getDocFromCache,
  onSnapshot,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type QuerySnapshot,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore';
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

/**
 * 雲端儲存（Cloud Firestore），用於多裝置同步。資料結構：
 *
 *   users/{uid}/bookmarks/{id}   收藏；所屬資料夾與標籤存在 _f / _t 欄位（{ id: 加入時間 }）
 *   users/{uid}/folders/{id}
 *   users/{uid}/tags/{id}
 *   users/{uid}/autoRules/{id}
 *   users/{uid}/importJobs/{id}
 *
 * 運作方式（離線優先）：
 * - init() 後以即時監聽把所有資料保持在記憶體中，讀取一律從記憶體回傳，不額外產生讀取費用。
 * - 寫入先套用到本機快取（離線也能立刻生效），再等待伺服器確認一小段時間；
 *   沒網路時不會卡住，Firestore 會在恢復連線後自動上傳。背景同步失敗會透過 onSyncError 通知。
 *
 * 與本機資料庫的差異：
 * - 唯一性（同一貼文代碼 / fbid 只能一筆）在寫入前以記憶體資料檢查，兩台裝置「同時」寫入同一篇時無法完全避免重複。
 * - 單次批次寫入有數量上限，大量資料會分批送出；所有檢查都在送出前完成，
 *   但若網路在分批之間中斷，已送出的批次不會回滾（匯入可重複執行，重跑即可補齊）。
 */

const BATCH_LIMIT = 400;

type Links = Map<string, string>;
interface BookmarkEntry {
  bookmark: Bookmark;
  folders: Links;
  tags: Links;
}

export interface FirestoreRepoOptions {
  /** 等待伺服器確認寫入的時間；逾時後在背景繼續同步。測試時可設為 Infinity */
  ackTimeoutMs?: number;
  /** 背景同步失敗（例如權限被拒）時呼叫 */
  onSyncError?: (error: unknown) => void;
}

const BOOKMARK_FIELDS = [
  'id', 'platform', 'platformPostId', 'fbid', 'originalUrl', 'canonicalUrl', 'author', 'title', 'content',
  'thumbnailUrl', 'savedAt', 'importedAt', 'updatedAt', 'notes', 'status', 'source',
] as const satisfies readonly (keyof Bookmark)[];

const pickBookmark = (d: DocumentData): Bookmark =>
  Object.fromEntries(BOOKMARK_FIELDS.map((k) => [k, d[k] ?? null])) as unknown as Bookmark;

const linksOf = (v: unknown): Links =>
  new Map(v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>).map(([k, t]) => [k, String(t)]) : []);

class DuplicateIdentityError extends Error {
  constructor(kind: string, value: string) {
    super(`已經有另一篇收藏使用相同的${kind}：${value}`);
    this.name = 'DuplicateIdentityError';
  }
}

export class FirestoreVaultRepository implements VaultRepository {
  readonly kind = 'firestore' as const;

  private bookmarks = new Map<string, BookmarkEntry>();
  private folders = new Map<string, Folder>();
  private tags = new Map<string, Tag>();
  private rules = new Map<string, AutoRule>();
  private jobs = new Map<string, ImportJob>();
  private unsubs: Unsubscribe[] = [];
  private listeners = new Set<() => void>();
  private ready = false;

  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
    private readonly options: FirestoreRepoOptions = {},
  ) {}

  // ── 連線 ──────────────────────────────────────────
  async init(): Promise<void> {
    if (this.ready) return;
    const first = (name: string, apply: (snap: QuerySnapshot) => void) =>
      new Promise<void>((resolve, reject) => {
        let done = false;
        this.unsubs.push(
          onSnapshot(
            this.col(name),
            (snap) => {
              apply(snap);
              if (!done) {
                done = true;
                resolve();
              } else {
                this.emitChange();
              }
            },
            (err) => (done ? this.options.onSyncError?.(err) : reject(err)),
          ),
        );
      });

    await Promise.all([
      first('bookmarks', (snap) => {
        this.bookmarks = new Map(snap.docs.map((d) => [d.id, this.entryOf(d.data())]));
      }),
      first('folders', (snap) => {
        this.folders = new Map(snap.docs.map((d) => [d.id, d.data() as Folder]));
      }),
      first('tags', (snap) => {
        this.tags = new Map(snap.docs.map((d) => [d.id, d.data() as Tag]));
      }),
      first('autoRules', (snap) => {
        this.rules = new Map(snap.docs.map((d) => [d.id, d.data() as AutoRule]));
      }),
      first('importJobs', (snap) => {
        this.jobs = new Map(snap.docs.map((d) => [d.id, d.data() as ImportJob]));
      }),
    ]).catch((err) => {
      this.stopListening();
      throw err;
    });
    this.ready = true;
  }

  async close(): Promise<void> {
    this.stopListening();
    this.ready = false;
  }

  /** 資料被其他裝置（或背景同步）改變時通知；回傳取消訂閱的函式 */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private stopListening() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  private emitChange() {
    this.listeners.forEach((l) => l());
  }

  // ── 收藏 ──────────────────────────────────────────
  async listBookmarks(): Promise<Bookmark[]> {
    return [...this.bookmarks.values()].map((e) => ({ ...e.bookmark }));
  }

  async getBookmark(id: string): Promise<Bookmark | null> {
    const e = this.bookmarks.get(id);
    return e ? { ...e.bookmark } : null;
  }

  async countBookmarks(): Promise<number> {
    return this.bookmarks.size;
  }

  async findBookmarksByIdentity(keys: { platformPostIds: string[]; fbids: string[] }): Promise<Bookmark[]> {
    const posts = new Set(keys.platformPostIds);
    const fbids = new Set(keys.fbids);
    return [...this.bookmarks.values()]
      .filter(({ bookmark: b }) => (b.platformPostId && posts.has(b.platformPostId)) || (b.fbid && fbids.has(b.fbid)))
      .map((e) => ({ ...e.bookmark }));
  }

  async putBookmarks(bookmarks: Bookmark[]): Promise<void> {
    this.assertUniqueIdentities(bookmarks);
    await this.write((w) => {
      for (const b of bookmarks) w.set(this.ref('bookmarks', b.id), { ...b }, { merge: true });
    });
  }

  async deleteBookmarks(ids: string[]): Promise<void> {
    await this.write((w) => {
      for (const id of ids) w.delete(this.ref('bookmarks', id));
    });
  }

  // ── 資料夾 ────────────────────────────────────────
  async listFolders(): Promise<Folder[]> {
    return [...this.folders.values()]
      .map((f) => ({ ...f }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  async putFolder(folder: Folder): Promise<void> {
    await this.write((w) => w.set(this.ref('folders', folder.id), { ...folder }));
  }

  async deleteFolder(id: string): Promise<void> {
    const members = [...this.bookmarks.values()].filter((e) => e.folders.has(id));
    await this.write((w) => {
      w.delete(this.ref('folders', id));
      for (const e of members) w.update(this.ref('bookmarks', e.bookmark.id), new FieldPath('_f', id), deleteField());
    });
  }

  // ── 標籤 ──────────────────────────────────────────
  async listTags(): Promise<Tag[]> {
    return [...this.tags.values()].map((t) => ({ ...t })).sort((a, b) => a.name.localeCompare(b.name));
  }

  async putTag(tag: Tag): Promise<void> {
    const clash = [...this.tags.values()].find((t) => t.id !== tag.id && t.name === tag.name);
    if (clash) throw new Error(`已經有名為「${tag.name}」的標籤`);
    await this.write((w) => w.set(this.ref('tags', tag.id), { ...tag }));
  }

  async deleteTag(id: string): Promise<void> {
    const members = [...this.bookmarks.values()].filter((e) => e.tags.has(id));
    await this.write((w) => {
      w.delete(this.ref('tags', id));
      for (const e of members) w.update(this.ref('bookmarks', e.bookmark.id), new FieldPath('_t', id), deleteField());
    });
  }

  // ── 關聯 ──────────────────────────────────────────
  async listBookmarkFolders(): Promise<BookmarkFolder[]> {
    return [...this.bookmarks.values()].flatMap((e) =>
      [...e.folders].map(([folderId, createdAt]) => ({ bookmarkId: e.bookmark.id, folderId, createdAt })),
    );
  }

  async listBookmarkTags(): Promise<BookmarkTag[]> {
    return [...this.bookmarks.values()].flatMap((e) =>
      [...e.tags].map(([tagId, createdAt]) => ({ bookmarkId: e.bookmark.id, tagId, createdAt })),
    );
  }

  async addBookmarkFolders(links: BookmarkFolder[]): Promise<void> {
    await this.write((w) => this.writeLinks(w, links.map((l) => ({ ...l, kind: '_f', target: l.folderId }))));
  }

  async removeBookmarkFolders(bookmarkIds: string[], folderId: string): Promise<void> {
    await this.write((w) => {
      for (const id of bookmarkIds) {
        if (this.bookmarks.get(id)?.folders.has(folderId)) {
          w.update(this.ref('bookmarks', id), new FieldPath('_f', folderId), deleteField());
        }
      }
    });
  }

  async addBookmarkTags(links: BookmarkTag[]): Promise<void> {
    await this.write((w) => this.writeLinks(w, links.map((l) => ({ ...l, kind: '_t', target: l.tagId }))));
  }

  async removeBookmarkTags(bookmarkIds: string[], tagId: string): Promise<void> {
    await this.write((w) => {
      for (const id of bookmarkIds) {
        if (this.bookmarks.get(id)?.tags.has(tagId)) {
          w.update(this.ref('bookmarks', id), new FieldPath('_t', tagId), deleteField());
        }
      }
    });
  }

  // ── 匯入紀錄 ──────────────────────────────────────
  async listImportJobs(): Promise<ImportJob[]> {
    return [...this.jobs.values()].map((j) => ({ ...j })).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async putImportJob(job: ImportJob): Promise<void> {
    await this.write((w) => w.set(this.ref('importJobs', job.id), { ...job }));
  }

  async applyImport(batch: {
    bookmarks: Bookmark[];
    folders: Folder[];
    tags: Tag[];
    bookmarkFolders: BookmarkFolder[];
    bookmarkTags: BookmarkTag[];
  }): Promise<void> {
    // 所有檢查都在送出任何資料之前完成，失敗時不會寫入任何東西
    this.assertUniqueIdentities(batch.bookmarks);
    const newIds = new Set(batch.bookmarks.map((b) => b.id));
    await this.write((w) => {
      for (const f of batch.folders) w.set(this.ref('folders', f.id), { ...f });
      for (const t of batch.tags) w.set(this.ref('tags', t.id), { ...t });
      // 同一篇收藏的內容與關聯合併成一次寫入
      const linkPatch = new Map<string, { _f: Record<string, string>; _t: Record<string, string> }>();
      const patchOf = (id: string) => {
        let p = linkPatch.get(id);
        if (!p) linkPatch.set(id, (p = { _f: {}, _t: {} }));
        return p;
      };
      for (const l of batch.bookmarkFolders) {
        if (newIds.has(l.bookmarkId) || this.bookmarks.has(l.bookmarkId)) patchOf(l.bookmarkId)._f[l.folderId] = l.createdAt;
      }
      for (const l of batch.bookmarkTags) {
        if (newIds.has(l.bookmarkId) || this.bookmarks.has(l.bookmarkId)) patchOf(l.bookmarkId)._t[l.tagId] = l.createdAt;
      }
      for (const b of batch.bookmarks) {
        const p = linkPatch.get(b.id);
        linkPatch.delete(b.id);
        w.set(this.ref('bookmarks', b.id), { ...b, ...(p && this.nonEmptyLinks(p)) }, { merge: true });
      }
      for (const [id, p] of linkPatch) w.set(this.ref('bookmarks', id), this.nonEmptyLinks(p), { merge: true });
    });
  }

  // ── 自動分類規則 ──────────────────────────────────
  async listAutoRules(): Promise<AutoRule[]> {
    return [...this.rules.values()]
      .map((r) => ({ ...r, keywords: [...r.keywords] }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  async putAutoRules(rules: AutoRule[]): Promise<void> {
    await this.write((w) => {
      for (const r of rules) w.set(this.ref('autoRules', r.id), { ...r });
    });
  }

  async deleteAutoRule(id: string): Promise<void> {
    await this.write((w) => w.delete(this.ref('autoRules', id)));
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

  /**
   * 以快照取代雲端資料。注意：資料量大時會分批送出，無法像本機資料庫一樣保證「全有或全無」。
   */
  async replaceAll(snapshot: VaultSnapshot): Promise<void> {
    const keep = {
      bookmarks: new Set(snapshot.bookmarks.map((b) => b.id)),
      folders: new Set(snapshot.folders.map((f) => f.id)),
      tags: new Set(snapshot.tags.map((t) => t.id)),
      autoRules: new Set(snapshot.autoRules.map((r) => r.id)),
      importJobs: new Set(snapshot.importJobs.map((j) => j.id)),
    };
    const folderLinks = groupLinks(snapshot.bookmarkFolders.map((l) => [l.bookmarkId, l.folderId, l.createdAt]));
    const tagLinks = groupLinks(snapshot.bookmarkTags.map((l) => [l.bookmarkId, l.tagId, l.createdAt]));
    await this.write((w) => {
      this.deleteAllExcept(w, keep);
      for (const f of snapshot.folders) w.set(this.ref('folders', f.id), { ...f });
      for (const t of snapshot.tags) w.set(this.ref('tags', t.id), { ...t });
      for (const b of snapshot.bookmarks) {
        // 不使用 merge：整份覆蓋，舊的關聯一併清除
        w.set(this.ref('bookmarks', b.id), { ...b, _f: folderLinks.get(b.id) ?? {}, _t: tagLinks.get(b.id) ?? {} });
      }
      for (const j of snapshot.importJobs) w.set(this.ref('importJobs', j.id), { ...j });
      for (const r of snapshot.autoRules) w.set(this.ref('autoRules', r.id), { ...r });
    });
  }

  async clearAll(): Promise<void> {
    await this.write((w) =>
      this.deleteAllExcept(w, {
        bookmarks: new Set(),
        folders: new Set(),
        tags: new Set(),
        autoRules: new Set(),
        importJobs: new Set(),
      }),
    );
  }

  // ── 內部工具 ──────────────────────────────────────
  private col(name: string) {
    return collection(this.db, 'users', this.uid, name);
  }

  private ref(name: string, id: string): DocumentReference {
    return doc(this.db, 'users', this.uid, name, id);
  }

  private entryOf(d: DocumentData): BookmarkEntry {
    return { bookmark: pickBookmark(d), folders: linksOf(d._f), tags: linksOf(d._t) };
  }

  private nonEmptyLinks(p: { _f: Record<string, string>; _t: Record<string, string> }) {
    return {
      ...(Object.keys(p._f).length ? { _f: p._f } : {}),
      ...(Object.keys(p._t).length ? { _t: p._t } : {}),
    };
  }

  private writeLinks(w: Writer, links: { bookmarkId: string; target: string; createdAt: string; kind: '_f' | '_t' }[]) {
    const byBookmark = new Map<string, { _f: Record<string, string>; _t: Record<string, string> }>();
    for (const l of links) {
      const e = this.bookmarks.get(l.bookmarkId);
      // 不存在的收藏略過，避免建立只有關聯的空白文件；已存在的關聯保留原本的加入時間
      if (!e || (l.kind === '_f' ? e.folders : e.tags).has(l.target)) continue;
      let p = byBookmark.get(l.bookmarkId);
      if (!p) byBookmark.set(l.bookmarkId, (p = { _f: {}, _t: {} }));
      p[l.kind][l.target] = l.createdAt;
    }
    for (const [id, p] of byBookmark) w.set(this.ref('bookmarks', id), this.nonEmptyLinks(p), { merge: true });
  }

  private deleteAllExcept(w: Writer, keep: Record<'bookmarks' | 'folders' | 'tags' | 'autoRules' | 'importJobs', Set<string>>) {
    const del = (name: keyof typeof keep, ids: Iterable<string>) => {
      for (const id of ids) if (!keep[name].has(id)) w.delete(this.ref(name, id));
    };
    del('bookmarks', this.bookmarks.keys());
    del('folders', this.folders.keys());
    del('tags', this.tags.keys());
    del('autoRules', this.rules.keys());
    del('importJobs', this.jobs.keys());
  }

  /** 同一貼文代碼 / fbid 只能屬於一篇收藏（同批內與既有資料都檢查） */
  private assertUniqueIdentities(incoming: Bookmark[]) {
    const incomingIds = new Set(incoming.map((b) => b.id));
    const owner = { post: new Map<string, string>(), fbid: new Map<string, string>() };
    for (const { bookmark: b } of this.bookmarks.values()) {
      if (incomingIds.has(b.id)) continue;
      if (b.platformPostId) owner.post.set(b.platformPostId, b.id);
      if (b.fbid) owner.fbid.set(b.fbid, b.id);
    }
    for (const b of incoming) {
      if (b.platformPostId) {
        const o = owner.post.get(b.platformPostId);
        if (o && o !== b.id) throw new DuplicateIdentityError('貼文代碼', b.platformPostId);
        owner.post.set(b.platformPostId, b.id);
      }
      if (b.fbid) {
        const o = owner.fbid.get(b.fbid);
        if (o && o !== b.id) throw new DuplicateIdentityError(' fbid', b.fbid);
        owner.fbid.set(b.fbid, b.id);
      }
    }
  }

  /**
   * 收集寫入 → 分批送出 → 從本機快取讀回受影響的文件更新記憶體 → 等待伺服器確認（有時限）。
   * 本機快取的讀取與寫入在 Firestore 內部依序執行，所以讀回時一定已包含剛才的寫入。
   */
  private async write(build: (w: Writer) => void): Promise<void> {
    const writer = new Writer();
    build(writer);
    if (!writer.ops.length) return;

    const commits: Promise<void>[] = [];
    for (let i = 0; i < writer.ops.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.db);
      writer.ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
      commits.push(batch.commit());
    }
    const all = Promise.all(commits).then(() => undefined);
    // 先接住錯誤，避免未處理的 rejection；下面會再依情況回報
    all.catch(() => undefined);

    await Promise.all([...writer.touched].map((key) => this.refreshFromCache(key)));

    const timeout = this.options.ackTimeoutMs ?? 5000;
    if (timeout === Infinity) return all;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => (timer = setTimeout(() => resolve('timeout'), timeout)));
    const result = await Promise.race([all.then(() => 'ok' as const), timedOut]).finally(() => clearTimeout(timer));
    if (result === 'timeout') {
      // 可能是離線：資料已存在本機快取，恢復連線後自動上傳
      all.catch((err) => this.options.onSyncError?.(err));
      return;
    }
    return all;
  }

  private async refreshFromCache(key: string): Promise<void> {
    const [name, id] = key.split('/') as [string, string];
    let data: DocumentData | undefined;
    try {
      const snap = await getDocFromCache(this.ref(name, id));
      data = snap.exists() ? snap.data() : undefined;
    } catch {
      data = undefined; // 快取中沒有這份文件 = 已刪除
    }
    switch (name) {
      case 'bookmarks':
        if (data) this.bookmarks.set(id, this.entryOf(data));
        else this.bookmarks.delete(id);
        break;
      case 'folders':
        if (data) this.folders.set(id, data as Folder);
        else this.folders.delete(id);
        break;
      case 'tags':
        if (data) this.tags.set(id, data as Tag);
        else this.tags.delete(id);
        break;
      case 'autoRules':
        if (data) this.rules.set(id, data as AutoRule);
        else this.rules.delete(id);
        break;
      case 'importJobs':
        if (data) this.jobs.set(id, data as ImportJob);
        else this.jobs.delete(id);
        break;
    }
  }
}

/** 收集一次操作中的所有寫入，並記錄受影響的文件 */
class Writer {
  readonly ops: ((b: WriteBatch) => void)[] = [];
  readonly touched = new Set<string>();

  private track(ref: DocumentReference) {
    const parts = ref.path.split('/');
    this.touched.add(`${parts[2]}/${parts[3]}`);
  }

  set(ref: DocumentReference, data: DocumentData, opts?: { merge: boolean }) {
    this.track(ref);
    this.ops.push((b) => (opts ? b.set(ref, data, opts) : b.set(ref, data)));
  }

  update(ref: DocumentReference, field: FieldPath, value: unknown) {
    this.track(ref);
    this.ops.push((b) => b.update(ref, field, value));
  }

  delete(ref: DocumentReference) {
    this.track(ref);
    this.ops.push((b) => b.delete(ref));
  }
}

function groupLinks(rows: [string, string, string][]): Map<string, Record<string, string>> {
  const m = new Map<string, Record<string, string>>();
  for (const [bookmarkId, target, createdAt] of rows) {
    if (!m.has(bookmarkId)) m.set(bookmarkId, {});
    m.get(bookmarkId)![target] = createdAt;
  }
  return m;
}
