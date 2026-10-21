import { z } from 'zod';
import { repairMojibakeDetailed } from '@/services/encoding/mojibake';
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
 * Meta 官方匯出 saved_threads.json 的結構（依實際檔案分析）：
 * [
 *   {
 *     "timestamp": 1792483119,          // Unix 秒
 *     "media": [],
 *     "label_values": [
 *       { "label": "URL", "value": "...", "href": "..." },   // 可能是空字串
 *       { "label": "Caption", "value": "..." },              // 可能整個不存在
 *       { "label": "Title", "value": "" },
 *       { "title": "Hashtags", "dict": [] },
 *       { "title": "Owner", "dict": [] },
 *       { "title": "Brand partner", "dict": [] }
 *     ],
 *     "fbid": "18123272639290259"
 *   }
 * ]
 * 文字欄位是 UTF-8 位元組被當成 Latin-1 的亂碼，需要修復。
 */

const labelValueSchema = z.looseObject({
  label: z.string().optional(),
  value: z.unknown().optional(),
  href: z.unknown().optional(),
  title: z.string().optional(),
  dict: z.unknown().optional(),
});

export const metaSavedItemSchema = z.looseObject({
  timestamp: z.number().optional(),
  fbid: z.union([z.string(), z.number()]).optional(),
  media: z.array(z.unknown()).optional(),
  label_values: z.array(labelValueSchema).optional(),
});

export type MetaSavedItem = z.infer<typeof metaSavedItemSchema>;
type LabelValue = z.infer<typeof labelValueSchema>;

/** 某些匯出版本最外層是物件（例如 { saved_threads: [...] }），一併支援。 */
export function unwrapMetaRoot(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    const arrays = Object.values(input as Record<string, unknown>).filter(Array.isArray);
    if (arrays.length === 1) return arrays[0] as unknown[];
  }
  throw new ImportFormatError('檔案格式不符：預期 saved_threads.json 最外層是收藏陣列');
}

function stringValue(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function findLabel(items: LabelValue[], label: string): LabelValue | undefined {
  return items.find((i) => i.label === label);
}

/** 從 dict 型欄位（例如 Owner）嘗試取得文字值，Meta 目前多半為空陣列。 */
function dictText(items: LabelValue[], title: string): string {
  const entry = items.find((i) => i.title === title);
  if (!entry || !Array.isArray(entry.dict)) return '';
  const parts: string[] = [];
  for (const d of entry.dict) {
    if (d && typeof d === 'object') {
      const rec = d as Record<string, unknown>;
      const v = stringValue(rec.value) || stringValue(rec.name);
      if (v) parts.push(v);
      if (Array.isArray(rec.dict)) {
        for (const inner of rec.dict) {
          if (inner && typeof inner === 'object') {
            const iv = stringValue((inner as Record<string, unknown>).value);
            if (iv) parts.push(iv);
          }
        }
      }
    }
  }
  return parts.join(' ').trim();
}

function toIsoFromSeconds(seconds: number | undefined): string | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
  // 若是毫秒（13 位數）也能處理
  const ms = seconds > 1e12 ? seconds : seconds * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface ParseOptions {
  /** 每處理多少筆讓出一次主執行緒 */
  chunkSize?: number;
}

export async function parseMetaSavedThreads(input: unknown, options: ParseOptions = {}): Promise<ParseResult> {
  const items = unwrapMetaRoot(input);
  const chunkSize = options.chunkSize ?? 500;
  const candidates: ImportCandidate[] = [];
  const failures: ImportFailure[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;
  let repairedTextCount = 0;
  let missingUrlCount = 0;

  for (let index = 0; index < items.length; index++) {
    if (index > 0 && index % chunkSize === 0) await yieldToMain();

    const parsed = metaSavedItemSchema.safeParse(items[index]);
    if (!parsed.success) {
      failures.push({ index, reason: `格式驗證失敗：${parsed.error.issues[0]?.message ?? '未知錯誤'}` });
      continue;
    }
    const item = parsed.data;
    const labels = item.label_values ?? [];

    const fbid = item.fbid !== undefined && String(item.fbid).trim() ? String(item.fbid).trim() : null;
    const urlEntry = findLabel(labels, 'URL');
    const rawUrl = stringValue(urlEntry?.value) || stringValue(urlEntry?.href);
    const parsedUrl = parseThreadsUrl(rawUrl);

    const captionRaw = stringValue(findLabel(labels, 'Caption')?.value);
    const titleRaw = stringValue(findLabel(labels, 'Title')?.value);
    const ownerRaw = dictText(labels, 'Owner');

    const caption = repairMojibakeDetailed(captionRaw);
    const title = repairMojibakeDetailed(titleRaw);
    const owner = repairMojibakeDetailed(ownerRaw);
    if (caption.repaired || title.repaired || owner.repaired) repairedTextCount++;

    const candidate: ImportCandidate = {
      sourceIndex: index,
      platformPostId: parsedUrl?.postId ?? null,
      fbid,
      originalUrl: parsedUrl ? rawUrl.trim() : null,
      canonicalUrl: parsedUrl?.canonicalUrl ?? null,
      author: owner.text || parsedUrl?.username || null,
      title: title.text.trim() || null,
      content: caption.text.trim() ? caption.text : null,
      savedAt: toIsoFromSeconds(item.timestamp),
      status: parsedUrl ? 'normal' : 'missing_url',
      source: 'meta_export',
    };

    const keys = candidateKeys(candidate);
    if (keys.length === 0) {
      failures.push({ index, reason: '缺少 fbid 與有效的 Threads 網址，無法識別' });
      continue;
    }
    if (keys.some((k) => seen.has(k))) {
      duplicatesInFile++;
      continue;
    }
    keys.forEach((k) => seen.add(k));
    if (!parsedUrl) missingUrlCount++;
    candidates.push(candidate);
  }

  return {
    total: items.length,
    candidates,
    failures,
    duplicatesInFile,
    repairedTextCount,
    missingUrlCount,
  };
}

/** 判斷一個已解析的 JSON 看起來是不是 Meta 匯出格式。 */
export function looksLikeMetaExport(input: unknown): boolean {
  try {
    const items = unwrapMetaRoot(input);
    const first = items[0];
    return !!first && typeof first === 'object' && 'label_values' in (first as object);
  } catch {
    return false;
  }
}
