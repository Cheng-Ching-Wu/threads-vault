import { describe, expect, it } from 'vitest';
import type { AutoRule } from '@/shared/types/models';
import { compileRules, countMatchesPerRule, matchText, parseKeywords } from '@/services/rules/ruleEngine';

let n = 0;
function rule(partial: Partial<AutoRule> & Pick<AutoRule, 'targetName' | 'keywords'>): AutoRule {
  n++;
  return {
    id: `r${n}`,
    targetType: 'tag',
    matchMode: 'any',
    enabled: true,
    sortOrder: n,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

const tagsOf = (text: string, rules: AutoRule[]) => matchText(text, compileRules(rules)).tagNames;

describe('自動分類比對引擎', () => {
  it('中文以子字串比對、英文不分大小寫', () => {
    const rules = [rule({ targetName: 'Doran', keywords: ['崔多蘭', 'doran'] })];
    expect(tagsOf('今天的崔多蘭好可愛', rules)).toEqual(['Doran']);
    expect(tagsOf('DORAN 三殺', rules)).toEqual(['Doran']);
    expect(tagsOf('沒有相關內容', rules)).toEqual([]);
  });

  it('英數關鍵字要求單字邊界', () => {
    const rules = [rule({ targetName: '科技', keywords: ['AI'] }), rule({ targetName: 'T1', keywords: ['T1'] })];
    expect(tagsOf('he said hello', rules)).toEqual([]);
    expect(tagsOf('用 AI 改網頁', rules)).toEqual(['科技']);
    expect(tagsOf('AI網頁設計', rules)).toEqual(['科技']);
    expect(tagsOf('T1con 的合照', rules)).toEqual(['T1']);
    expect(tagsOf('2T1 不算', rules)).toEqual([]);
    expect(tagsOf('T10 也不算', rules)).toEqual([]);
  });

  it('emoji 以完整字元比對：🐻 不等於 🐻‍❄️、🐈 不等於 🐈‍⬛', () => {
    const rules = [
      rule({ targetName: 'Gumayusi', keywords: ['🐻'] }),
      rule({ targetName: 'Canyon', keywords: ['🐻‍❄️'] }),
      rule({ targetName: 'Faker', keywords: ['🐈‍⬛'] }),
    ];
    expect(tagsOf('🐻‍❄️把小黃瓜夾到🐨的盤子裡', rules)).toEqual(['Canyon']);
    expect(tagsOf('🐻：好氣阿', rules)).toEqual(['Gumayusi']);
    expect(tagsOf('🐻 和 🐻‍❄️ 一起', rules).sort()).toEqual(['Canyon', 'Gumayusi']);
    expect(tagsOf('一隻普通的🐈', rules)).toEqual([]);
    expect(tagsOf('🐈‍⬛：你再惹我一次', rules)).toEqual(['Faker']);
  });

  it('忽略 emoji 變體符號（🐿 與 🐿️ 相同）', () => {
    const rules = [rule({ targetName: 'Doran', keywords: ['🐿'] })];
    expect(tagsOf('🐿️ 帥慘了', rules)).toEqual(['Doran']);
    expect(tagsOf('🐿 帥慘了', [rule({ targetName: 'Doran', keywords: ['🐿️'] })])).toEqual(['Doran']);
  });

  it('全部符合模式需要每個關鍵字都出現', () => {
    const rules = [rule({ targetName: '殼蘭', keywords: ['🐈‍⬛', '🐿'], matchMode: 'all' })];
    expect(tagsOf('🐈‍⬛🐿️ 又是感激部長的一天', rules)).toEqual(['殼蘭']);
    expect(tagsOf('🐈‍⬛ 自己一個', rules)).toEqual([]);
  });

  it('資料夾只取第一條符合的規則；標籤全部套用且不重複', () => {
    const rules = [
      rule({ targetType: 'folder', targetName: '殼蘭', keywords: ['殼蘭'], sortOrder: 1 }),
      rule({ targetType: 'folder', targetName: '電競', keywords: ['T1', '殼蘭'], sortOrder: 2 }),
      rule({ targetName: 'Faker', keywords: ['殼'], sortOrder: 3 }),
      rule({ targetName: 'Faker', keywords: ['T1'], sortOrder: 4 }),
      rule({ targetName: 'Doran', keywords: ['蘭'], sortOrder: 5 }),
    ];
    const m = matchText('T1 的殼蘭', compileRules(rules));
    expect(m.folderName).toBe('殼蘭');
    expect(m.tagNames).toEqual(['Faker', 'Doran']);
  });

  it('停用、沒有關鍵字或沒有目標的規則不會生效', () => {
    const rules = [
      rule({ targetName: 'A', keywords: ['蘭'], enabled: false }),
      rule({ targetName: 'B', keywords: ['  '] }),
      rule({ targetName: ' ', keywords: ['蘭'] }),
    ];
    expect(compileRules(rules)).toHaveLength(0);
  });

  it('全形英數視為半形', () => {
    expect(tagsOf('ＦＡＫＥＲ 好帥', [rule({ targetName: 'Faker', keywords: ['Faker'] })])).toEqual(['Faker']);
  });

  it('解析關鍵字輸入：換行、逗號、頓號分隔並去重', () => {
    expect(parseKeywords('崔多蘭, Doran\n蘭尼、doran，🐿\n\n')).toEqual(['崔多蘭', 'Doran', '蘭尼', '🐿']);
  });

  it('計算每條規則符合的篇數', () => {
    const r1 = rule({ targetName: 'Doran', keywords: ['蘭'] });
    const r2 = rule({ targetName: 'Faker', keywords: ['殼'] });
    const base = { title: null, author: null, notes: null };
    const counts = countMatchesPerRule(
      [
        { ...base, content: '殼蘭' },
        { ...base, content: '蘭尼' },
        { ...base, content: null, notes: '備註提到殼' },
      ] as never,
      [r1, r2],
    );
    expect(counts.get(r1.id)).toBe(2);
    expect(counts.get(r2.id)).toBe(2);
  });
});
