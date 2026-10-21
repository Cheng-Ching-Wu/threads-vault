import type { VaultRepository } from '@/database/repositories/VaultRepository';
import type { AutoRule } from '@/shared/types/models';
import { serializeBackup } from '@/services/backup/backupFormat';
import { parseGenericJson } from '@/services/import/genericParser';
import { commitImport } from '@/services/import/importService';
import { ruleSignature } from '@/services/rules/ruleEngine';
import { newId, nowIso } from '@/shared/utils/id';

export interface CopyResult {
  /** replace：目標是空的，完整複製（保留資料夾圖示、顏色、建立時間）；merge：與目標既有資料合併 */
  mode: 'replace' | 'merge';
  bookmarks: number;
  added: number;
  rules: number;
}

async function isEmpty(repo: VaultRepository): Promise<boolean> {
  const [n, folders, tags, rules] = await Promise.all([
    repo.countBookmarks(),
    repo.listFolders(),
    repo.listTags(),
    repo.listAutoRules(),
  ]);
  return n === 0 && !folders.length && !tags.length && !rules.length;
}

/**
 * 把一個資料庫的內容複製到另一個（用於「上傳本機資料到雲端」）。來源不會被修改。
 * - 目標是空的：完整複製。
 * - 目標已有資料：以合併匯入處理，同一篇收藏不會重複，目標上的備註與分類都會保留；
 *   內容相同的規則不會重複加入。
 */
export async function copyVault(from: VaultRepository, to: VaultRepository): Promise<CopyResult> {
  const snapshot = await from.exportSnapshot();
  if (await isEmpty(to)) {
    await to.replaceAll(snapshot);
    return { mode: 'replace', bookmarks: snapshot.bookmarks.length, added: snapshot.bookmarks.length, rules: snapshot.autoRules.length };
  }

  const parse = await parseGenericJson(JSON.parse(serializeBackup(snapshot)));
  const { job } = await commitImport(to, parse, 'json', '從本機上傳');
  if (job.status === 'failed') throw new Error(job.errorMessage ?? '上傳失敗');

  const existing = await to.listAutoRules();
  const seen = new Set(existing.map(ruleSignature));
  let sortOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  const now = nowIso();
  const rules: AutoRule[] = [];
  for (const r of snapshot.autoRules) {
    const sig = ruleSignature(r);
    if (seen.has(sig)) continue;
    seen.add(sig);
    rules.push({ ...r, id: newId(), sortOrder: ++sortOrder, updatedAt: now });
  }
  if (rules.length) await to.putAutoRules(rules);
  return { mode: 'merge', bookmarks: snapshot.bookmarks.length, added: job.counts.added, rules: rules.length };
}
