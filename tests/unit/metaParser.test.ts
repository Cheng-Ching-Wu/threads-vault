import { describe, expect, it } from 'vitest';
import { parseMetaSavedThreads } from '@/services/import/metaParser';
import { ImportFormatError } from '@/services/import/types';
import { metaItem, sampleExport } from '../helpers/fixtures';

describe('parseMetaSavedThreads', () => {
  it('正常解析 Meta JSON 結構', async () => {
    const r = await parseMetaSavedThreads(sampleExport());
    expect(r.total).toBe(5);
    expect(r.candidates).toHaveLength(5);
    expect(r.failures).toHaveLength(0);
    const first = r.candidates[0]!;
    expect(first.fbid).toBe('1001');
    expect(first.platformPostId).toBe('AbCdE12345');
    expect(first.canonicalUrl).toBe('https://www.threads.com/t/AbCdE12345');
    expect(first.content).toBe('改網頁的小技巧 😀\n第二行');
    expect(first.savedAt).toBe(new Date(1_760_000_000 * 1000).toISOString());
    expect(first.status).toBe('normal');
    expect(first.author).toBeNull(); // 匯出中沒有作者資料，不可捏造
  });

  it('修復日文、韓文 Caption 並計算修復數', async () => {
    const r = await parseMetaSavedThreads(sampleExport());
    expect(r.candidates[1]!.content).toBe('日本語のテキスト');
    expect(r.candidates[4]!.content).toBe('한국어 텍스트 입니다');
    expect(r.repairedTextCount).toBe(4);
  });

  it('缺少 URL 的收藏仍會匯入並標記 missing_url，不捏造網址', async () => {
    const r = await parseMetaSavedThreads(sampleExport());
    const noUrl = r.candidates.find((c) => c.fbid === '1003')!;
    expect(noUrl.status).toBe('missing_url');
    expect(noUrl.originalUrl).toBeNull();
    expect(noUrl.canonicalUrl).toBeNull();
    expect(noUrl.platformPostId).toBeNull();
    expect(noUrl.content).toBe('沒有網址的收藏');
    expect(r.missingUrlCount).toBe(1);
  });

  it('沒有 Caption 欄位的項目可以匯入（內文為 null）', async () => {
    const r = await parseMetaSavedThreads(sampleExport());
    expect(r.candidates.find((c) => c.fbid === '1004')!.content).toBeNull();
  });

  it('檔案內重複的貼文只保留一筆', async () => {
    const r = await parseMetaSavedThreads([
      metaItem({ fbid: '1', url: 'https://www.threads.com/t/AAAAA11111', caption: 'a' }),
      metaItem({ fbid: '1', url: 'https://www.threads.com/t/AAAAA11111', caption: 'a' }),
      metaItem({ fbid: '2', url: 'https://www.threads.net/t/AAAAA11111?x=1', caption: 'a' }),
    ]);
    expect(r.candidates).toHaveLength(1);
    expect(r.duplicatesInFile).toBe(2);
  });

  it('fbid 為數字也能處理', async () => {
    const r = await parseMetaSavedThreads([metaItem({ fbid: 123456789, url: '', caption: 'x' })]);
    expect(r.candidates[0]!.fbid).toBe('123456789');
  });

  it('格式錯誤的項目記錄為失敗，不影響其他項目', async () => {
    const r = await parseMetaSavedThreads([
      metaItem({ fbid: '1', url: 'https://www.threads.com/t/AAAAA11111', caption: 'ok' }),
      'not an object',
      { timestamp: 'bad', label_values: 'bad' },
      metaItem({ url: '', caption: '沒有任何識別碼' }),
    ]);
    expect(r.candidates).toHaveLength(1);
    expect(r.failures.map((f) => f.index)).toEqual([1, 2, 3]);
  });

  it('最外層不是陣列時丟出 ImportFormatError', async () => {
    await expect(parseMetaSavedThreads('hello')).rejects.toBeInstanceOf(ImportFormatError);
    await expect(parseMetaSavedThreads({ a: 1 })).rejects.toBeInstanceOf(ImportFormatError);
  });

  it('接受包在物件裡的陣列', async () => {
    const r = await parseMetaSavedThreads({ saved_threads: sampleExport() });
    expect(r.candidates).toHaveLength(5);
  });

  it('10,000 筆資料可在合理時間內解析', async () => {
    const big = Array.from({ length: 10_000 }, (_, i) =>
      metaItem({ fbid: String(i), url: `https://www.threads.com/t/Post${String(i).padStart(6, '0')}`, caption: `第 ${i} 篇` }),
    );
    const t0 = performance.now();
    const r = await parseMetaSavedThreads(big);
    expect(r.candidates).toHaveLength(10_000);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
