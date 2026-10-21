import { describe, expect, it } from 'vitest';
import { SearchIndex, emptyQuery, searchBookmarks, type RelationLookup } from '@/features/search/searchEngine';
import type { Bookmark } from '@/shared/types/models';

function bm(id: string, extra: Partial<Bookmark>): Bookmark {
  return {
    id, platform: 'threads', platformPostId: null, fbid: id, originalUrl: null, canonicalUrl: null, author: null,
    title: null, content: null, thumbnailUrl: null, savedAt: null, importedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', notes: null, status: 'normal', source: 'manual', ...extra,
  };
}

const data: Bookmark[] = [
  bm('1', { content: '臺灣的咖啡廳推薦，適合工作', savedAt: '2026-03-01T00:00:00.000Z', author: 'coffee_tw' }),
  bm('2', { content: 'Vue 3 Composition API 教學', title: '前端筆記', savedAt: '2026-01-01T00:00:00.000Z' }),
  bm('3', { content: '日本旅遊：東京自由行', notes: '明年去', savedAt: '2026-02-01T00:00:00.000Z', status: 'missing_url' }),
  bm('4', { content: 'ＶＵＥ 全形英文也要找得到', savedAt: '2025-12-01T00:00:00.000Z' }),
];

const rel: RelationLookup = {
  foldersOf: new Map([['1', new Set(['travel'])], ['3', new Set(['travel'])]]),
  tagsOf: new Map([['2', new Set(['dev', 'must'])], ['4', new Set(['dev'])]]),
};

function run(q: Partial<ReturnType<typeof emptyQuery>>) {
  const index = new SearchIndex();
  index.rebuild(data);
  return searchBookmarks(data, index, rel, { ...emptyQuery(), ...q }).map((b) => b.id);
}

describe('搜尋', () => {
  it('繁體中文全文搜尋', () => {
    expect(run({ text: '咖啡' })).toEqual(['1']);
    expect(run({ text: '東京 自由行' })).toEqual(['3']);
    expect(run({ text: '東京 咖啡' })).toEqual([]);
  });

  it('英文不分大小寫、全形半形', () => {
    expect(run({ text: 'vue' }).sort()).toEqual(['2', '4']);
    expect(run({ text: 'ＶＵＥ' }).sort()).toEqual(['2', '4']);
  });

  it('依欄位搜尋：標題、作者、備註', () => {
    expect(run({ text: '前端', field: 'title' })).toEqual(['2']);
    expect(run({ text: '前端', field: 'content' })).toEqual([]);
    expect(run({ text: 'coffee', field: 'author' })).toEqual(['1']);
    expect(run({ text: '明年', field: 'notes' })).toEqual(['3']);
  });

  it('資料夾、標籤、未分類與缺網址篩選', () => {
    expect(run({ folderIds: ['travel'] })).toEqual(['1', '3']);
    expect(run({ tagIds: ['dev'] })).toEqual(['2', '4']);
    expect(run({ tagIds: ['dev', 'must'], tagMode: 'all' })).toEqual(['2']);
    expect(run({ onlyUncategorized: true })).toEqual(['2', '4']);
    expect(run({ onlyMissingUrl: true })).toEqual(['3']);
  });

  it('依收藏日期排序', () => {
    expect(run({ sort: 'saved_desc' })).toEqual(['1', '3', '2', '4']);
    expect(run({ sort: 'saved_asc' })).toEqual(['4', '2', '3', '1']);
  });

  it('10,000 筆收藏搜尋速度', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => bm(String(i), { content: `第 ${i} 篇 關於台北美食與咖啡的貼文` }));
    const index = new SearchIndex();
    index.rebuild(many);
    const t0 = performance.now();
    const r = searchBookmarks(many, index, { foldersOf: new Map(), tagsOf: new Map() }, { ...emptyQuery(), text: '9999 篇' });
    expect(r).toHaveLength(1);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
