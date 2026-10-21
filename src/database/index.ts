import { Capacitor } from '@capacitor/core';
import type { VaultRepository } from './repositories/VaultRepository';
import { IndexedDbVaultRepository } from './adapters/indexeddb/IndexedDbVaultRepository';

let current: VaultRepository | null = null;
let pending: Promise<VaultRepository> | null = null;
let local: Promise<VaultRepository> | null = null;
let syncErrorHandler: ((error: unknown) => void) | null = null;

/**
 * 本機資料庫（不需登入）：
 * - 原生 App（Android / iOS）→ SQLite
 * - 瀏覽器 → IndexedDB
 * 登入雲端後本機資料仍保留，登出即回到本機資料；也用於「上傳本機資料到雲端」。
 */
export function getLocalRepository(): Promise<VaultRepository> {
  local ??= (async () => {
    if (Capacitor.isNativePlatform()) {
      const [{ SqliteVaultRepository }, { CapacitorSqliteDriver }] = await Promise.all([
        import('./adapters/sqlite/SqliteVaultRepository'),
        import('./adapters/sqlite/CapacitorSqliteDriver'),
      ]);
      const repo = new SqliteVaultRepository(new CapacitorSqliteDriver());
      await repo.init();
      return repo;
    }
    const repo = new IndexedDbVaultRepository();
    await repo.init();
    return repo;
  })().catch((err) => {
    local = null;
    throw err;
  });
  return local;
}

/** 已登入 → 雲端（Firestore）；未登入 → 本機 */
async function create(): Promise<VaultRepository> {
  const { authReady, cloudUser } = await import('@/services/cloud/authService');
  // 要用「目前」的登入狀態：authReady() 只代表啟動時的狀態，登入或登出後就過時了
  await authReady();
  const user = cloudUser.value;
  if (!user) return getLocalRepository();
  const [{ FirestoreVaultRepository }, { firestore }] = await Promise.all([
    import('./adapters/firestore/FirestoreVaultRepository'),
    import('@/services/cloud/firebase'),
  ]);
  const repo = new FirestoreVaultRepository(firestore(), user.uid, {
    onSyncError: (e) => syncErrorHandler?.(e),
  });
  await repo.init();
  return repo;
}

export function getRepository(): Promise<VaultRepository> {
  if (current) return Promise.resolve(current);
  pending ??= create()
    .then((r) => (current = r))
    .finally(() => (pending = null));
  return pending;
}

/** 登入 / 登出後呼叫：關閉雲端連線（本機資料庫保持開啟），下次 getRepository() 會依登入狀態重新選擇 */
export async function resetRepository(): Promise<void> {
  const prev = current;
  current = null;
  pending = null;
  if (prev && prev.kind === 'firestore') await prev.close();
}

/** 背景同步失敗時的通知（例如權限被拒），由 UI 顯示提示 */
export function setSyncErrorHandler(handler: ((error: unknown) => void) | null): void {
  syncErrorHandler = handler;
}

/** 測試用：注入自訂 repository */
export function setRepository(repo: VaultRepository | null): void {
  current = repo;
  pending = null;
}

export type { VaultRepository };
