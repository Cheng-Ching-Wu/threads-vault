import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VaultRepository } from '@/database/repositories/VaultRepository';
import { commitImport, planImport } from '@/services/import/importService';
import { parseMetaSavedThreads } from '@/services/import/metaParser';
import { VaultService } from '@/services/vaultService';
import { metaItem, repoFactories, sampleExport } from '../helpers/fixtures';

describe.each(repoFactories)('匯入流程（%s）', (_name, factory) => {
  let repo: VaultRepository;
  beforeEach(async () => {
    repo = await factory();
  });
  afterEach(async () => {
    await repo.close();
  });

  it('預覽不會寫入資料', async () => {
    const parse = await parseMetaSavedThreads(sampleExport());
    const plan = await planImport(repo, parse, 'meta_json');
    expect(plan.counts).toMatchObject({ total: 5, added: 5, updated: 0, skipped: 0, failed: 0 });
    expect(await repo.countBookmarks()).toBe(0);
  });

  it('匯入包含缺少 URL 的收藏', async () => {
    const { job } = await commitImport(repo, await parseMetaSavedThreads(sampleExport()), 'meta_json', 'x.json');
    expect(job.status).toBe('completed');
    const all = await repo.listBookmarks();
    expect(all).toHaveLength(5);
    const missing = all.filter((b) => b.status === 'missing_url');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.fbid).toBe('1003');
    expect(missing[0]!.canonicalUrl).toBeNull();
  });

  it('重複匯入不增加資料量（冪等）', async () => {
    const data = sampleExport();
    await commitImport(repo, await parseMetaSavedThreads(data), 'meta_json');
    const { job } = await commitImport(repo, await parseMetaSavedThreads(data), 'meta_json');
    expect(job.counts).toMatchObject({ total: 5, added: 0, updated: 0, skipped: 5, failed: 0 });
    expect(await repo.countBookmarks()).toBe(5);
    // 第三次也一樣
    await commitImport(repo, await parseMetaSavedThreads(data), 'meta_json');
    expect(await repo.countBookmarks()).toBe(5);
    expect(await repo.listImportJobs()).toHaveLength(3);
  });

  it('重新匯入會保留手動編輯的備註、資料夾與標籤', async () => {
    const data = sampleExport();
    await commitImport(repo, await parseMetaSavedThreads(data), 'meta_json');
    const svc = new VaultService(repo);
    const target = (await repo.listBookmarks()).find((b) => b.fbid === '1001')!;
    const folder = await svc.createFolder({ name: '前端' });
    const tag = await svc.ensureTag('必讀');
    await svc.batchAddToFolder([target.id], folder.id);
    await svc.batchAddTag([target.id], tag.id);
    await svc.updateBookmark(target.id, { notes: '我的備註' });

    // 新版匯出：內文被修改、新增一筆
    const updated = [...data];
    updated[0] = metaItem({ fbid: '1001', url: 'https://www.threads.com/t/AbCdE12345', caption: '作者修改後的內文' });
    updated.push(metaItem({ fbid: '2001', url: 'https://www.threads.com/t/NewPost999', caption: '新收藏' }));
    const { job } = await commitImport(repo, await parseMetaSavedThreads(updated), 'meta_json');
    expect(job.counts).toMatchObject({ added: 1, updated: 1, skipped: 4 });

    const after = (await repo.getBookmark(target.id))!;
    expect(after.content).toBe('作者修改後的內文');
    expect(after.notes).toBe('我的備註');
    expect(await repo.listBookmarkFolders()).toEqual([expect.objectContaining({ bookmarkId: target.id, folderId: folder.id })]);
    expect(await repo.listBookmarkTags()).toEqual([expect.objectContaining({ bookmarkId: target.id, tagId: tag.id })]);
    expect(await repo.countBookmarks()).toBe(6);
  });

  it('之後取得網址的收藏會補上網址，不會重複', async () => {
    await commitImport(repo, await parseMetaSavedThreads([metaItem({ fbid: '9', url: '', caption: 'x' })]), 'meta_json');
    await commitImport(
      repo,
      await parseMetaSavedThreads([metaItem({ fbid: '9', url: 'https://www.threads.com/t/Found12345', caption: 'x' })]),
      'meta_json',
    );
    const all = await repo.listBookmarks();
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe('normal');
    expect(all[0]!.canonicalUrl).toBe('https://www.threads.com/t/Found12345');
  });

  it('匯入失敗不會損毀既有資料', async () => {
    await commitImport(repo, await parseMetaSavedThreads(sampleExport()), 'meta_json');
    const before = await repo.exportSnapshot();

    // 模擬寫入途中發生錯誤（例如儲存空間不足）
    const failing: VaultRepository = Object.create(repo, {
      applyImport: { value: async () => Promise.reject(new Error('模擬：磁碟已滿')) },
    });
    const more = [...sampleExport(), metaItem({ fbid: '3001', url: 'https://www.threads.com/t/Another111', caption: 'n' })];
    const { job } = await commitImport(failing, await parseMetaSavedThreads(more), 'meta_json');
    expect(job.status).toBe('failed');
    expect(job.errorMessage).toContain('磁碟已滿');

    const after = await repo.exportSnapshot();
    expect(after.bookmarks).toEqual(before.bookmarks);
    expect(await repo.countBookmarks()).toBe(5);
  });

  it('JSON 格式錯誤的檔案在解析階段就被拒絕，資料庫不變', async () => {
    await commitImport(repo, await parseMetaSavedThreads(sampleExport()), 'meta_json');
    await expect(parseMetaSavedThreads({ not: 'valid' })).rejects.toThrow();
    expect(await repo.countBookmarks()).toBe(5);
  });
});
