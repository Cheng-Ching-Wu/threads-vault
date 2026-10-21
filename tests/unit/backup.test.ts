import { describe, expect, it } from 'vitest';
import { parseBackup, serializeBackup } from '@/services/backup/backupFormat';
import { snapshotToCsv } from '@/services/backup/csvFormat';
import { commitImport } from '@/services/import/importService';
import { parseCsv, parseGenericJson } from '@/services/import/genericParser';
import { parseMetaSavedThreads } from '@/services/import/metaParser';
import { VaultService } from '@/services/vaultService';
import { repoFactories, sampleExport } from '../helpers/fixtures';

async function seeded(factory: (typeof repoFactories)[number][1]) {
  const repo = await factory();
  const svc = new VaultService(repo);
  await commitImport(repo, await parseMetaSavedThreads(sampleExport()), 'meta_json');
  const ids = (await repo.listBookmarks()).map((b) => b.id);
  const f = await svc.createFolder({ name: '技術, 筆記', icon: 'code-slash-outline', color: '#0ea5e9' });
  const t1 = await svc.ensureTag('前端');
  const t2 = await svc.ensureTag('=SUM(A1)'); // 檢查 CSV 公式注入防護
  await svc.batchAddToFolder(ids.slice(0, 2), f.id);
  await svc.batchAddTag(ids.slice(1, 4), t1.id);
  await svc.batchAddTag(ids.slice(0, 1), t2.id);
  await svc.updateBookmark(ids[0]!, { notes: '備註，含 "引號" 與\n換行' });
  return { repo, ids };
}

describe('備份與還原', () => {
  it.each(repoFactories)('JSON 備份還原後保留文章、分類及標籤關係（%s）', async (_n, factory) => {
    const { repo } = await seeded(factory);
    const before = await repo.exportSnapshot();
    const json = serializeBackup(before);

    await repo.clearAll();
    expect(await repo.countBookmarks()).toBe(0);
    await repo.replaceAll(parseBackup(JSON.parse(json)));

    const after = await repo.exportSnapshot();
    const sortBy = <T>(arr: T[], key: (x: T) => string) => [...arr].sort((a, b) => key(a).localeCompare(key(b)));
    expect(sortBy(after.bookmarks, (b) => b.id)).toEqual(sortBy(before.bookmarks, (b) => b.id));
    expect(sortBy(after.folders, (f) => f.id)).toEqual(sortBy(before.folders, (f) => f.id));
    expect(sortBy(after.tags, (t) => t.id)).toEqual(sortBy(before.tags, (t) => t.id));
    expect(sortBy(after.bookmarkFolders, (l) => l.bookmarkId + l.folderId)).toEqual(
      sortBy(before.bookmarkFolders, (l) => l.bookmarkId + l.folderId),
    );
    expect(sortBy(after.bookmarkTags, (l) => l.bookmarkId + l.tagId)).toEqual(
      sortBy(before.bookmarkTags, (l) => l.bookmarkId + l.tagId),
    );
    await repo.close();
  });

  it('IndexedDB 的備份可以還原到 SQLite（跨平台搬家）', async () => {
    const { repo: idb } = await seeded(repoFactories[0]![1]);
    const sqlite = await repoFactories[1]![1]();
    await sqlite.replaceAll(parseBackup(JSON.parse(serializeBackup(await idb.exportSnapshot()))));
    expect(await sqlite.countBookmarks()).toBe(5);
    expect(await sqlite.listBookmarkTags()).toHaveLength(4);
    await idb.close();
    await sqlite.close();
  });

  it('格式錯誤的備份會被拒絕', () => {
    expect(() => parseBackup({ format: 'threads-vault-backup', version: 1 })).toThrow(/備份檔格式錯誤/);
    expect(() => parseBackup({ hello: 1 })).toThrow();
  });

  it('還原失敗時不會清空既有資料', async () => {
    const { repo } = await seeded(repoFactories[1]![1]);
    const snap = await repo.exportSnapshot();
    // 兩筆收藏使用相同 fbid → 違反唯一性 → 交易回滾
    const broken = { ...snap, bookmarks: [...snap.bookmarks, { ...snap.bookmarks[0]!, id: 'dup' }] };
    await expect(repo.replaceAll(broken)).rejects.toBeTruthy();
    expect(await repo.countBookmarks()).toBe(5);
    await repo.close();
  });

  it.each(repoFactories)('CSV 匯出後可以匯入到新的資料庫（%s）', async (_n, factory) => {
    const { repo } = await seeded(factory);
    const csv = snapshotToCsv(await repo.exportSnapshot());
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain("'=SUM(A1)");

    const target = await factory();
    const parse = await parseCsv(csv);
    expect(parse.failures).toEqual([]);
    await commitImport(target, parse, 'csv');
    const snap = await target.exportSnapshot();
    expect(snap.bookmarks).toHaveLength(5);
    expect(snap.folders.map((f) => f.name)).toEqual(['技術, 筆記']);
    expect(snap.tags.map((t) => t.name).sort()).toEqual(['=SUM(A1)', '前端'].sort());
    expect(snap.bookmarkFolders).toHaveLength(2);
    expect(snap.bookmarkTags).toHaveLength(4);
    expect(snap.bookmarks.filter((b) => b.notes).map((b) => b.notes)).toEqual(['備註，含 "引號" 與\n換行']);
    expect(snap.bookmarks.find((b) => b.fbid === '1003')!.status).toBe('missing_url');

    // 再匯入一次不會重複
    await commitImport(target, await parseCsv(csv), 'csv');
    expect(await target.countBookmarks()).toBe(5);
    await repo.close();
    await target.close();
  });

  it('一般 JSON 可以合併匯入備份檔', async () => {
    const { repo } = await seeded(repoFactories[0]![1]);
    const json = JSON.parse(serializeBackup(await repo.exportSnapshot()));
    const target = await repoFactories[0]![1]();
    await commitImport(target, await parseGenericJson(json), 'json');
    expect(await target.countBookmarks()).toBe(5);
    expect(await target.listBookmarkTags()).toHaveLength(4);
    await repo.close();
    await target.close();
  });

  it('一般 JSON 陣列匯入（含別名欄位）', async () => {
    const r = await parseGenericJson([
      { link: 'https://www.threads.net/@a/post/Generic111', text: '內容', tags: ['x', 'y'], folder: '收藏' },
      { url: 'https://example.com/nope' },
      { fbid: '77', caption: '只有 fbid' },
    ]);
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0]).toMatchObject({ platformPostId: 'Generic111', author: 'a', tagNames: ['x', 'y'], folderNames: ['收藏'] });
    expect(r.candidates[1]!.status).toBe('missing_url');
    expect(r.failures).toHaveLength(1);
  });
});
