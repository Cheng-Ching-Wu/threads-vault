import { defineStore } from 'pinia';
import { computed, markRaw, ref, shallowRef } from 'vue';
import { getRepository, resetRepository, setSyncErrorHandler, type VaultRepository } from '@/database';
import type { AutoRule, Bookmark, BookmarkFolder, BookmarkTag, Folder, ImportJob, Tag } from '@/shared/types/models';
import { VaultService, type AutoRuleInput } from '@/services/vaultService';
import { SearchIndex } from '@/features/search/searchEngine';

/**
 * App 的資料狀態。元件只透過這個 store 操作資料；
 * store 再透過 VaultService → VaultRepository 存取資料庫。
 * 大型陣列使用 shallowRef，避免 10,000 筆收藏被深層代理造成效能問題。
 */
export const useVaultStore = defineStore('vault', () => {
  const ready = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const bookmarks = shallowRef<Bookmark[]>([]);
  const folders = shallowRef<Folder[]>([]);
  const tags = shallowRef<Tag[]>([]);
  const bookmarkFolders = shallowRef<BookmarkFolder[]>([]);
  const bookmarkTags = shallowRef<BookmarkTag[]>([]);
  const importJobs = shallowRef<ImportJob[]>([]);
  const autoRules = shallowRef<AutoRule[]>([]);

  const searchIndex = markRaw(new SearchIndex());
  /** 搜尋索引版本號，索引更新時遞增以觸發重新計算 */
  const indexVersion = ref(0);

  let repo: VaultRepository | null = null;
  let service: VaultService | null = null;
  let stopWatching: (() => void) | null = null;
  /** 目前使用的儲存方式：indexeddb / sqlite = 本機，firestore = 雲端同步 */
  const storageKind = ref<VaultRepository['kind'] | null>(null);

  async function getRepo(): Promise<VaultRepository> {
    if (!repo) {
      const r = await getRepository();
      repo = r;
      storageKind.value = r.kind;
      watchRemoteChanges(r);
    }
    return repo;
  }

  /** 雲端模式：其他裝置改了資料時，重新從記憶體快取讀取（不產生雲端讀取費用） */
  function watchRemoteChanges(r: VaultRepository) {
    stopWatching?.();
    stopWatching = null;
    const watchable = r as VaultRepository & { onChange?: (cb: () => void) => () => void };
    if (typeof watchable.onChange !== 'function') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = watchable.onChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (repo === r) void reloadAll();
      }, 300);
    });
    stopWatching = () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }

  /** 登入或登出後切換資料來源並重新載入 */
  async function switchRepository(): Promise<void> {
    stopWatching?.();
    stopWatching = null;
    repo = null;
    service = null;
    storageKind.value = null;
    await resetRepository();
    error.value = null;
    loading.value = true;
    try {
      await reloadAll();
      ready.value = true;
    } catch (e) {
      // 不要繼續顯示上一個資料來源的內容，避免誤以為是雲端資料
      bookmarks.value = [];
      folders.value = [];
      tags.value = [];
      bookmarkFolders.value = [];
      bookmarkTags.value = [];
      importJobs.value = [];
      autoRules.value = [];
      searchIndex.rebuild([]);
      indexVersion.value++;
      error.value = await describeError(e);
      console.error('[vault] 切換資料來源失敗', error.value);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function describeError(e: unknown): Promise<string> {
    if (storageKind.value !== 'indexeddb' && storageKind.value !== 'sqlite') {
      const { cloudErrorMessage } = await import('@/services/cloud/authService');
      return cloudErrorMessage(e);
    }
    return e instanceof Error ? e.message : String(e);
  }
  async function getService(): Promise<VaultService> {
    service ??= new VaultService(await getRepo());
    return service;
  }

  // ── 衍生資料 ──────────────────────────────────────
  const bookmarkById = computed(() => new Map(bookmarks.value.map((b) => [b.id, b])));
  const folderById = computed(() => new Map(folders.value.map((f) => [f.id, f])));
  const tagById = computed(() => new Map(tags.value.map((t) => [t.id, t])));

  const foldersOf = computed(() => {
    const m = new Map<string, Set<string>>();
    for (const l of bookmarkFolders.value) {
      if (!m.has(l.bookmarkId)) m.set(l.bookmarkId, new Set());
      m.get(l.bookmarkId)!.add(l.folderId);
    }
    return m;
  });
  const tagsOf = computed(() => {
    const m = new Map<string, Set<string>>();
    for (const l of bookmarkTags.value) {
      if (!m.has(l.bookmarkId)) m.set(l.bookmarkId, new Set());
      m.get(l.bookmarkId)!.add(l.tagId);
    }
    return m;
  });
  const folderCounts = computed(() => {
    const m = new Map<string, number>();
    for (const l of bookmarkFolders.value) m.set(l.folderId, (m.get(l.folderId) ?? 0) + 1);
    return m;
  });
  const tagCounts = computed(() => {
    const m = new Map<string, number>();
    for (const l of bookmarkTags.value) m.set(l.tagId, (m.get(l.tagId) ?? 0) + 1);
    return m;
  });
  const uncategorizedCount = computed(
    () => bookmarks.value.filter((b) => !(foldersOf.value.get(b.id)?.size)).length,
  );
  const missingUrlCount = computed(() => bookmarks.value.filter((b) => b.status === 'missing_url').length);

  function foldersFor(bookmarkId: string): Folder[] {
    const ids = foldersOf.value.get(bookmarkId);
    if (!ids) return [];
    return folders.value.filter((f) => ids.has(f.id));
  }
  function tagsFor(bookmarkId: string): Tag[] {
    const ids = tagsOf.value.get(bookmarkId);
    if (!ids) return [];
    return tags.value.filter((t) => ids.has(t.id));
  }

  // ── 載入 ──────────────────────────────────────────
  async function reloadBookmarks(): Promise<void> {
    const r = await getRepo();
    bookmarks.value = await r.listBookmarks();
    searchIndex.rebuild(bookmarks.value);
    indexVersion.value++;
  }
  async function reloadRelations(): Promise<void> {
    const r = await getRepo();
    const [f, t, bf, bt] = await Promise.all([r.listFolders(), r.listTags(), r.listBookmarkFolders(), r.listBookmarkTags()]);
    folders.value = f;
    tags.value = t;
    bookmarkFolders.value = bf;
    bookmarkTags.value = bt;
  }
  async function reloadImportJobs(): Promise<void> {
    importJobs.value = await (await getRepo()).listImportJobs();
  }
  async function reloadAutoRules(): Promise<void> {
    autoRules.value = await (await getRepo()).listAutoRules();
  }
  async function reloadAll(): Promise<void> {
    await Promise.all([reloadBookmarks(), reloadRelations(), reloadImportJobs(), reloadAutoRules()]);
  }

  let authWatched = false;
  async function init(): Promise<void> {
    if (ready.value || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      await reloadAll();
      ready.value = true;
    } catch (e) {
      error.value = await describeError(e);
      console.error('[vault] 初始化失敗', error.value);
    } finally {
      loading.value = false;
    }
    if (!authWatched) {
      authWatched = true;
      try {
        const { onCloudUserChange } = await import('@/services/cloud/authService');
        onCloudUserChange(() => void switchRepository().catch(() => undefined));
      } catch {
        /* 無法載入雲端功能時維持本機模式 */
      }
    }
  }

  /** 背景同步錯誤的處理方式由 UI 決定（例如顯示提示） */
  function onSyncError(handler: ((message: string) => void) | null) {
    setSyncErrorHandler(handler ? (e) => void describeError(e).then(handler) : null);
  }

  /** 等待 store 初始化完成（頁面直接以網址開啟時使用） */
  async function whenReady(): Promise<void> {
    if (!ready.value) await init();
  }

  // ── 操作（呼叫服務後更新狀態） ─────────────────────
  type Reload = 'relations' | 'bookmarks' | 'all' | 'rules' | 'rules+relations';
  async function run<T>(fn: (svc: VaultService) => Promise<T>, reload: Reload): Promise<T> {
    const result = await fn(await getService());
    if (reload === 'relations') await reloadRelations();
    else if (reload === 'bookmarks') await reloadBookmarks();
    else if (reload === 'rules') await reloadAutoRules();
    else if (reload === 'rules+relations') await Promise.all([reloadAutoRules(), reloadRelations()]);
    // 分享新增可能被自動分類，所以 bookmarks / all 都要一併更新關聯
    else await Promise.all([reloadBookmarks(), reloadRelations()]);
    return result;
  }

  const createFolder = (input: { name: string; icon?: string; color?: string }) =>
    run((s) => s.createFolder(input), 'relations');
  const updateFolder = (id: string, patch: { name?: string; icon?: string; color?: string }) =>
    run((s) => s.updateFolder(id, patch), 'rules+relations');
  const deleteFolder = (id: string) => run((s) => s.deleteFolder(id), 'relations');

  const ensureTag = (name: string) => run((s) => s.ensureTag(name), 'relations');
  const renameTag = (id: string, name: string) => run((s) => s.renameTag(id, name), 'rules+relations');
  const deleteTag = (id: string) => run((s) => s.deleteTag(id), 'relations');

  const setBookmarkFolders = (id: string, folderIds: string[]) =>
    run((s) => s.setBookmarkFolders(id, folderIds), 'relations');
  const setBookmarkTags = (id: string, tagIds: string[]) => run((s) => s.setBookmarkTags(id, tagIds), 'relations');

  async function updateBookmark(id: string, patch: { notes?: string | null; title?: string | null; author?: string | null }) {
    const updated = await (await getService()).updateBookmark(id, patch);
    bookmarks.value = bookmarks.value.map((b) => (b.id === id ? updated : b));
    searchIndex.upsert(updated);
    indexVersion.value++;
    return updated;
  }

  const batchAddToFolder = (ids: string[], folderId: string) => run((s) => s.batchAddToFolder(ids, folderId), 'relations');
  const batchRemoveFromFolder = (ids: string[], folderId: string) =>
    run((s) => s.batchRemoveFromFolder(ids, folderId), 'relations');
  const batchAddTag = (ids: string[], tagId: string) => run((s) => s.batchAddTag(ids, tagId), 'relations');
  const batchRemoveTag = (ids: string[], tagId: string) => run((s) => s.batchRemoveTag(ids, tagId), 'relations');
  const batchDelete = (ids: string[]) => run((s) => s.batchDelete(ids), 'all');
  const addFromSharedText = (text: string, source: 'share' | 'manual' = 'share') =>
    run((s) => s.addFromSharedText(text, source), 'all');

  const createAutoRule = (input: AutoRuleInput) => run((s) => s.createAutoRule(input), 'rules');
  const updateAutoRule = (id: string, patch: Partial<AutoRuleInput>) => run((s) => s.updateAutoRule(id, patch), 'rules');
  const deleteAutoRule = (id: string) => run((s) => s.deleteAutoRule(id), 'rules');
  const moveAutoRule = (id: string, direction: -1 | 1) => run((s) => s.moveAutoRule(id, direction), 'rules');
  const loadSuggestedRules = () => run((s) => s.loadSuggestedRules(), 'rules');
  const planApplyRulesToAll = async () => (await getService()).planApplyRulesToAll();
  const applyRulesToAll = () => run((s) => s.applyRulesToAll(), 'relations');

  return {
    ready, loading, error, storageKind,
    bookmarks, folders, tags, bookmarkFolders, bookmarkTags, importJobs, autoRules,
    searchIndex, indexVersion,
    bookmarkById, folderById, tagById, foldersOf, tagsOf, folderCounts, tagCounts,
    uncategorizedCount, missingUrlCount, foldersFor, tagsFor,
    init, whenReady, reloadAll, reloadImportJobs, getRepo, switchRepository, onSyncError,
    createFolder, updateFolder, deleteFolder, ensureTag, renameTag, deleteTag,
    setBookmarkFolders, setBookmarkTags, updateBookmark,
    batchAddToFolder, batchRemoveFromFolder, batchAddTag, batchRemoveTag, batchDelete, addFromSharedText,
    createAutoRule, updateAutoRule, deleteAutoRule, moveAutoRule, loadSuggestedRules, planApplyRulesToAll, applyRulesToAll,
  };
});
