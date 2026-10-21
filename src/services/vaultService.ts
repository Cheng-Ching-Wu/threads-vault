import type { VaultRepository } from '@/database/repositories/VaultRepository';
import type { AutoRule, AutoRuleMatchMode, AutoRuleTarget, Bookmark, Folder, Tag } from '@/shared/types/models';
import { newId, nowIso } from '@/shared/utils/id';
import { nameKey, normalizeName } from '@/shared/utils/text';
import { DEFAULT_FOLDER_COLOR, DEFAULT_FOLDER_ICON, DEFAULT_TAG_COLOR } from '@/shared/utils/palette';
import { extractThreadsUrl, parseThreadsUrl } from '@/services/import/threadsUrl';
import { commitRuleApplication, planRuleApplication, type RuleApplyPlan } from '@/services/rules/applyRules';
import { normalizeForMatch, ruleSignature } from '@/services/rules/ruleEngine';
import { SUGGESTED_RULES } from '@/services/rules/suggestedRules';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const MAX_NAME_LENGTH = 50;
const MAX_KEYWORDS = 100;
const MAX_KEYWORD_LENGTH = 50;

export interface AutoRuleInput {
  targetType: AutoRuleTarget;
  targetName: string;
  keywords: string[];
  matchMode?: AutoRuleMatchMode;
  enabled?: boolean;
}

function validateKeywords(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw.map((x) => x.trim()).filter(Boolean)) {
    if (k.length > MAX_KEYWORD_LENGTH) throw new ValidationError(`關鍵字最多 ${MAX_KEYWORD_LENGTH} 個字：${k.slice(0, 20)}…`);
    const key = normalizeForMatch(k);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(k);
    }
  }
  if (!out.length) throw new ValidationError('請至少輸入一個關鍵字');
  if (out.length > MAX_KEYWORDS) throw new ValidationError(`一條規則最多 ${MAX_KEYWORDS} 個關鍵字`);
  return out;
}


function validateName(raw: string, kind: string): string {
  const name = normalizeName(raw);
  if (!name) throw new ValidationError(`${kind}名稱不可空白`);
  if (name.length > MAX_NAME_LENGTH) throw new ValidationError(`${kind}名稱最多 ${MAX_NAME_LENGTH} 個字`);
  return name;
}

/**
 * 收藏、資料夾、標籤的業務邏輯。只透過 VaultRepository 存取資料，
 * 因此 Web（IndexedDB）與原生（SQLite）行為一致，也方便單元測試。
 */
export class VaultService {
  constructor(private readonly repo: VaultRepository) {}

