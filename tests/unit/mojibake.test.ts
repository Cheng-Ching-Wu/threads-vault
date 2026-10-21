import { describe, expect, it } from 'vitest';
import { repairMojibake, repairMojibakeDetailed } from '@/services/encoding/mojibake';
import { toMojibake } from '../helpers/fixtures';

describe('repairMojibake', () => {
  it('還原中文亂碼（需求文件中的範例）', () => {
    // 「改網頁」的 UTF-8 位元組被當成 Latin-1：含不可見的 C1 控制字元
    const broken = 'æ\u0094¹ç¶²é \u0081';
    expect(repairMojibake(broken)).toBe('改網頁');
    expect(repairMojibakeDetailed(broken).repaired).toBe(true);
  });

  it('還原多行中文', () => {
    const original = '【直播】\n\n英語教室\n第二行文字，含標點！';
    expect(repairMojibake(toMojibake(original))).toBe(original);
  });

  it('支援日文與韓文', () => {
    for (const s of ['日本語のテキストです。カタカナ', '한국어 텍스트 입니다', '中文、日本語、한국어 混合']) {
      expect(repairMojibake(toMojibake(s))).toBe(s);
    }
  });

  it('還原 emoji，並保留已正確的 emoji', () => {
    expect(repairMojibake(toMojibake('好讚 😀🎉👍🏻'))).toBe('好讚 😀🎉👍🏻');
    expect(repairMojibake('好讚 😀🎉👍🏻')).toBe('好讚 😀🎉👍🏻');
    expect(repairMojibake('👨‍👩‍👧 家庭')).toBe('👨‍👩‍👧 家庭');
  });

  it('不破壞正常的 UTF-8 內容', () => {
    const normal = ['正常文字', 'Hello world', 'café naïve résumé', '©2024 Ünïcödé', '¿Qué tal?', '50°C ±2', ''];
    for (const s of normal) {
      expect(repairMojibake(s)).toBe(s);
      expect(repairMojibakeDetailed(s).repaired).toBe(false);
    }
  });

  it('只修復亂碼片段，保留已經正確的文字', () => {
    const mixed = `已正確的中文 ${toMojibake('亂碼片段')} 結尾`;
    expect(repairMojibake(mixed)).toBe('已正確的中文 亂碼片段 結尾');
  });

  it('無法還原的內容保留原樣', () => {
    const truncated = 'æ\u0094'; // 不完整的 UTF-8 序列
    expect(repairMojibake(truncated)).toBe(truncated);
    const invalid = 'abcÿþxyz';
    expect(repairMojibake(invalid)).toBe(invalid);
  });

  it('保留網址與 hashtag 等 ASCII 內容', () => {
    const original = '試試這款 👉 https://example.com/x?a=1\n#標籤 #tag';
    expect(repairMojibake(toMojibake(original))).toBe(original);
  });

  it('重複修復是安全的（冪等）', () => {
    const once = repairMojibake(toMojibake('改網頁'));
    expect(repairMojibake(once)).toBe('改網頁');
  });
});
