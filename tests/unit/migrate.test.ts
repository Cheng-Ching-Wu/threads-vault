import { afterEach, describe, expect, it } from 'vitest';
import type { VaultRepository } from '@/database/repositories/VaultRepository';
import { copyVault } from '@/services/cloud/migrate';
import { commitImport } from '@/services/import/importService';
import { parseGenericJson } from '@/services/import/genericParser';
import { VaultService } from '@/services/vaultService';
import { repoFactories } from '../helpers/fixtures';

const url = (id: string) => `https://www.threads.com/t/${id}`;
const local = repoFactories[0]![1];

// 目標資料庫（雲端）依序用每一種儲存方式測試；在模擬器下也會測 Firestore
describe.each(repoFactories)('上傳本機資料（目標：%s）', (_name, factory) => {
  const opened: VaultRepository[] = [];
  const open = async (f: () => Promise<VaultRepository>) => {
    const r = await f();
    opened.push(r);
    return r;
  };
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((r) => r.close()));
  });

  async function seededLocal() {
    const repo = await open(local);
    const svc = new VaultService(repo);
    await commitImport(
      repo,
      await parseGenericJson([
        { url: url('AAA111'), content: '崔多蘭', folders: '電競', tags: 'Doran', notes: '本機備註' },
        { url: url('BBB222'), content: '好吃的餐廳' },
      ]),
      'json',
    );
    const [folder] = await repo.listFolders();
    await svc.updateFolder(folder!.id, { icon: 'game-controller-outline', color: '#ef4444' });
    await svc.createAutoRule({ targetType: 'tag', targetName: 'Doran', keywords: ['崔多蘭'] });
    return repo;
  }

  it('目標是空的：完整複製，保留資料夾圖示與顏色', async () => {
    const from = await seededLocal();
    const to = await open(factory);
    const result = await copyVault(from, to);
    expect(result).toMatchObject({ mode: 'replace', bookmarks: 2, rules: 1 });
    expect(await to.countBookmarks()).toBe(2);
    expect((await to.listFolders())[0]).toMatchObject({ name: '電競', icon: 'game-controller-outline', color: '#ef4444' });
    expect(await to.listBookmarkTags()).toHaveLength(1);
    expect((await to.listBookmarks()).find((b) => b.platformPostId === 'AAA111')?.notes).toBe('本機備註');
    // 來源不受影響
    expect(await from.countBookmarks()).toBe(2);
  });

  it('目標已有資料：合併，不重複、保留目標的備註，相同規則不重複', async () => {
    const from = await seededLocal();
    const to = await open(factory);
    const svc = new VaultService(to);
    await commitImport(
      to,
      await parseGenericJson([
        { url: url('AAA111'), content: '崔多蘭', notes: '雲端備註' },
        { url: url('CCC333'), content: '雲端才有的' },
      ]),
      'json',
    );
    await svc.createAutoRule({ targetType: 'tag', targetName: 'Doran', keywords: ['崔多蘭'] });

    const result = await copyVault(from, to);
    expect(result).toMatchObject({ mode: 'merge', bookmarks: 2, added: 1, rules: 0 });
    const all = await to.listBookmarks();
    expect(all.map((b) => b.platformPostId).sort()).toEqual(['AAA111', 'BBB222', 'CCC333']);
    expect(all.find((b) => b.platformPostId === 'AAA111')?.notes).toBe('雲端備註');
    expect((await to.listFolders()).map((f) => f.name)).toEqual(['電競']);
    expect(await to.listAutoRules()).toHaveLength(1);

    // 再上傳一次不會有任何變化
    const again = await copyVault(from, to);
    expect(again.added).toBe(0);
    expect(await to.countBookmarks()).toBe(3);
  });
});