  // ── 資料夾 ────────────────────────────────────────
  async createFolder(input: { name: string; icon?: string; color?: string }): Promise<Folder> {
    const name = validateName(input.name, '資料夾');
    const folders = await this.repo.listFolders();
    if (folders.some((f) => nameKey(f.name) === nameKey(name))) {
      throw new ValidationError(`已經有名為「${name}」的資料夾`);
    }
    const now = nowIso();
    const folder: Folder = {
      id: newId(),
      name,
      icon: input.icon || DEFAULT_FOLDER_ICON,
      color: input.color || DEFAULT_FOLDER_COLOR,
      sortOrder: folders.reduce((m, f) => Math.max(m, f.sortOrder), 0) + 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.putFolder(folder);
    return folder;
  }

  async updateFolder(id: string, patch: { name?: string; icon?: string; color?: string }): Promise<Folder> {
    const folders = await this.repo.listFolders();
    const folder = folders.find((f) => f.id === id);
    if (!folder) throw new ValidationError('找不到這個資料夾');
    const next: Folder = { ...folder, updatedAt: nowIso() };
    if (patch.name !== undefined) {
      next.name = validateName(patch.name, '資料夾');
      if (folders.some((f) => f.id !== id && nameKey(f.name) === nameKey(next.name))) {
        throw new ValidationError(`已經有名為「${next.name}」的資料夾`);
      }
    }
    if (patch.icon) next.icon = patch.icon;
    if (patch.color) next.color = patch.color;
    await this.repo.putFolder(next);
    if (nameKey(next.name) !== nameKey(folder.name)) await this.retargetRules('folder', folder.name, next.name);
    return next;
  }

  /** 刪除資料夾只會移除分類關聯，收藏本身不受影響 */
  deleteFolder(id: string): Promise<void> {
    return this.repo.deleteFolder(id);
  }

  // ── 標籤 ──────────────────────────────────────────
  /** 建立標籤；同名（不分大小寫）時回傳既有標籤 */
  async ensureTag(rawName: string, color = DEFAULT_TAG_COLOR): Promise<Tag> {
    const name = validateName(rawName, '標籤');
    const existing = (await this.repo.listTags()).find((t) => nameKey(t.name) === nameKey(name));
    if (existing) return existing;
    const tag: Tag = { id: newId(), name, color, createdAt: nowIso() };
    await this.repo.putTag(tag);
    return tag;
  }

  async renameTag(id: string, rawName: string): Promise<Tag> {
    const name = validateName(rawName, '標籤');
    const tags = await this.repo.listTags();
    const tag = tags.find((t) => t.id === id);
    if (!tag) throw new ValidationError('找不到這個標籤');
    if (tags.some((t) => t.id !== id && nameKey(t.name) === nameKey(name))) {
      throw new ValidationError(`已經有名為「${name}」的標籤`);
    }
    const next = { ...tag, name };
    await this.repo.putTag(next);
    if (nameKey(name) !== nameKey(tag.name)) await this.retargetRules('tag', tag.name, name);
    return next;
  }

  deleteTag(id: string): Promise<void> {
    return this.repo.deleteTag(id);
  }

  // ── 單篇收藏 ──────────────────────────────────────
  async updateBookmark(id: string, patch: { notes?: string | null; title?: string | null; author?: string | null }) {
    const b = await this.repo.getBookmark(id);
    if (!b) throw new ValidationError('找不到這篇收藏');
    const next: Bookmark = { ...b, updatedAt: nowIso() };
    if (patch.notes !== undefined) next.notes = patch.notes?.trim() ? patch.notes : null;
    if (patch.title !== undefined) next.title = patch.title?.trim() || null;
    if (patch.author !== undefined) next.author = patch.author?.trim().replace(/^@/, '') || null;
    await this.repo.putBookmarks([next]);
    return next;
  }

  /** 將單篇收藏的資料夾設定為指定清單（差異更新） */
  async setBookmarkFolders(bookmarkId: string, folderIds: string[]): Promise<void> {
    const current = (await this.repo.listBookmarkFolders()).filter((l) => l.bookmarkId === bookmarkId);
    const want = new Set(folderIds);
    const have = new Set(current.map((l) => l.folderId));
    const now = nowIso();
    const toAdd = [...want].filter((id) => !have.has(id));
    if (toAdd.length) {
      await this.repo.addBookmarkFolders(toAdd.map((folderId) => ({ bookmarkId, folderId, createdAt: now })));
    }
    for (const folderId of [...have].filter((id) => !want.has(id))) {
      await this.repo.removeBookmarkFolders([bookmarkId], folderId);
    }
  }

  async setBookmarkTags(bookmarkId: string, tagIds: string[]): Promise<void> {
    const current = (await this.repo.listBookmarkTags()).filter((l) => l.bookmarkId === bookmarkId);
    const want = new Set(tagIds);
    const have = new Set(current.map((l) => l.tagId));
    const now = nowIso();
    const toAdd = [...want].filter((id) => !have.has(id));
    if (toAdd.length) {
      await this.repo.addBookmarkTags(toAdd.map((tagId) => ({ bookmarkId, tagId, createdAt: now })));
    }
    for (const tagId of [...have].filter((id) => !want.has(id))) {
      await this.repo.removeBookmarkTags([bookmarkId], tagId);
    }
  }

  // ── 批次操作 ──────────────────────────────────────
  async batchAddToFolder(bookmarkIds: string[], folderId: string): Promise<void> {
    if (!bookmarkIds.length) return;
    const now = nowIso();
    await this.repo.addBookmarkFolders(bookmarkIds.map((bookmarkId) => ({ bookmarkId, folderId, createdAt: now })));
  }

  async batchRemoveFromFolder(bookmarkIds: string[], folderId: string): Promise<void> {
    if (!bookmarkIds.length) return;
    await this.repo.removeBookmarkFolders(bookmarkIds, folderId);
  }

  async batchAddTag(bookmarkIds: string[], tagId: string): Promise<void> {
    if (!bookmarkIds.length) return;
    const now = nowIso();
    await this.repo.addBookmarkTags(bookmarkIds.map((bookmarkId) => ({ bookmarkId, tagId, createdAt: now })));
  }

  async batchRemoveTag(bookmarkIds: string[], tagId: string): Promise<void> {
    if (!bookmarkIds.length) return;
    await this.repo.removeBookmarkTags(bookmarkIds, tagId);
  }

  async batchDelete(bookmarkIds: string[]): Promise<void> {
    if (!bookmarkIds.length) return;
    await this.repo.deleteBookmarks(bookmarkIds);
  }

  // ── 自動分類規則 ──────────────────────────────────
  listAutoRules(): Promise<AutoRule[]> {
    return this.repo.listAutoRules();
  }

  async createAutoRule(input: AutoRuleInput): Promise<AutoRule> {
    const rules = await this.repo.listAutoRules();
    const now = nowIso();
    const rule: AutoRule = {
      id: newId(),
      targetType: input.targetType,
      targetName: validateName(input.targetName, input.targetType === 'folder' ? '資料夾' : '標籤'),
      keywords: validateKeywords(input.keywords),
      matchMode: input.matchMode ?? 'any',
      enabled: input.enabled ?? true,
      sortOrder: rules.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.putAutoRules([rule]);
    return rule;
  }

  async updateAutoRule(id: string, patch: Partial<AutoRuleInput>): Promise<AutoRule> {
    const rule = (await this.repo.listAutoRules()).find((r) => r.id === id);
    if (!rule) throw new ValidationError('找不到這條規則');
    const next: AutoRule = { ...rule, updatedAt: nowIso() };
    if (patch.targetType) next.targetType = patch.targetType;
    if (patch.targetName !== undefined) {
      next.targetName = validateName(patch.targetName, next.targetType === 'folder' ? '資料夾' : '標籤');
    }
    if (patch.keywords) next.keywords = validateKeywords(patch.keywords);
    if (patch.matchMode) next.matchMode = patch.matchMode;
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    await this.repo.putAutoRules([next]);
    return next;
  }

  deleteAutoRule(id: string): Promise<void> {
    return this.repo.deleteAutoRule(id);
  }

  /** 與前一條（-1）或後一條（+1）同類型的規則交換順序 */
  async moveAutoRule(id: string, direction: -1 | 1): Promise<void> {
    const rules = await this.repo.listAutoRules();
    const target = rules.find((r) => r.id === id);
    if (!target) throw new ValidationError('找不到這條規則');
    const same = rules.filter((r) => r.targetType === target.targetType);
    const i = same.findIndex((r) => r.id === id);
    const a = same[i]!;
    const b = same[i + direction];
    if (!b) return;
    const now = nowIso();
    await this.repo.putAutoRules([
      { ...a, sortOrder: b.sortOrder, updatedAt: now },
      { ...b, sortOrder: a.sortOrder, updatedAt: now },
    ]);
  }

  /** 載入建議規則；已經有相同內容的規則會略過。回傳新增的條數 */
  async loadSuggestedRules(): Promise<number> {
    const rules = await this.repo.listAutoRules();
    const existing = new Set(rules.map(ruleSignature));
    let sortOrder = rules.reduce((m, r) => Math.max(m, r.sortOrder), 0);
    const now = nowIso();
    const toAdd: AutoRule[] = [];
    for (const s of SUGGESTED_RULES) {
      const sig = ruleSignature(s);
      if (existing.has(sig)) continue;
      existing.add(sig);
      toAdd.push({
        id: newId(),
        targetType: s.targetType,
        targetName: normalizeName(s.targetName),
        keywords: [...s.keywords],
        matchMode: s.matchMode ?? 'any',
        enabled: true,
        sortOrder: ++sortOrder,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (toAdd.length) await this.repo.putAutoRules(toAdd);
    return toAdd.length;
  }

  /** 預覽：把啟用中的規則套用到全部收藏會改變什麼（不寫入） */
  async planApplyRulesToAll(): Promise<RuleApplyPlan> {
    const [bookmarks, rules] = await Promise.all([this.repo.listBookmarks(), this.repo.listAutoRules()]);
    return planRuleApplication(this.repo, bookmarks, rules);
  }

  /** 套用到全部收藏，單一交易。會重新計算一次，避免預覽後資料已變動 */
  async applyRulesToAll(): Promise<RuleApplyPlan> {
    const plan = await this.planApplyRulesToAll();
    await commitRuleApplication(this.repo, plan);
    return plan;
  }

  /** 資料夾 / 標籤改名時，讓指向舊名稱的規則跟著改 */
  private async retargetRules(type: AutoRuleTarget, oldName: string, newName: string): Promise<void> {
    const now = nowIso();
    const affected = (await this.repo.listAutoRules())
      .filter((r) => r.targetType === type && nameKey(r.targetName) === nameKey(oldName))
      .map((r) => ({ ...r, targetName: newName, updatedAt: now }));
    if (affected.length) await this.repo.putAutoRules(affected);
  }

  // ── 手動 / 分享新增 ───────────────────────────────
  /**
   * 從分享進來的文字或網址新增收藏。已存在時回傳既有收藏，不會重複新增。
   */
  async addFromSharedText(text: string, source: 'share' | 'manual' = 'share'): Promise<{ bookmark: Bookmark; created: boolean }> {
    const url = extractThreadsUrl(text) ?? text.trim();
    const parsed = parseThreadsUrl(url);
    if (!parsed) throw new ValidationError('找不到有效的 Threads 貼文網址');
    const [existing] = await this.repo.findBookmarksByIdentity({ platformPostIds: [parsed.postId], fbids: [] });
    if (existing) return { bookmark: existing, created: false };
    const now = nowIso();
    const remaining = text.replace(url, '').trim();
    const bookmark: Bookmark = {
      id: newId(),
      platform: 'threads',
      platformPostId: parsed.postId,
      fbid: null,
      originalUrl: url,
      canonicalUrl: parsed.canonicalUrl,
      author: parsed.username,
      title: null,
      content: remaining || null,
      thumbnailUrl: null,
      savedAt: now,
      importedAt: now,
      updatedAt: now,
      notes: null,
      status: 'normal',
      source,
    };
    await this.repo.putBookmarks([bookmark]);
    // 自動分類失敗不影響新增收藏本身
    try {
      const rules = await this.repo.listAutoRules();
      if (rules.some((r) => r.enabled)) {
        await commitRuleApplication(this.repo, await planRuleApplication(this.repo, [bookmark], rules));
      }
    } catch (err) {
      console.warn('[rules] 自動分類失敗', err instanceof Error ? err.message : err);
    }
    return { bookmark, created: true };
  }
}
