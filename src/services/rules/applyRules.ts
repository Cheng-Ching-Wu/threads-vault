import type { VaultRepository } from '@/database/repositories/VaultRepository';
import type { AutoRule, Bookmark, BookmarkFolder, BookmarkTag, Folder, Tag } from '@/shared/types/models';
import { nowIso } from '@/shared/utils/id';
import { createTargetResolver } from '@/services/targetResolver';
import { bookmarkMatchText, compileRules, matchText } from './ruleEngine';

/**
 * 把規則套用到既有收藏。只會「加上」分類，不會移除任何資料夾或標籤：
 * - 資料夾規則：只處理目前不在任何資料夾裡的收藏。
 * - 標籤規則：加上尚未有的標籤。
 */
export interface RuleApplyPlan {
  /** 會被加上資料夾或標籤的收藏數 */
  affectedCount: number;
  folderAssignments: number;
  tagAssignments: number;
  newFolders: Folder[];
  newTags: Tag[];
  bookmarkFolders: BookmarkFolder[];
  bookmarkTags: BookmarkTag[];
}

export async function planRuleApplication(
  repo: VaultRepository,
  bookmarks: Bookmark[],
  rules: AutoRule[],
): Promise<RuleApplyPlan> {
  const now = nowIso();
  const compiled = compileRules(rules);
  const [folders, tags, links, tagLinks] = await Promise.all([
    repo.listFolders(),
    repo.listTags(),
    repo.listBookmarkFolders(),
    repo.listBookmarkTags(),
  ]);
  const filed = new Set(links.map((l) => l.bookmarkId));
  const hasTag = new Set(tagLinks.map((l) => `${l.bookmarkId}|${l.tagId}`));
  const resolve = createTargetResolver(folders, tags, now);
  const bookmarkFolders: BookmarkFolder[] = [];
  const bookmarkTags: BookmarkTag[] = [];
  let affectedCount = 0;

  if (compiled.length) {
    for (const b of bookmarks) {
      const m = matchText(bookmarkMatchText(b), compiled);
      let touched = false;
      if (m.folderName && !filed.has(b.id)) {
        const f = resolve.folder(m.folderName);
        if (f) {
          bookmarkFolders.push({ bookmarkId: b.id, folderId: f.id, createdAt: now });
          touched = true;
        }
      }
      for (const name of m.tagNames) {
        const t = resolve.tag(name);
        if (t && !hasTag.has(`${b.id}|${t.id}`)) {
          bookmarkTags.push({ bookmarkId: b.id, tagId: t.id, createdAt: now });
          touched = true;
        }
      }
      if (touched) affectedCount++;
    }
  }

  // 只建立真的會用到的資料夾 / 標籤
  const usedFolders = new Set(bookmarkFolders.map((l) => l.folderId));
  const usedTags = new Set(bookmarkTags.map((l) => l.tagId));
  return {
    affectedCount,
    folderAssignments: bookmarkFolders.length,
    tagAssignments: bookmarkTags.length,
    newFolders: resolve.newFolders.filter((f) => usedFolders.has(f.id)),
    newTags: resolve.newTags.filter((t) => usedTags.has(t.id)),
    bookmarkFolders,
    bookmarkTags,
  };
}

/** 在單一交易內寫入規則套用結果 */
export async function commitRuleApplication(repo: VaultRepository, plan: RuleApplyPlan): Promise<void> {
  if (!plan.bookmarkFolders.length && !plan.bookmarkTags.length) return;
  await repo.applyImport({
    bookmarks: [],
    folders: plan.newFolders,
    tags: plan.newTags,
    bookmarkFolders: plan.bookmarkFolders,
    bookmarkTags: plan.bookmarkTags,
  });
}
