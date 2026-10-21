import type { VaultRepository } from '@/database/repositories/VaultRepository';
import type {
  AutoRule,
  Bookmark,
  BookmarkFolder,
  BookmarkTag,
  ImportCounts,
  ImportJob,
  ImportSourceType,
} from '@/shared/types/models';
import { newId, nowIso } from '@/shared/utils/id';
import { nameKey, normalizeName } from '@/shared/utils/text';
import { createTargetResolver } from '@/services/targetResolver';
import { bookmarkMatchText, compileRules, matchText } from '@/services/rules/ruleEngine';
import type { ImportCandidate, ParseResult } from './types';

export type PlanAction = 'add' | 'update' | 'skip';

export interface PlannedItem {
  candidate: ImportCandidate;
  action: PlanAction;
  /** 更新 / 略過時對應的既有收藏 id */
  existingId: string | null;
  /** 會寫入的結果（略過時為 null） */
  result: Bookmark | null;
  changedFields: string[];
}

export interface ImportPlan {
  sourceType: ImportSourceType;
  fileName: string | null;
  parse: ParseResult;
  items: PlannedItem[];
  counts: ImportCounts;
  /** 匯入時會新建的資料夾與標籤名稱 */
  newFolderNames: string[];
  newTagNames: string[];
  /** 被自動分類規則加上資料夾或標籤的新收藏數 */
  autoClassifiedCount: number;
}

export interface ImportOptions {
  /** 套用到「新增」的收藏；既有收藏不受影響（避免加回你手動移除的標籤） */
  autoRules?: AutoRule[];
}

/** 匯入只會「補齊或更新」這些來自來源檔案的欄位；備註、分類、標籤永遠不會被覆蓋或移除。 */
function mergeCandidate(
  existing: Bookmark,
  c: ImportCandidate,
  ownerOf: { post: Map<string, string>; fbid: Map<string, string> },
  now: string,
): { result: Bookmark; changed: string[] } {
  const next: Bookmark = { ...existing };
  const changed: string[] = [];
  const set = <K extends keyof Bookmark>(key: K, value: Bookmark[K]) => {
    if (next[key] !== value) {
      next[key] = value;
      changed.push(key);
    }
  };

  // 識別碼：只補空值，且不能搶走其他收藏已使用的識別碼
  if (!next.platformPostId && c.platformPostId && !ownerOf.post.has(c.platformPostId)) {
    set('platformPostId', c.platformPostId);
  }
  if (!next.fbid && c.fbid && !ownerOf.fbid.has(c.fbid)) set('fbid', c.fbid);

  if (c.canonicalUrl && (!next.canonicalUrl || next.platformPostId === c.platformPostId)) {
    set('canonicalUrl', c.canonicalUrl);
    set('originalUrl', c.originalUrl);
  }
  if (c.content && c.content !== next.content) set('content', c.content);
  if (c.author && !next.author) set('author', c.author);
  if (c.title && !next.title) set('title', c.title);
  if (c.savedAt && !next.savedAt) set('savedAt', c.savedAt);
  if (c.notes && !next.notes) set('notes', c.notes);
  set('status', next.canonicalUrl ? 'normal' : 'missing_url');

  if (changed.length > 0) next.updatedAt = now;
  return { result: next, changed };
}

function newBookmark(c: ImportCandidate, now: string): Bookmark {
  return {
    id: newId(),
    platform: 'threads',
    platformPostId: c.platformPostId,
    fbid: c.fbid,
    originalUrl: c.originalUrl,
    canonicalUrl: c.canonicalUrl,
    author: c.author,
    title: c.title,
    content: c.content,
    thumbnailUrl: null,
    savedAt: c.savedAt,
    importedAt: now,
    updatedAt: now,
    notes: c.notes ?? null,
    status: c.canonicalUrl ? 'normal' : 'missing_url',
    source: c.source,
  };
}

/**
 * 依據目前資料庫內容，計算每筆候選資料會「新增 / 更新 / 略過」。
 * 不會寫入任何資料，可安全地用來顯示匯入預覽。
 */
