import type { AutoRule, Bookmark } from '@/shared/types/models';
import { nameKey } from '@/shared/utils/text';

/**
 * 自動分類規則的比對引擎（純函式，不碰資料庫）。
 *
 * 比對方式：
 * - 不分大小寫、全形半形視為相同，忽略 emoji 變體符號（🐿 與 🐿️ 相同）。
 * - emoji 關鍵字以「完整字元」比對：🐻 不會比對到 🐻‍❄️，🐈 不會比對到 🐈‍⬛。
 * - 英數關鍵字要求單字邊界：「AI」不會比對到「said」，「T1」可以比對到「T1粉」。
 * - 其他文字（中文、韓文…）以子字串比對。
 */

const VARIATION_SELECTORS = /[︎️]/g;
const EMOJI = /\p{Extended_Pictographic}/u;
const ASCII_WORD = /^[a-z0-9][a-z0-9 .+#&'_-]*$/;

export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').replace(VARIATION_SELECTORS, '').toLowerCase();
}

/** 拆解使用者輸入的關鍵字：以換行、逗號、頓號分隔，去重 */
export function parseKeywords(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\n,，、]+/)) {
    const k = raw.trim();
    const key = normalizeForMatch(k);
    if (k && !seen.has(key)) {
      seen.add(key);
      out.push(k);
    }
  }
  return out;
}

type Matcher = (ctx: MatchContext) => boolean;

interface MatchContext {
  text: string;
  graphemes: () => Set<string>;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compileKeyword(raw: string): Matcher | null {
  const k = normalizeForMatch(raw.trim());
  if (!k) return null;
  if (EMOJI.test(k) && splitGraphemes(k).length === 1) {
    return (ctx) => ctx.graphemes().has(k);
  }
  if (ASCII_WORD.test(k)) {
    // 前一個字不能是英數；結尾是字母時後一個字不能是字母、是數字時不能是數字（T1con、GPT4 都算符合）
    const before = '(?<![a-z0-9])';
    const after = /[a-z]$/.test(k) ? '(?![a-z])' : /[0-9]$/.test(k) ? '(?![0-9])' : '';
    const re = new RegExp(before + escapeRegExp(k) + after);
    return (ctx) => re.test(ctx.text);
  }
  return (ctx) => ctx.text.includes(k);
}

let segmenter: Intl.Segmenter | null = null;
function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

export interface CompiledRule {
  rule: AutoRule;
  test: (ctx: MatchContext) => boolean;
}

/** 只保留啟用且有關鍵字的規則，依 sortOrder 排序 */
export function compileRules(rules: AutoRule[]): CompiledRule[] {
  return [...rules]
    .filter((r) => r.enabled && r.targetName.trim())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((rule) => {
      const matchers = rule.keywords.map(compileKeyword).filter((m): m is Matcher => m !== null);
      if (!matchers.length) return [];
      const test =
        rule.matchMode === 'all'
          ? (ctx: MatchContext) => matchers.every((m) => m(ctx))
          : (ctx: MatchContext) => matchers.some((m) => m(ctx));
      return [{ rule, test }];
    });
}

export function bookmarkMatchText(b: Pick<Bookmark, 'content' | 'title' | 'author' | 'notes'>): string {
  return [b.content, b.title, b.author, b.notes].filter(Boolean).join('\n');
}

function contextOf(text: string): MatchContext {
  const normalized = normalizeForMatch(text);
  let cache: Set<string> | null = null;
  return { text: normalized, graphemes: () => (cache ??= new Set(splitGraphemes(normalized))) };
}

export interface RuleMatch {
  /** 第一條符合的資料夾規則指向的資料夾名稱 */
  folderName: string | null;
  folderRuleId: string | null;
  tagNames: string[];
  tagRuleIds: string[];
}

export function matchText(text: string, compiled: CompiledRule[]): RuleMatch {
  const ctx = contextOf(text);
  const result: RuleMatch = { folderName: null, folderRuleId: null, tagNames: [], tagRuleIds: [] };
  const seenTags = new Set<string>();
  for (const { rule, test } of compiled) {
    if (rule.targetType === 'folder') {
      if (result.folderName === null && test(ctx)) {
        result.folderName = rule.targetName;
        result.folderRuleId = rule.id;
      }
    } else if (!seenTags.has(nameKey(rule.targetName)) && test(ctx)) {
      seenTags.add(nameKey(rule.targetName));
      result.tagNames.push(rule.targetName);
      result.tagRuleIds.push(rule.id);
    }
  }
  return result;
}

/** 每條規則各自符合幾篇收藏（不考慮資料夾規則的先後順序），用於規則清單顯示 */
export function countMatchesPerRule(bookmarks: Bookmark[], rules: AutoRule[]): Map<string, number> {
  const compiled = compileRules(rules);
  const counts = new Map<string, number>(compiled.map((c) => [c.rule.id, 0]));
  for (const b of bookmarks) {
    const ctx = contextOf(bookmarkMatchText(b));
    for (const { rule, test } of compiled) if (test(ctx)) counts.set(rule.id, counts.get(rule.id)! + 1);
  }
  return counts;
}

/** 判斷兩條規則內容是否相同（目標、比對方式、關鍵字），用於載入建議規則與合併時去重 */
export function ruleSignature(r: { targetType: string; targetName: string; matchMode?: string; keywords: string[] }): string {
  return [r.targetType, nameKey(r.targetName), r.matchMode ?? 'any', ...r.keywords.map(normalizeForMatch).sort()].join('|');
}
