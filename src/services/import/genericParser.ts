import Papa from 'papaparse';
import { repairMojibake, repairMojibakeDetailed } from '@/services/encoding/mojibake';
import { isBackupFile, parseBackup } from '@/services/backup/backupFormat';
import { parseThreadsUrl } from './threadsUrl';
import {
  ImportFormatError,
  candidateKeys,
  yieldToMain,
  type ImportCandidate,
  type ImportFailure,
  type ParseResult,
} from './types';

/**
 * 一般 JSON / CSV 匯入。支援欄位（大小寫不拘，可用別名）：
 *   url | link | originalUrl | canonicalUrl
 *   content | text | caption
 *   author | username | owner
 *   title
 *   saved_at | savedAt | timestamp | date
 *   notes | note
 *   folders | folder         （多個以 ; 或 , 分隔，或 JSON 陣列）
 *   tags | tag               （同上）
 *   fbid
 * 也接受 Threads Vault 自己的備份檔（會以「合併」方式匯入）。
 */

type Rec = Record<string, unknown>;

const ALIASES: Record<string, string[]> = {
  url: ['url', 'link', 'originalurl', 'original_url', 'canonicalurl', 'canonical_url', 'href'],
  content: ['content', 'text', 'caption', 'body'],
  author: ['author', 'username', 'owner', 'user'],
  title: ['title'],
  savedAt: ['saved_at', 'savedat', 'timestamp', 'date', 'created_at', 'createdat'],
  notes: ['notes', 'note', 'memo'],
  folders: ['folders', 'folder', 'collections', 'collection', 'category', 'categories'],
  tags: ['tags', 'tag', 'labels', 'hashtags'],
  fbid: ['fbid'],
  platformPostId: ['platform_post_id', 'platformpostid', 'post_id'],
};

function pick(rec: Rec, field: keyof typeof ALIASES): unknown {
  const lower = new Map(Object.entries(rec).map(([k, v]) => [k.toLowerCase().trim(), v]));
  for (const alias of ALIASES[field]!) {
    const v = lower.get(alias);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function asText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

function asList(v: unknown, strictSemicolon = false): string[] {
  if (Array.isArray(v)) return v.map(asText).map((s) => s.trim()).filter(Boolean);
  const s = asText(v).trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const arr: unknown = JSON.parse(s);
      if (Array.isArray(arr)) return asList(arr);
    } catch {
      /* 不是 JSON，當作分隔字串 */
    }
  }
  // 有分號就只用分號切（本 App 匯出格式），否則接受逗號與頓號
  const sep = strictSemicolon || s.includes(';') ? /;/ : /[,，、]/;
  return s.split(sep).map((x) => x.trim()).filter(Boolean);
}

function asIsoDate(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return new Date(v > 1e12 ? v : v * 1000).toISOString();
  }
  const s = asText(v).trim();
  if (!s) return null;
  if (/^\d{9,13}$/.test(s)) return asIsoDate(Number(s));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function recordToCandidate(rec: Rec, index: number, source: 'json' | 'csv', strictLists: boolean): ImportCandidate | string {
  const rawUrl = asText(pick(rec, 'url')).trim();
  const parsedUrl = parseThreadsUrl(rawUrl);
  const content = repairMojibake(asText(pick(rec, 'content')));
  const fbid = asText(pick(rec, 'fbid')).trim() || null;
  const postIdField = asText(pick(rec, 'platformPostId')).trim() || null;
  const author = repairMojibake(asText(pick(rec, 'author')).trim()).replace(/^@/, '');
  const title = repairMojibake(asText(pick(rec, 'title')).trim());
  const notes = repairMojibake(asText(pick(rec, 'notes')));

  if (rawUrl && !parsedUrl && !fbid && !content) return `無法辨識的網址：${rawUrl.slice(0, 80)}`;
  const candidate: ImportCandidate = {
    sourceIndex: index,
    platformPostId: parsedUrl?.postId ?? postIdField,
    fbid,
    originalUrl: parsedUrl ? rawUrl : null,
    canonicalUrl: parsedUrl?.canonicalUrl ?? null,
    author: author || parsedUrl?.username || null,
    title: title || null,
    content: content.trim() ? content : null,
    savedAt: asIsoDate(pick(rec, 'savedAt')),
    status: parsedUrl ? 'normal' : 'missing_url',
    source,
    notes: notes.trim() ? notes : null,
    folderNames: asList(pick(rec, 'folders'), strictLists).map(repairMojibake),
    tagNames: asList(pick(rec, 'tags'), strictLists).map(repairMojibake),
  };
  if (candidateKeys(candidate).length === 0) {
    return '缺少可識別的 Threads 網址或 fbid';
  }
  return candidate;
}

