import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VaultRepository } from '@/database/repositories/VaultRepository';
import { parseBackup, serializeBackup } from '@/services/backup/backupFormat';
import { commitImport, planImport } from '@/services/import/importService';
import { parseGenericJson } from '@/services/import/genericParser';
import { SUGGESTED_RULES } from '@/services/rules/suggestedRules';
import { VaultService } from '@/services/vaultService';
import { repoFactories } from '../helpers/fixtures';

const url = (id: string) => `https://www.threads.com/t/${id}`;

async function namesOf(repo: VaultRepository) {
  const [bookmarks, folders, tags, bf, bt] = await Promise.all([
    repo.listBookmarks(),
    repo.listFolders(),
    repo.listTags(),
    repo.listBookmarkFolders(),
    repo.listBookmarkTags(),
  ]);
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const byPost = new Map<string, { folders: string[]; tags: string[] }>();
  for (const b of bookmarks) {
    byPost.set(b.platformPostId ?? b.id, {
      folders: bf.filter((l) => l.bookmarkId === b.id).map((l) => folderName.get(l.folderId)!).sort(),
      tags: bt.filter((l) => l.bookmarkId === b.id).map((l) => tagName.get(l.tagId)!).sort(),
    });
  }
  return byPost;
}

describe.each(repoFactories)('自動分類規則（%s）', (_name, factory) => {
  let repo: VaultRepository;
  let svc: VaultService;
  beforeEach(async () => {
    repo = await factory();
    svc = new VaultService(repo);
  });
  afterEach(async () => {
    await repo.close();
  });

  it('規則可以新增、修改、排序與刪除', async () => {
    const a = await svc.createAutoRule({ targetType: 'folder', targetName: '電競', keywords: ['T1', ' T1 ', 'LCK'] });
    const b = await svc.createAutoRule({ targetType: 'folder', targetName: '美食', keywords: ['好吃'] });
    const t = await svc.createAutoRule({ targetType: 'tag', targetName: 'Doran', keywords: ['🐿'] });
    expect(a.keywords).toEqual(['T1', 'LCK']);
    expect((await repo.listAutoRules()).map((r) => r.id)).toEqual([a.id, b.id, t.id]);

    await svc.moveAutoRule(b.id, -1);
    expect((await repo.listAutoRules()).map((r) => r.id)).toEqual([b.id, a.id, t.id]);
    // 已經在最前面，不會再動；標籤規則不會跟資料夾規則交換
    await svc.moveAutoRule(b.id, -1);
    await svc.moveAutoRule(t.id, -1);
    expect((await repo.listAutoRules()).map((r) => r.id)).toEqual([b.id, a.id, t.id]);

    const updated = await svc.updateAutoRule(a.id, { enabled: false, matchMode: 'all', keywords: ['T1'] });
    expect(updated).toMatchObject({ enabled: false, matchMode: 'all', keywords: ['T1'] });
    const [stored] = (await repo.listAutoRules()).filter((r) => r.id === a.id);
    expect(stored).toEqual(updated);

    await svc.deleteAutoRule(b.id);
    expect(await repo.listAutoRules()).toHaveLength(2);
  });

  it('沒有關鍵字或名稱空白的規則會被拒絕', async () => {
    await expect(svc.createAutoRule({ targetType: 'tag', targetName: 'x', keywords: [' '] })).rejects.toThrow(/關鍵字/);
    await expect(svc.createAutoRule({ targetType: 'tag', targetName: ' ', keywords: ['a'] })).rejects.toThrow(/名稱/);
  });

  it('匯入時自動分類新收藏，並建立缺少的資料夾與標籤', async () => {
    await svc.createAutoRule({ targetType: 'folder', targetName: '殼蘭', keywords: ['🐈‍⬛', '🐿'], matchMode: 'all' });
    await svc.createAutoRule({ targetType: 'folder', targetName: '電競', keywords: ['T1'] });
    await svc.createAutoRule({ targetType: 'tag', targetName: 'Doran', keywords: ['🐿', '崔多蘭'] });
    await svc.createAutoRule({ targetType: 'tag', targetName: 'Canyon', keywords: ['🐻‍❄️'] });
    const rules = await repo.listAutoRules();

    const parse = await parseGenericJson([
      { url: url('AAA111'), content: '🐈‍⬛🐿️ 又是感激部長的一天' },
      { url: url('BBB222'), content: 'T1 的崔多蘭' },
      { url: url('CCC333'), content: '🐻‍❄️把小黃瓜夾到盤子裡' },
      { url: url('DDD444'), content: '今天吃什麼' },
      { url: url('EEE555'), content: 'T1 比賽', folders: '我的資料夾' },
    ]);
    const plan = await planImport(repo, parse, 'json', null, { autoRules: rules });
    // EEE555 已指定資料夾、也沒有符合的標籤規則，所以不算
    expect(plan.autoClassifiedCount).toBe(3);
    expect(plan.newFolderNames.sort()).toEqual(['我的資料夾', '殼蘭', '電競'].sort());
    expect(plan.newTagNames.sort()).toEqual(['Canyon', 'Doran']);
    expect(await repo.countBookmarks()).toBe(0);

    await commitImport(repo, parse, 'json', null, { autoRules: rules });
    const got = await namesOf(repo);
    expect(got.get('AAA111')).toEqual({ folders: ['殼蘭'], tags: ['Doran'] });
    expect(got.get('BBB222')).toEqual({ folders: ['電競'], tags: ['Doran'] });
    expect(got.get('CCC333')).toEqual({ folders: [], tags: ['Canyon'] });
    expect(got.get('DDD444')).toEqual({ folders: [], tags: [] });
    // 檔案已經指定資料夾，不再套用資料夾規則
    expect(got.get('EEE555')).toEqual({ folders: ['我的資料夾'], tags: [] });
  });

  it('沒有傳入規則時，匯入行為與原本相同', async () => {
    await svc.createAutoRule({ targetType: 'tag', targetName: 'Doran', keywords: ['崔多蘭'] });
    await commitImport(repo, await parseGenericJson([{ url: url('AAA111'), content: '崔多蘭' }]), 'json');
    expect((await namesOf(repo)).get('AAA111')).toEqual({ folders: [], tags: [] });
  });

  it('重新匯入時不會把規則套用到既有收藏（不會加回手動移除的標籤）', async () => {
    const data = [{ url: url('AAA111'), content: '崔多蘭' }];
    await commitImport(repo, await parseGenericJson(data), 'json');
    await svc.createAutoRule({ targetType: 'tag', targetName: 'Doran', keywords: ['崔多蘭'] });
    const { plan } = await commitImport(repo, await parseGenericJson(data), 'json', null, {
      autoRules: await repo.listAutoRules(),
    });
    expect(plan.autoClassifiedCount).toBe(0);
    expect((await namesOf(repo)).get('AAA111')).toEqual({ folders: [], tags: [] });
  });

  it('套用到全部收藏：只補上分類，不移除任何東西，已在資料夾中的收藏不換資料夾', async () => {
    await commitImport(
      repo,
      await parseGenericJson([
        { url: url('AAA111'), content: 'T1 崔多蘭', folders: '手動資料夾', tags: '手動標籤' },
        { url: url('BBB222'), content: 'T1 崔多蘭' },
        { url: url('CCC333'), content: '無關' },
      ]),
      'json',
    );
    await svc.createAutoRule({ targetType: 'folder', targetName: '電競', keywords: ['T1'] });
    await svc.createAutoRule({ targetType: 'tag', targetName: 'Doran', keywords: ['崔多蘭'] });
    await svc.createAutoRule({ targetType: 'tag', targetName: '停用', keywords: ['T1'], enabled: false });

    const preview = await svc.planApplyRulesToAll();
    expect(preview).toMatchObject({ affectedCount: 2, folderAssignments: 1, tagAssignments: 2 });
    expect(preview.newFolders.map((f) => f.name)).toEqual(['電競']);
    expect(await repo.listBookmarkTags()).toHaveLength(1);

    await svc.applyRulesToAll();
    const got = await namesOf(repo);
    expect(got.get('AAA111')).toEqual({ folders: ['手動資料夾'], tags: ['Doran', '手動標籤'] });
    expect(got.get('BBB222')).toEqual({ folders: ['電競'], tags: ['Doran'] });
    expect(got.get('CCC333')).toEqual({ folders: [], tags: [] });

    // 再套用一次不會有任何變化
    expect((await svc.planApplyRulesToAll()).affectedCount).toBe(0);
  });

  it('分享新增的收藏會自動分類', async () => {
    await svc.createAutoRule({ targetType: 'tag', targetName: 'Doran', keywords: ['崔多蘭'] });
    const { bookmark } = await svc.addFromSharedText(`崔多蘭好可愛 ${url('ZZZ999')}`);
    const tagIds = (await repo.listBookmarkTags()).filter((l) => l.bookmarkId === bookmark.id).map((l) => l.tagId);
    expect((await repo.listTags()).filter((t) => tagIds.includes(t.id)).map((t) => t.name)).toEqual(['Doran']);
  });

  it('資料夾與標籤改名時，規則跟著改名', async () => {
    await commitImport(repo, await parseGenericJson([{ url: url('AAA111'), content: 'x', folders: '電競', tags: '蘭' }]), 'json');
    await svc.createAutoRule({ targetType: 'folder', targetName: '電競', keywords: ['T1'] });
    await svc.createAutoRule({ targetType: 'tag', targetName: '蘭', keywords: ['蘭'] });
    const [folder] = await repo.listFolders();
    const [tag] = await repo.listTags();
    await svc.updateFolder(folder!.id, { name: '電競 LoL' });
    await svc.renameTag(tag!.id, 'Doran');
    expect((await repo.listAutoRules()).map((r) => r.targetName)).toEqual(['電競 LoL', 'Doran']);
  });

  it('建議規則可以載入，重複載入不會產生重複規則', async () => {
    const added = await svc.loadSuggestedRules();
    expect(added).toBe(SUGGESTED_RULES.length);
    expect(await svc.loadSuggestedRules()).toBe(0);
    expect(await repo.listAutoRules()).toHaveLength(SUGGESTED_RULES.length);
  });

  it('規則會被備份與還原', async () => {
    await svc.createAutoRule({ targetType: 'tag', targetName: 'Doran', keywords: ['🐿', '崔多蘭'], matchMode: 'all' });
    const before = await repo.exportSnapshot();
    expect(before.autoRules).toHaveLength(1);
    await repo.clearAll();
    expect(await repo.listAutoRules()).toHaveLength(0);
    await repo.replaceAll(parseBackup(JSON.parse(serializeBackup(before))));
    expect(await repo.listAutoRules()).toEqual(before.autoRules);
  });
});

describe('備份格式相容性', () => {
  it('舊版（v1，沒有規則）的備份仍可讀取', () => {
    const snap = parseBackup({
      format: 'threads-vault-backup',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      data: { bookmarks: [], folders: [], tags: [], bookmarkFolders: [], bookmarkTags: [] },
    });
    expect(snap.autoRules).toEqual([]);
  });
});