export async function planImport(
  repo: VaultRepository,
  parse: ParseResult,
  sourceType: ImportSourceType,
  fileName: string | null = null,
  options: ImportOptions = {},
): Promise<ImportPlan> {
  const now = nowIso();
  const existing = await repo.findBookmarksByIdentity({
    platformPostIds: parse.candidates.flatMap((c) => (c.platformPostId ? [c.platformPostId] : [])),
    fbids: parse.candidates.flatMap((c) => (c.fbid ? [c.fbid] : [])),
  });
  const byPost = new Map<string, Bookmark>();
  const byFbid = new Map<string, Bookmark>();
  const ownerOf = { post: new Map<string, string>(), fbid: new Map<string, string>() };
  for (const b of existing) {
    if (b.platformPostId) {
      byPost.set(b.platformPostId, b);
      ownerOf.post.set(b.platformPostId, b.id);
    }
    if (b.fbid) {
      byFbid.set(b.fbid, b);
      ownerOf.fbid.set(b.fbid, b.id);
    }
  }

  const items: PlannedItem[] = [];
  const touched = new Set<string>();
  let added = 0;
  let updated = 0;
  let skipped = parse.duplicatesInFile;

  for (const c of parse.candidates) {
    // 優先以貼文代碼比對，其次 fbid
    const match =
      (c.platformPostId ? byPost.get(c.platformPostId) : undefined) ?? (c.fbid ? byFbid.get(c.fbid) : undefined);

    if (!match) {
      const result = newBookmark(c, now);
      // 同一批新資料之間也要保持識別碼唯一
      if (result.platformPostId) ownerOf.post.set(result.platformPostId, result.id);
      if (result.fbid) ownerOf.fbid.set(result.fbid, result.id);
      items.push({ candidate: c, action: 'add', existingId: null, result, changedFields: [] });
      added++;
      continue;
    }
    if (touched.has(match.id)) {
      items.push({ candidate: c, action: 'skip', existingId: match.id, result: null, changedFields: [] });
      skipped++;
      continue;
    }
    touched.add(match.id);
    const { result, changed } = mergeCandidate(match, c, ownerOf, now);
    const hasNewRelations = (c.folderNames?.length ?? 0) > 0 || (c.tagNames?.length ?? 0) > 0;
    if (changed.length === 0 && !hasNewRelations) {
      items.push({ candidate: c, action: 'skip', existingId: match.id, result: null, changedFields: [] });
      skipped++;
    } else {
      if (result.platformPostId) ownerOf.post.set(result.platformPostId, result.id);
      if (result.fbid) ownerOf.fbid.set(result.fbid, result.id);
      items.push({
        candidate: c,
        action: changed.length > 0 ? 'update' : 'skip',
        existingId: match.id,
        result,
        changedFields: changed,
      });
      if (changed.length > 0) updated++;
      else skipped++;
    }
  }

  // 自動分類：只處理新增的收藏。檔案已指定資料夾時不再套用資料夾規則
  let autoClassifiedCount = 0;
  const compiled = compileRules(options.autoRules ?? []);
  if (compiled.length) {
    for (const it of items) {
      if (it.action !== 'add' || !it.result) continue;
      const m = matchText(bookmarkMatchText(it.result), compiled);
      const folderNames = it.candidate.folderNames ?? [];
      const tagNames = it.candidate.tagNames ?? [];
      const addFolder = m.folderName && folderNames.length === 0 ? [m.folderName] : [];
      const tagKeys = new Set(tagNames.map(nameKey));
      const addTags = m.tagNames.filter((n) => !tagKeys.has(nameKey(n)));
      if (addFolder.length || addTags.length) {
        it.candidate = { ...it.candidate, folderNames: [...folderNames, ...addFolder], tagNames: [...tagNames, ...addTags] };
        autoClassifiedCount++;
      }
    }
  }

  // 計算需要新建的資料夾 / 標籤
  const [folders, tags] = await Promise.all([repo.listFolders(), repo.listTags()]);
  const folderKeys = new Set(folders.map((f) => nameKey(f.name)));
  const tagKeys = new Set(tags.map((t) => nameKey(t.name)));
  const newFolderNames = new Map<string, string>();
  const newTagNames = new Map<string, string>();
  for (const it of items) {
    for (const n of it.candidate.folderNames ?? []) {
      const k = nameKey(n);
      if (k && !folderKeys.has(k)) newFolderNames.set(k, normalizeName(n));
    }
    for (const n of it.candidate.tagNames ?? []) {
      const k = nameKey(n);
      if (k && !tagKeys.has(k)) newTagNames.set(k, normalizeName(n));
    }
  }

  return {
    sourceType,
    fileName,
    parse,
    items,
    counts: { total: parse.total, added, updated, skipped, failed: parse.failures.length },
    newFolderNames: [...newFolderNames.values()],
    newTagNames: [...newTagNames.values()],
    autoClassifiedCount,
  };
}

/**
 * 寫入匯入結果。會重新計算一次計畫（避免預覽後資料已變動），
 * 並在單一交易內寫入；失敗時既有資料完全不受影響。
 */
export async function commitImport(
  repo: VaultRepository,
  parse: ParseResult,
  sourceType: ImportSourceType,
  fileName: string | null = null,
  options: ImportOptions = {},
): Promise<{ job: ImportJob; plan: ImportPlan }> {
  const startedAt = nowIso();
  const plan = await planImport(repo, parse, sourceType, fileName, options);
  const job: ImportJob = {
    id: newId(),
    sourceType,
    fileName,
    startedAt,
    finishedAt: null,
    status: 'completed',
    counts: plan.counts,
    repairedTextCount: parse.repairedTextCount,
    missingUrlCount: parse.missingUrlCount,
    errorMessage: null,
  };

  try {
    const now = nowIso();
    const [folders, tags] = await Promise.all([repo.listFolders(), repo.listTags()]);
    const resolve = createTargetResolver(folders, tags, now);

    const bookmarks: Bookmark[] = [];
    const bookmarkFolders: BookmarkFolder[] = [];
    const bookmarkTags: BookmarkTag[] = [];
    for (const it of plan.items) {
      const target = it.result;
      if (!target) continue;
      if (it.action !== 'skip') bookmarks.push(target);
      for (const n of it.candidate.folderNames ?? []) {
        const f = resolve.folder(n);
        if (f) bookmarkFolders.push({ bookmarkId: target.id, folderId: f.id, createdAt: now });
      }
      for (const n of it.candidate.tagNames ?? []) {
        const t = resolve.tag(n);
        if (t) bookmarkTags.push({ bookmarkId: target.id, tagId: t.id, createdAt: now });
      }
    }

    await repo.applyImport({
      bookmarks,
      folders: resolve.newFolders,
      tags: resolve.newTags,
      bookmarkFolders,
      bookmarkTags,
    });
    job.finishedAt = nowIso();
  } catch (err) {
    job.status = 'failed';
    job.finishedAt = nowIso();
    job.errorMessage = err instanceof Error ? err.message : String(err);
    job.counts = { ...plan.counts, added: 0, updated: 0, skipped: 0, failed: plan.counts.total };
  }

  try {
    await repo.putImportJob(job);
  } catch {
    /* 紀錄寫入失敗不影響匯入結果 */
  }
  return { job, plan };
}