async function recordsToResult(records: unknown[], source: 'json' | 'csv', strictLists = false): Promise<ParseResult> {
  const candidates: ImportCandidate[] = [];
  const failures: ImportFailure[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;
  let repairedTextCount = 0;
  let missingUrlCount = 0;

  for (let i = 0; i < records.length; i++) {
    if (i > 0 && i % 500 === 0) await yieldToMain();
    const rec = records[i];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      failures.push({ index: i, reason: '資料列不是物件' });
      continue;
    }
    if (repairMojibakeDetailed(asText(pick(rec as Rec, 'content'))).repaired) repairedTextCount++;
    const c = recordToCandidate(rec as Rec, i, source, strictLists);
    if (typeof c === 'string') {
      failures.push({ index: i, reason: c });
      continue;
    }
    const keys = candidateKeys(c);
    if (keys.some((k) => seen.has(k))) {
      duplicatesInFile++;
      continue;
    }
    keys.forEach((k) => seen.add(k));
    if (c.status === 'missing_url') missingUrlCount++;
    candidates.push(c);
  }
  return { total: records.length, candidates, failures, duplicatesInFile, repairedTextCount, missingUrlCount };
}

export async function parseGenericJson(input: unknown): Promise<ParseResult> {
  if (isBackupFile(input)) {
    // 把 Threads Vault 備份轉成可合併匯入的資料列
    const snap = parseBackup(input);
    const folderName = new Map(snap.folders.map((f) => [f.id, f.name]));
    const tagName = new Map(snap.tags.map((t) => [t.id, t.name]));
    const records = snap.bookmarks.map((b) => ({
      url: b.originalUrl ?? b.canonicalUrl ?? '',
      content: b.content,
      author: b.author,
      title: b.title,
      saved_at: b.savedAt,
      notes: b.notes,
      fbid: b.fbid,
      platform_post_id: b.platformPostId,
      folders: snap.bookmarkFolders.filter((l) => l.bookmarkId === b.id).map((l) => folderName.get(l.folderId) ?? ''),
      tags: snap.bookmarkTags.filter((l) => l.bookmarkId === b.id).map((l) => tagName.get(l.tagId) ?? ''),
    }));
    return recordsToResult(records, 'json');
  }
  let records: unknown = input;
  if (records && typeof records === 'object' && !Array.isArray(records)) {
    const arrays = Object.values(records as Rec).filter(Array.isArray);
    if (arrays.length === 1) records = arrays[0];
  }
  if (!Array.isArray(records)) throw new ImportFormatError('JSON 格式不符：預期為收藏物件的陣列');
  return recordsToResult(records, 'json');
}

export async function parseCsv(text: string): Promise<ParseResult> {
  const result = Papa.parse<Rec>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  if (result.data.length === 0 && result.errors.length > 0) {
    throw new ImportFormatError(`CSV 解析失敗：${result.errors[0]?.message ?? '未知錯誤'}`);
  }
  // 公式注入防護在匯出時會加上前置單引號，匯入時還原
  const rows = result.data.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/^'(?=[=+\-@\t\r])/, '') : v])),
  );
  // 本 App 匯出的 CSV：清單一律以分號分隔，名稱中的逗號要保留
  const fields = result.meta.fields ?? [];
  const ownFormat = fields.includes('platform_post_id') && fields.includes('status');
  return recordsToResult(rows, 'csv', ownFormat);
}
