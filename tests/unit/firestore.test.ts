import { afterEach, describe, expect, it } from 'vitest';
import { disableNetwork, doc, enableNetwork, getDoc, getDocFromServer, setDoc, waitForPendingWrites } from 'firebase/firestore';
import { FirestoreVaultRepository } from '@/database/adapters/firestore/FirestoreVaultRepository';
import type { Bookmark } from '@/shared/types/models';
import { createEmulatorClient, emulatorAvailable, type EmulatorClient } from '../helpers/firestoreEmulator';

const now = '2026-01-01T00:00:00.000Z';
const bm = (id: string): Bookmark => ({
  id, platform: 'threads', platformPostId: `P${id}`, fbid: `F${id}`, originalUrl: null, canonicalUrl: null,
  author: null, title: null, content: `內容 ${id}`, thumbnailUrl: null, savedAt: now, importedAt: now,
  updatedAt: now, notes: null, status: 'normal', source: 'manual',
});

describe.skipIf(!emulatorAvailable)('Firestore 專屬行為（模擬器）', () => {
  const clients: EmulatorClient[] = [];
  const client = async () => {
    const c = await createEmulatorClient();
    clients.push(c);
    return c;
  };
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.dispose()));
  });

  it('安全規則：只能讀寫自己的資料', async () => {
    const a = await client();
    const b = await client();
    await setDoc(doc(a.db, 'users', a.uid, 'bookmarks', 'x'), bm('x'));
    await expect(getDoc(doc(b.db, 'users', a.uid, 'bookmarks', 'x'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(b.db, 'users', a.uid, 'bookmarks', 'y'), bm('y'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    // 不在允許清單內的集合也會被拒絕
    await expect(setDoc(doc(a.db, 'users', a.uid, 'secrets', 'z'), { a: 1 })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('離線時寫入不會卡住，恢復連線後自動上傳到伺服器', async () => {
    const c = await client();
    const errors: unknown[] = [];
    const repo = new FirestoreVaultRepository(c.db, c.uid, { ackTimeoutMs: 300, onSyncError: (e) => errors.push(e) });
    await repo.init();
    await disableNetwork(c.db);

    const started = Date.now();
    await repo.putBookmarks([bm('offline')]);
    expect(Date.now() - started).toBeLessThan(3000);
    // 離線時本機立刻看得到
    expect((await repo.getBookmark('offline'))?.content).toBe('內容 offline');

    await enableNetwork(c.db);
    await waitForPendingWrites(c.db);
    const server = await getDocFromServer(doc(c.db, 'users', c.uid, 'bookmarks', 'offline'));
    expect(server.data()?.content).toBe('內容 offline');
    expect(errors).toEqual([]);
    await repo.close();
  });

  it('另一台裝置的修改會即時反映並觸發通知', async () => {
    const c = await client();
    const repo = new FirestoreVaultRepository(c.db, c.uid, { ackTimeoutMs: Infinity });
    await repo.init();
    let notified = 0;
    repo.onChange(() => notified++);
    // 模擬「另一台裝置」：繞過 repository 直接寫入同一個帳號的資料
    await setDoc(doc(c.db, 'users', c.uid, 'bookmarks', 'remote'), bm('remote'));
    await expect.poll(() => repo.getBookmark('remote').then((b) => b?.id)).toBe('remote');
    expect(notified).toBeGreaterThan(0);
    await repo.close();
  });

  it('大量資料會分批送出（超過單批上限）', async () => {
    const c = await client();
    const repo = new FirestoreVaultRepository(c.db, c.uid, { ackTimeoutMs: Infinity });
    await repo.init();
    const many = Array.from({ length: 950 }, (_, i) => bm(`n${i}`));
    await repo.applyImport({
      bookmarks: many,
      folders: [{ id: 'f', name: '全部', icon: 'folder-outline', color: '#000', sortOrder: 1, createdAt: now, updatedAt: now }],
      tags: [],
      bookmarkFolders: many.map((b) => ({ bookmarkId: b.id, folderId: 'f', createdAt: now })),
      bookmarkTags: [],
    });
    expect(await repo.countBookmarks()).toBe(950);
    expect(await repo.listBookmarkFolders()).toHaveLength(950);
    await repo.close();

    // 用新的連線重新讀取，確認伺服器上真的有
    const again = new FirestoreVaultRepository(c.db, c.uid);
    await again.init();
    expect(await again.countBookmarks()).toBe(950);
    await again.close();
  });
});
