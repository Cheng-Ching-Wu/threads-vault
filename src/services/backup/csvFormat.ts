import Papa from 'papaparse';
import type { VaultSnapshot } from '@/shared/types/models';

export const CSV_COLUMNS = [
  'url', 'content', 'author', 'title', 'saved_at', 'notes', 'folders', 'tags', 'status', 'fbid', 'platform_post_id',
] as const;

/** 多個資料夾 / 標籤以「; 」分隔 */
export const LIST_SEPARATOR = '; ';

/** 匯出 CSV（含 UTF-8 BOM，Excel 才能正確顯示中文）。 */
export function snapshotToCsv(snapshot: VaultSnapshot): string {
  const folderName = new Map(snapshot.folders.map((f) => [f.id, f.name]));
  const tagName = new Map(snapshot.tags.map((t) => [t.id, t.name]));
  const foldersOf = new Map<string, string[]>();
  const tagsOf = new Map<string, string[]>();
  for (const l of snapshot.bookmarkFolders) {
    const n = folderName.get(l.folderId);
    if (n) foldersOf.set(l.bookmarkId, [...(foldersOf.get(l.bookmarkId) ?? []), n]);
  }
  for (const l of snapshot.bookmarkTags) {
    const n = tagName.get(l.tagId);
    if (n) tagsOf.set(l.bookmarkId, [...(tagsOf.get(l.bookmarkId) ?? []), n]);
  }
  const rows = snapshot.bookmarks.map((b) => ({
    url: b.canonicalUrl ?? b.originalUrl ?? '',
    content: b.content ?? '',
    author: b.author ?? '',
    title: b.title ?? '',
    saved_at: b.savedAt ?? '',
    notes: b.notes ?? '',
    folders: (foldersOf.get(b.id) ?? []).join(LIST_SEPARATOR),
    tags: (tagsOf.get(b.id) ?? []).join(LIST_SEPARATOR),
    status: b.status,
    fbid: b.fbid ?? '',
    platform_post_id: b.platformPostId ?? '',
  }));
  // 防止 CSV 公式注入（Excel 會執行以 = + - @ 開頭的儲存格）
  return `﻿${Papa.unparse(rows, { columns: [...CSV_COLUMNS], escapeFormulae: true, newline: '\r\n' })}`;
}
