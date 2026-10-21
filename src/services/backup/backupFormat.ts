import { z } from 'zod';
import type { VaultSnapshot } from '@/shared/types/models';

export const BACKUP_FORMAT = 'threads-vault-backup';
/** v2：加入自動分類規則（仍可讀取 v1 備份） */
export const BACKUP_VERSION = 2;

const iso = z.string();
const nullableStr = z.string().nullable();

export const bookmarkSchema = z.object({
  id: z.string().min(1),
  platform: z.literal('threads'),
  platformPostId: nullableStr,
  fbid: nullableStr,
  originalUrl: nullableStr,
  canonicalUrl: nullableStr,
  author: nullableStr,
  title: nullableStr,
  content: nullableStr,
  thumbnailUrl: nullableStr,
  savedAt: nullableStr,
  importedAt: iso,
  updatedAt: iso,
  notes: nullableStr,
  status: z.enum(['normal', 'missing_url']),
  source: z.enum(['meta_export', 'json', 'csv', 'share', 'manual']),
});

export const folderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string(),
  color: z.string(),
  sortOrder: z.number(),
  createdAt: iso,
  updatedAt: iso,
});

export const tagSchema = z.object({ id: z.string().min(1), name: z.string().min(1), color: z.string(), createdAt: iso });
const bfSchema = z.object({ bookmarkId: z.string(), folderId: z.string(), createdAt: iso });
const btSchema = z.object({ bookmarkId: z.string(), tagId: z.string(), createdAt: iso });
const countsSchema = z.object({
  total: z.number(),
  added: z.number(),
  updated: z.number(),
  skipped: z.number(),
  failed: z.number(),
});
const importJobSchema = z.object({
  id: z.string(),
  sourceType: z.enum(['meta_json', 'json', 'csv', 'share']),
  fileName: nullableStr,
  startedAt: iso,
  finishedAt: nullableStr,
  status: z.enum(['completed', 'failed']),
  counts: countsSchema,
  repairedTextCount: z.number(),
  missingUrlCount: z.number(),
  errorMessage: nullableStr,
});

export const autoRuleSchema = z.object({
  id: z.string().min(1),
  targetType: z.enum(['folder', 'tag']),
  targetName: z.string().min(1),
  keywords: z.array(z.string()),
  matchMode: z.enum(['any', 'all']),
  enabled: z.boolean(),
  sortOrder: z.number(),
  createdAt: iso,
  updatedAt: iso,
});

export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: iso,
  data: z.object({
    bookmarks: z.array(bookmarkSchema),
    folders: z.array(folderSchema),
    tags: z.array(tagSchema),
    bookmarkFolders: z.array(bfSchema),
    bookmarkTags: z.array(btSchema),
    importJobs: z.array(importJobSchema).default([]),
    autoRules: z.array(autoRuleSchema).default([]),
  }),
});

export type BackupFile = z.infer<typeof backupFileSchema>;

export function isBackupFile(input: unknown): boolean {
  return !!input && typeof input === 'object' && (input as { format?: unknown }).format === BACKUP_FORMAT;
}

/** 驗證備份並清除指向不存在資料的關聯 */
export function parseBackup(input: unknown): VaultSnapshot {
  const parsed = backupFileSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`備份檔格式錯誤：${issue ? `${issue.path.join('.')} ${issue.message}` : '未知錯誤'}`);
  }
  const d = parsed.data.data;
  const bookmarkIds = new Set(d.bookmarks.map((b) => b.id));
  const folderIds = new Set(d.folders.map((f) => f.id));
  const tagIds = new Set(d.tags.map((t) => t.id));
  return {
    bookmarks: d.bookmarks,
    folders: d.folders,
    tags: d.tags,
    bookmarkFolders: d.bookmarkFolders.filter((l) => bookmarkIds.has(l.bookmarkId) && folderIds.has(l.folderId)),
    bookmarkTags: d.bookmarkTags.filter((l) => bookmarkIds.has(l.bookmarkId) && tagIds.has(l.tagId)),
    importJobs: d.importJobs,
    autoRules: d.autoRules,
  };
}

export function serializeBackup(snapshot: VaultSnapshot, exportedAt = new Date().toISOString()): string {
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, data: snapshot };
  return JSON.stringify(file, null, 2);
}
