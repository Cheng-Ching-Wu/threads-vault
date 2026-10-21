import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VaultRepository } from '@/database/repositories/VaultRepository';
import { commitImport } from '@/services/import/importService';
import { parseMetaSavedThreads } from '@/services/import/metaParser';
import { ValidationError, VaultService } from '@/services/vaultService';
import { repoFactories, sampleExport } from '../helpers/fixtures';

describe.each(repoFactories)('批次分類與管理（%s）', (_name, factory) => {
  let repo: VaultRepository;
  let svc: VaultService;
  let ids: string[];
  beforeEach(async () => {
    repo = await factory();
    svc = new VaultService(repo);
    await commitImport(repo, await parseMetaSavedThreads(sampleExport()), 'meta_json');
    ids = (await repo.listBookmarks()).map((b) => b.id);
  });
  afterEach(async () => {
    await repo.close();
  });

  it('批次加入與移出資料夾', async () => {
    const f = await svc.createFolder({ name: '稍後閱讀', icon: 'book-outline', color: '#10b981' });
    await svc.batchAddToFolder(ids.slice(0, 3), f.id);
    await svc.batchAddToFolder(ids.slice(0, 3), f.id); // 重複操作不產生重複
    expect((await repo.listBookmarkFolders()).filter((l) => l.folderId === f.id)).toHaveLength(3);
    await svc.batchRemoveFromFolder(ids.slice(0, 2), f.id);
    expect((await repo.listBookmarkFolders()).map((l) => l.bookmarkId)).toEqual([ids[2]]);
  });

  it('一篇文章可以屬於多個資料夾、多個標籤', async () => {
    const f1 = await svc.createFolder({ name: 'A' });
    const f2 = await svc.createFolder({ name: 'B' });
    const t1 = await svc.ensureTag('#設計');
    const t2 = await svc.ensureTag('靈感');
    await svc.setBookmarkFolders(ids[0]!, [f1.id, f2.id]);
    await svc.setBookmarkTags(ids[0]!, [t1.id, t2.id]);
    expect((await repo.listBookmarkFolders()).filter((l) => l.bookmarkId === ids[0])).toHaveLength(2);
    expect((await repo.listBookmarkTags()).filter((l) => l.bookmarkId === ids[0])).toHaveLength(2);
    await svc.setBookmarkFolders(ids[0]!, [f2.id]);
    expect((await repo.listBookmarkFolders()).map((l) => l.folderId)).toEqual([f2.id]);
  });

  it('批次加入標籤，標籤名稱不分大小寫且自動去除 #', async () => {
    const t = await svc.ensureTag('#Vue');
    expect(t.name).toBe('Vue');
    expect((await svc.ensureTag('vue')).id).toBe(t.id);
    await svc.batchAddTag(ids, t.id);
    expect(await repo.listBookmarkTags()).toHaveLength(ids.length);
    await svc.batchRemoveTag(ids.slice(0, 1), t.id);
    expect(await repo.listBookmarkTags()).toHaveLength(ids.length - 1);
  });

  it('刪除資料夾不會刪除原始收藏', async () => {
    const f = await svc.createFolder({ name: '要刪除的資料夾' });
    await svc.batchAddToFolder(ids, f.id);
    await svc.deleteFolder(f.id);
    expect(await repo.countBookmarks()).toBe(ids.length);
    expect(await repo.listBookmarkFolders()).toHaveLength(0);
  });

  it('批次刪除收藏', async () => {
    const t = await svc.ensureTag('x');
    await svc.batchAddTag(ids, t.id);
    await svc.batchDelete(ids.slice(0, 2));
    expect(await repo.countBookmarks()).toBe(ids.length - 2);
    expect(await repo.listBookmarkTags()).toHaveLength(ids.length - 2);
  });

  it('資料夾名稱驗證', async () => {
    await svc.createFolder({ name: '工作' });
    await expect(svc.createFolder({ name: ' 工作 ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.createFolder({ name: '   ' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('從分享文字新增收藏，重複分享不會新增第二筆', async () => {
    const r1 = await svc.addFromSharedText('推薦 https://www.threads.com/@dev/post/Shared1234?xmt=abc');
    expect(r1.created).toBe(true);
    expect(r1.bookmark.author).toBe('dev');
    const r2 = await svc.addFromSharedText('https://www.threads.net/t/Shared1234');
    expect(r2.created).toBe(false);
    expect(r2.bookmark.id).toBe(r1.bookmark.id);
    await expect(svc.addFromSharedText('沒有網址')).rejects.toBeInstanceOf(ValidationError);
  });
});
