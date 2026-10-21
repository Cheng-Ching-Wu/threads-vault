import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VaultRepository } from '@/database/repositories/VaultRepository';
import type { Bookmark } from '@/shared/types/models';
import { repoFactories } from '../helpers/fixtures';

function bm(id: string, extra: Partial<Bookmark> = {}): Bookmark {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id, platform: 'threads', platformPostId: `P${id}`, fbid: `F${id}`, originalUrl: null, canonicalUrl: null,
    author: null, title: null, content: `內容 ${id}`, thumbnailUrl: null, savedAt: now, importedAt: now,
    updatedAt: now, notes: null, status: 'normal', source: 'manual', ...extra,
  };
}

describe.each(repoFactories)('%s repository 合約', (_name, factory) => {
  let repo: VaultRepository;
  beforeEach(async () => {
    repo = await factory();
  });
  afterEach(async () => {
    await repo.close();
  });

  it('新增、讀取與計數收藏', async () => {
    await repo.putBookmarks([bm('a'), bm('b', { platformPostId: null, fbid: null, status: 'missing_url' })]);
    expect(await repo.countBookmarks()).toBe(2);
    expect((await repo.getBookmark('a'))?.content).toBe('內容 a');
    expect((await repo.getBookmark('b'))?.platformPostId).toBeNull();
    expect(await repo.getBookmark('zzz')).toBeNull();
  });

  it('依貼文代碼或 fbid 找到既有收藏', async () => {
    await repo.putBookmarks([bm('a'), bm('b')]);
    const found = await repo.findBookmarksByIdentity({ platformPostIds: ['Pa'], fbids: ['Fb', 'none'] });
    expect(found.map((b) => b.id).sort()).toEqual(['a', 'b']);
  });

  it('多筆 null 識別碼不違反唯一性，但重複的 fbid 會被拒絕', async () => {
    await repo.putBookmarks([
      bm('a', { platformPostId: null, fbid: null }),
      bm('b', { platformPostId: null, fbid: null }),
    ]);
    expect(await repo.countBookmarks()).toBe(2);
    await expect(repo.putBookmarks([bm('c', { fbid: 'X' }), bm('d', { fbid: 'X', platformPostId: 'Q' })])).rejects.toBeTruthy();
    // 交易回滾：c 也不能被寫入
    expect(await repo.getBookmark('c')).toBeNull();
  });

  it('刪除資料夾不會刪除收藏', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    await repo.putBookmarks([bm('a'), bm('b')]);
    await repo.putFolder({ id: 'f1', name: '工作', icon: 'folder-outline', color: '#000', sortOrder: 1, createdAt: now, updatedAt: now });
    await repo.addBookmarkFolders([
      { bookmarkId: 'a', folderId: 'f1', createdAt: now },
      { bookmarkId: 'b', folderId: 'f1', createdAt: now },
    ]);
    await repo.deleteFolder('f1');
    expect(await repo.countBookmarks()).toBe(2);
    expect(await repo.listFolders()).toHaveLength(0);
    expect(await repo.listBookmarkFolders()).toHaveLength(0);
  });

  it('刪除收藏會一併移除關聯', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    await repo.putBookmarks([bm('a'), bm('b')]);
    await repo.putTag({ id: 't1', name: '必讀', color: '#000', createdAt: now });
    await repo.addBookmarkTags([
      { bookmarkId: 'a', tagId: 't1', createdAt: now },
      { bookmarkId: 'b', tagId: 't1', createdAt: now },
    ]);
    await repo.deleteBookmarks(['a']);
    expect(await repo.countBookmarks()).toBe(1);
    expect((await repo.listBookmarkTags()).map((l) => l.bookmarkId)).toEqual(['b']);
    expect(await repo.listTags()).toHaveLength(1);
  });

  it('重複加入同一關聯不會產生重複資料', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    await repo.putBookmarks([bm('a')]);
    await repo.putTag({ id: 't1', name: '必讀', color: '#000', createdAt: now });
    await repo.addBookmarkTags([{ bookmarkId: 'a', tagId: 't1', createdAt: now }]);
    await repo.addBookmarkTags([{ bookmarkId: 'a', tagId: 't1', createdAt: now }]);
    expect(await repo.listBookmarkTags()).toHaveLength(1);
  });

  it('applyImport 失敗時完全回滾', async () => {
    await repo.putBookmarks([bm('existing', { fbid: 'DUP' })]);
    await expect(
      repo.applyImport({
        bookmarks: [bm('new1'), bm('new2', { fbid: 'DUP' })],
        folders: [],
        tags: [{ id: 't', name: 'x', color: '#000', createdAt: '2026-01-01T00:00:00.000Z' }],
        bookmarkFolders: [],
        bookmarkTags: [],
      }),
    ).rejects.toBeTruthy();
    expect(await repo.countBookmarks()).toBe(1);
    expect(await repo.listTags()).toHaveLength(0);
    expect((await repo.getBookmark('existing'))?.content).toBe('內容 existing');
  });

  it('匯出快照後可完整取代', async () => {
    await repo.putBookmarks([bm('a')]);
    const snap = await repo.exportSnapshot();
    await repo.clearAll();
    expect(await repo.countBookmarks()).toBe(0);
    await repo.replaceAll(snap);
    expect(await repo.countBookmarks()).toBe(1);
  });
});
